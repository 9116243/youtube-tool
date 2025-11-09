import { proxyActivities } from '@temporalio/workflow';
import { ActivityCancellationType } from '@temporalio/common';
import { env } from '../utils/env.js';
import { prisma } from '../db/prisma.js';
import { metrics } from '../metrics/index.js';
import { recordTaskEvent } from '../services/task-event.js';
import { emitSseUpdate } from '../orchestration/temporal/bridge.js';
import { cpuActivities, gpuActivities } from '../orchestration/temporal/activities/index.js';
import {
  SHOT_STAGES,
  ShotArtifacts,
  TemporalPipelineInput,
  ShotStage
} from '../orchestration/temporal/types.js';
import { ensureShotWorkspace, loadStageMetadata } from '../orchestration/temporal/helpers.js';

const stageTimeoutMs = env.STAGE_TIMEOUT_SEC * 1000;
const heartbeatMs = env.HEARTBEAT_SEC * 1000;
const cancellationType = env.PREEMPTIBLE ? ActivityCancellationType.TRY_CANCEL : ActivityCancellationType.ABANDON;

const cpuActivityOptions = {
  startToCloseTimeout: stageTimeoutMs,
  heartbeatTimeout: heartbeatMs,
  scheduleToCloseTimeout: stageTimeoutMs,
  taskQueue: env.TEMPORAL_TASK_QUEUE_CPU,
  cancellationType
};

const gpuActivityOptions = {
  startToCloseTimeout: stageTimeoutMs,
  heartbeatTimeout: heartbeatMs,
  scheduleToCloseTimeout: stageTimeoutMs,
  taskQueue: env.TEMPORAL_TASK_QUEUE_GPU,
  cancellationType
};

const cpu = proxyActivities<typeof cpuActivities>(cpuActivityOptions);
const gpu = proxyActivities<typeof gpuActivities>(gpuActivityOptions);

type StageResult<T extends ShotStage> = ShotArtifacts[T];

type ShotState = {
  workspace: string;
  completed: Set<ShotStage>;
  artifacts: Partial<ShotArtifacts>;
};

const buildPayload = (taskId: string, progress: number, stage: string, shotId: string) => ({
  id: taskId,
  taskId,
  status: progress === 100 ? 'success' : 'running',
  progress,
  phase: 'PIPE',
  step: stage.toUpperCase(),
  metrics: { shotId }
});

const hydrateStage = async <T extends ShotStage>(state: ShotState, stage: T) => {
  const data = await loadStageMetadata<StageResult<T>>(state.workspace, stage);
  if (data) {
    state.completed.add(stage);
    state.artifacts[stage] = data as ShotArtifacts[T];
    return 1;
  }
  return 0;
};

export const pipelineWorkflow = async (input: TemporalPipelineInput) => {
  const totalStages = input.shots.length * SHOT_STAGES.length;
  let completedStages = 0;
  const shotStates: Record<string, ShotState> = {};
  const shotResults: Record<string, ShotArtifacts> = {};

  const ensureState = async (shotId: string) => {
    const existing = shotStates[shotId];
    if (existing) return existing;
    const workspace = await ensureShotWorkspace(input.taskId, shotId);
    const state: ShotState = { workspace, completed: new Set(), artifacts: {} as Partial<ShotArtifacts> };
    shotStates[shotId] = state;
    for (const stage of SHOT_STAGES) {
      completedStages += await hydrateStage(state, stage);
    }
    return state;
  };

  const progressValue = () => Math.min(99, Math.round((completedStages / totalStages) * 100));

  const updateParent = async (stage: ShotStage, shotId: string, status: string) => {
    const progress = progressValue();
    await prisma.task.update({
      where: { id: input.taskId },
      data: {
        status,
        progress,
        result: JSON.stringify({
          phase: 'PIPE',
          step: stage,
          metrics: { shotId, progress }
        })
      }
    });
    await emitSseUpdate(buildPayload(input.taskId, progress, stage, shotId));
  };

  const finalizeSuccess = async () => {
    await prisma.task.update({
      where: { id: input.taskId },
      data: {
        status: 'success',
        progress: 100,
        result: JSON.stringify({
          phase: 'PIPE',
          step: 'temporal.complete',
          metrics: { shots: Object.keys(shotResults).length }
        })
      }
    });
    metrics.tasksFinished.inc();
    await recordTaskEvent({
      taskId: input.taskId,
      organizationId: input.organizationId,
      type: 'task.completed',
      payload: { phase: 'PIPE', step: 'temporal.complete' },
      actor: 'temporal'
    });
    await emitSseUpdate({
      id: input.taskId,
      taskId: input.taskId,
      status: 'success',
      progress: 100,
      phase: 'PIPE',
      step: 'temporal.complete',
      metrics: { shots: Object.keys(shotResults).length }
    });
  };

  const finalizeFailure = async (error: unknown) => {
    const currentProgress = progressValue();
    await prisma.task.update({
      where: { id: input.taskId },
      data: {
        status: 'failed',
        progress: currentProgress,
        result: JSON.stringify({
          phase: 'PIPE',
          step: 'temporal.failed',
          metrics: { error: (error as Error).message ?? 'unknown failure', progress: currentProgress }
        })
      }
    });
    metrics.tasksFailed.inc();
    await recordTaskEvent({
      taskId: input.taskId,
      organizationId: input.organizationId,
      type: 'task.failed',
      payload: { phase: 'PIPE', step: 'temporal.failed', error: (error as Error).message ?? 'unknown failure' },
      actor: 'temporal'
    });
    await emitSseUpdate({
      id: input.taskId,
      taskId: input.taskId,
      status: 'failed',
      progress: currentProgress,
      phase: 'PIPE',
      step: 'temporal.failed',
      metrics: { error: (error as Error).message ?? 'unknown failure', progress: currentProgress }
    });
  };

  const executeShot = async (shot: TemporalPipelineInput['shots'][number]) => {
    const state = await ensureState(shot.id);
    for (const stage of SHOT_STAGES) {
      if (state.completed.has(stage)) {
        continue;
      }
      switch (stage) {
        case 'asr': {
          const asr = await cpu.asrShot({
            taskId: input.taskId,
            shot,
            workspace: state.workspace,
            audioSource: shot.inputAudio ?? shot.inputVideo
          });
          state.artifacts.asr = asr;
          break;
        }
        case 'tts': {
          const asr = state.artifacts.asr;
          if (!asr) {
            throw new Error('Missing ASR output');
          }
          const tts = await cpu.ttsShot({
            taskId: input.taskId,
            shot,
            workspace: state.workspace,
            srtPath: asr.srtPath
          });
          state.artifacts.tts = tts;
          break;
        }
        case 'burn': {
          const asr = state.artifacts.asr;
          const tts = state.artifacts.tts;
          if (!asr || !tts) {
            throw new Error('Burn stage requires ASR and TTS outputs');
          }
          const burn = await gpu.burnShot({
            taskId: input.taskId,
            shot,
            workspace: state.workspace,
            subtitlePath: asr.srtPath,
            audioPath: tts.wavPath,
            resolution: shot.resolution,
            bitrate: shot.bitrate,
            watermark: shot.watermark,
            provider: shot.provider,
            hwaccel: 'auto'
          });
          state.artifacts.burn = burn as ShotArtifacts['burn'];
          break;
        }
        case 'qc': {
          const burn = state.artifacts.burn;
          if (!burn) throw new Error('QC requires burn artifact');
          const qc = await cpu.qcShot({
            taskId: input.taskId,
            shot,
            workspace: state.workspace,
            burnedVideo: burn.outputPath
          });
          state.artifacts.qc = qc;
          break;
        }
        case 'upload': {
          const burn = state.artifacts.burn;
          if (!burn) throw new Error('Upload requires burn artifact');
          const upload = await cpu.uploadShot({
            taskId: input.taskId,
            shot,
            workspace: state.workspace,
            burnedVideo: burn.outputPath
          });
          state.artifacts.upload = upload;
          break;
        }
        case 'publish': {
          const upload = state.artifacts.upload;
          if (!upload) throw new Error('Publish requires upload artifact');
          const publish = await cpu.publishShot({
            taskId: input.taskId,
            shot,
            workspace: state.workspace,
            storagePath: upload.storagePath
          });
          state.artifacts.publish = publish;
          shotResults[shot.id] = state.artifacts as ShotArtifacts;
          break;
        }
        default:
          break;
      }
      state.completed.add(stage);
      completedStages += 1;
      await updateParent(stage, shot.id, 'running');
    }
  };

  const runShotWithRetry = async (shot: TemporalPipelineInput['shots'][number]) => {
    let attempt = 0;
    while (attempt < 2) {
      try {
        await executeShot(shot);
        return;
      } catch (error) {
        attempt += 1;
        if (attempt >= 2) {
          throw error;
        }
      }
    }
  };

  const concurrency = Math.max(1, Math.min(env.MAX_PAR_SHOTS, input.shots.length));

  const dispatch = async () => {
    const backlog = [...input.shots];
    const inflight: Promise<void>[] = [];
    while (backlog.length || inflight.length) {
      if (backlog.length && inflight.length < concurrency) {
        const shot = backlog.shift()!;
        const job = runShotWithRetry(shot)
          .catch((error) => {
            throw error;
          })
          .finally(() => {
            const idx = inflight.indexOf(job);
            if (idx >= 0) {
              inflight.splice(idx, 1);
            }
          });
        inflight.push(job);
      } else {
        await Promise.race(inflight);
      }
    }
    await Promise.all(inflight);
  };

  try {
    await dispatch();
    await finalizeSuccess();
    return { taskId: input.taskId, shots: shotResults };
  } catch (error) {
    await finalizeFailure(error);
    throw error;
  }
};
