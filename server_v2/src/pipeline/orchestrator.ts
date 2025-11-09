import { copyFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Task } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { metrics } from '../metrics/index.js';
import { ssePush, sseCloseAll } from '../sse.js';
import type { TaskStreamPayload } from '../sse.js';
import { assertTaskQuota, recordTaskUsage } from '../services/usage.js';
import { recordTaskEvent } from '../services/task-event.js';
import { recordAuditLog } from '../services/audit.js';
import { hashFingerprint, acquireIdempotencyLock, releaseIdempotencyLock } from '../services/idempotency.js';
import { createTask } from '../tasks/store.js';
import { ensureTaskDir, loadArtifacts, saveArtifacts } from '../tasks/artifacts.js';
import { absoluteToStorageUri, isStorageUri, storageUriToAbsolutePath } from '../storage/uri.js';
import { materializeStorageObject } from '../storage/object-store.js';
import { defaultTaskResult, mapTaskRecord, type TaskRecord } from '../tasks/models.js';
import type { TaskCreateInput } from '../tasks/models.js';
import type { ArtifactRecord } from '../tasks/models.js';
import type { HydratedTask } from '../tasks/runner.js';

type ResolutionId = '1080p' | '1440p' | '2160p' | 'source';

type PipelineParams = {
  kind: 'pipeline';
  inputVideo: string;
  resolution?: ResolutionId;
  bitrate?: number;
  language?: string;
  voiceId?: string;
  provider?: string;
  watermark?: Record<string, unknown>;
  hwaccel?: 'auto' | 'none';
};

type CreatePipelineOptions = {
  orgId: string;
  title: string;
  description?: string;
  preset?: string;
  params: PipelineParams;
  actorUserId?: string | null;
  actorServiceAccountId?: string | null;
};

type PipelineCreationResult = {
  task: TaskRecord;
  reused: boolean;
};

const PIPELINE_STAGES = ['subtitle', 'dubbing', 'burn'] as const;
type PipelineStage = (typeof PIPELINE_STAGES)[number];

const stageWeight = 100 / PIPELINE_STAGES.length;

const stageIndex = (stage: string | null | undefined) => {
  const index = PIPELINE_STAGES.indexOf((stage ?? '').toLowerCase() as PipelineStage);
  return index >= 0 ? index : 0;
};

const normalizeResolution = (value?: string): ResolutionId => {
  const normalized = (value ?? '1080p').toLowerCase();
  if (['1080p', '1440p', '2160p', 'source'].includes(normalized)) {
    return normalized as ResolutionId;
  }
  return '1080p';
};

const ensurePipelineParams = (params: PipelineParams): PipelineParams => ({
  ...params,
  resolution: normalizeResolution(params.resolution),
  hwaccel: params.hwaccel === 'none' ? 'none' : 'auto'
});

export const createPipelineTask = async (options: CreatePipelineOptions): Promise<PipelineCreationResult> => {
  const params = ensurePipelineParams(options.params);
  const fingerprint = hashFingerprint({
    orgId: options.orgId,
    inputVideo: params.inputVideo,
    resolution: params.resolution,
    bitrate: params.bitrate,
    voiceId: params.voiceId,
    provider: params.provider,
    watermark: params.watermark
  });
  const lockKey = `pipeline:${options.orgId}:${fingerprint}`;
  const lock = await acquireIdempotencyLock(lockKey);
  if (!lock) {
    const existing = await prisma.pipelineFingerprint.findUnique({
      where: {
        organizationId_fingerprint: {
          organizationId: options.orgId,
          fingerprint
        }
      },
      include: { task: true }
    });
    if (existing?.task) {
      return { task: mapTaskRecord(existing.task), reused: true };
    }
    throw new Error('PIPELINE_IN_PROGRESS');
  }
  try {
    const existing = await prisma.pipelineFingerprint.findUnique({
      where: {
        organizationId_fingerprint: {
          organizationId: options.orgId,
          fingerprint
        }
      },
      include: { task: true }
    });
    if (existing?.task) {
      return { task: mapTaskRecord(existing.task), reused: true };
    }

    await assertTaskQuota(options.orgId, 4);
    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          organizationId: options.orgId,
          title: options.title,
          description: options.description,
          preset: options.preset,
          params: JSON.stringify(params),
          status: 'running',
          progress: 0,
          result: JSON.stringify(defaultTaskResult)
        }
      });
      await tx.pipelineFingerprint.create({
        data: {
          organizationId: options.orgId,
          fingerprint,
          taskId: created.id
        }
      });
      return created;
    });

    metrics.tasksCreated.inc();
    await recordTaskUsage(options.orgId, 1);
    const taskRecord = mapTaskRecord(task);
    await recordTaskEvent({
      taskId: taskRecord.id,
      organizationId: options.orgId,
      type: 'task.created',
      actor: options.actorUserId,
      payload: { kind: 'pipeline', fingerprint }
    });
    await recordAuditLog({
      orgId: options.orgId,
      action: 'task.pipeline.created',
      target: taskRecord.id,
      payload: { fingerprint },
      actorUserId: options.actorUserId ?? null,
      actorServiceAccountId: options.actorServiceAccountId ?? null
    });

    ssePush(taskRecord.id, {
      id: taskRecord.id,
      status: 'running',
      progress: 0,
      phase: 'PIPE',
      step: 'init',
      metrics: { fingerprint }
    });

    void spawnPipelineChildren(taskRecord, params);

    return { task: taskRecord, reused: false };
  } finally {
    await releaseIdempotencyLock(lockKey);
  }
};

const spawnPipelineChildren = async (parent: TaskRecord, params: PipelineParams) => {
  const children: Array<{ stage: PipelineStage; taskId: string }> = [];
  const common = {
    organizationId: parent.organizationId,
    preset: parent.preset ?? undefined,
    description: `Pipeline stage of ${parent.id}`,
    parentTaskId: parent.id
  };

  const subtitleTask = await createChildTask({
    ...common,
    title: `${parent.title} / Subtitles`,
    params: {
      kind: 'subtitle',
      inputAudio: params.inputVideo,
      language: params.language
    },
    pipelineStage: 'subtitle'
  });
  children.push({ stage: 'subtitle', taskId: subtitleTask.id });
  metrics.tasksCreated.inc();
  await recordTaskUsage(parent.organizationId, 1);

  const dubbingTask = await createChildTask({
    ...common,
    title: `${parent.title} / Dubbing`,
    dependsOn: [subtitleTask.id],
    params: {
      kind: 'dubbing',
      provider: params.provider ?? 'mock',
      voiceId: params.voiceId,
      language: params.language,
      inputSubtitle: { from: subtitleTask.id, artifact: 'srt' }
    },
    pipelineStage: 'dubbing'
  });
  children.push({ stage: 'dubbing', taskId: dubbingTask.id });
  metrics.tasksCreated.inc();
  await recordTaskUsage(parent.organizationId, 1);

  const burnTask = await createChildTask({
    ...common,
    title: `${parent.title} / Burn`,
    dependsOn: [dubbingTask.id],
    params: {
      kind: 'burn',
      inputVideo: params.inputVideo,
      inputSubtitle: { from: subtitleTask.id, artifact: 'srt' },
      inputAudio: { from: dubbingTask.id, artifact: 'tts_wav' },
      resolution: params.resolution,
      bitrate: params.bitrate,
      watermark: params.watermark,
      hwaccel: params.hwaccel
    },
    pipelineStage: 'burn'
  });
  children.push({ stage: 'burn', taskId: burnTask.id });
  metrics.tasksCreated.inc();
  await recordTaskUsage(parent.organizationId, 1);

  await prisma.task.update({
    where: { id: parent.id },
    data: {
      params: JSON.stringify({
        ...(parent.params ?? {}),
        children
      })
    }
  });
};

const createChildTask = async (input: TaskCreateInput) => {
  const task = await createTask(input);
  await prisma.task.update({
    where: { id: task.id },
    data: { pipelineStage: input.pipelineStage ?? null, parentTaskId: input.parentTaskId ?? null }
  });
  task.pipelineStage = input.pipelineStage ?? null;
  task.parentTaskId = input.parentTaskId ?? null;
  return task;
};

export const notifyPipelineProgress = async (task: HydratedTask, payload: TaskStreamPayload) => {
  if (!task.parentTaskId || !task.pipelineStage) return;
  const stage = task.pipelineStage.toLowerCase();
  if (!PIPELINE_STAGES.includes(stage as PipelineStage)) return;

  const base = stageIndex(stage) * stageWeight;
  const fraction = (payload.progress ?? 0) / PIPELINE_STAGES.length;
  const derivedProgress =
    payload.status === 'success' && stage === 'burn'
      ? 100
      : Math.min(99, Math.round(base + fraction));

  const parentId = task.parentTaskId;
  const parentStatus =
    payload.status === 'failed' || payload.status === 'cancelled'
      ? 'failed'
      : payload.status === 'success' && stage === 'burn'
        ? 'success'
        : 'running';

  await prisma.task.update({
    where: { id: parentId },
    data: {
      status: parentStatus,
      progress: derivedProgress,
      result: JSON.stringify({
        phase: 'PIPE',
        step: stage,
        metrics: {
          child: task.id,
          childStatus: payload.status,
          childProgress: payload.progress
        }
      })
    }
  });

  ssePush(parentId, {
    id: parentId,
    status: parentStatus,
    progress: derivedProgress,
    phase: 'PIPE',
    step: stage,
    metrics: {
      child: task.id,
      childStatus: payload.status,
      childProgress: payload.progress
    }
  });

  if (payload.status === 'success') {
    if (stage === 'burn') {
      await finalizePipelineSuccess(parentId, task.id);
    }
  } else if (payload.status === 'failed' || payload.status === 'cancelled') {
    await finalizePipelineFailure(parentId, stage);
  }
};

const finalizePipelineSuccess = async (parentId: string, burnTaskId: string) => {
  const parent = await prisma.task.update({
    where: { id: parentId },
    data: { status: 'success', progress: 100 }
  });
  metrics.tasksFinished.inc();
  await recordTaskEvent({
    taskId: parent.id,
    organizationId: parent.organizationId,
    type: 'task.completed',
    payload: { phase: 'PIPE', step: 'burn_complete' },
    actor: 'pipeline'
  });

  await copyBurnArtifact(parentId, burnTaskId);

  ssePush(parentId, {
    id: parentId,
    status: 'success',
    progress: 100,
    phase: 'PIPE',
    step: 'complete',
    metrics: { child: burnTaskId }
  });
  sseCloseAll(parentId);
};

const finalizePipelineFailure = async (parentId: string, stage: string) => {
  const parent = await prisma.task.update({
    where: { id: parentId },
    data: { status: 'failed' }
  });
  metrics.tasksFailed.inc();
  await recordTaskEvent({
    taskId: parent.id,
    organizationId: parent.organizationId,
    type: 'task.failed',
    payload: { phase: 'PIPE', step: stage },
    actor: 'pipeline'
  });
  ssePush(parentId, {
    id: parentId,
    status: 'failed',
    progress: parent.progress ?? 0,
    phase: 'PIPE',
    step: stage,
    metrics: {}
  });
  sseCloseAll(parentId);
};

const copyBurnArtifact = async (parentId: string, burnTaskId: string) => {
  const artifacts = await loadArtifacts(burnTaskId);
  const video = artifacts.artifacts.video;
  if (!video?.path) {
    return;
  }
  const source = isStorageUri(video.path) ? await materializeStorageObject(video.path) : video.path;
  const workspace = await ensureTaskDir(parentId);
  const destination = join(workspace, 'out.mp4');
  await copyFile(source, destination);
  const fileStats = await stat(destination);
  const storagePath = absoluteToStorageUri(destination);
  const record: ArtifactRecord = {
    name: 'pipeline_output',
    path: storagePath,
    type: 'video/mp4',
    createdAt: new Date().toISOString(),
    size: fileStats.size,
    metadata: {
      fromTask: burnTaskId
    }
  };
  await saveArtifacts(parentId, { artifacts: { pipeline_output: record } });
};
