import { join, relative, resolve as resolvePath, extname } from 'node:path';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { ArtifactRecord } from './models.js';
import { ensureTaskDir, loadArtifacts, resolveInput, sanitizeName, saveArtifacts, type InputSpec } from './artifacts.js';
import { prisma } from '../db/prisma.js';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { HttpError } from '../utils/http-error.js';
import { sseCloseAll, ssePush, sseEmit } from '../sse.js';
import { fetchDependencies, getTask } from './store.js';
import { refreshQueueMetrics } from '../lib/queue-metrics.js';
import { transcribeAudio } from '../features/asr.js';
import { synthesizeSpeech } from '../features/tts.js';
import { synthesizeTts, type TtsLine } from '../providers/tts/index.js';
import { runBurnPipeline } from '../pipeline/burn.js';
import { runGenVideo } from '../gen/orchestrator.js';
import { runGenEffect } from '../gen/effects.js';
import { createPipelineTask, notifyPipelineProgress } from '../pipeline/orchestrator.js';
import {
  dequeueJob,
  enqueueTask,
  acknowledgeJob,
  failJob,
  releaseJob,
  reportJobProgress
} from '../queue/index.js';
import { recordTaskEvent, type TaskEventType } from '../services/task-event.js';
import { triggerTaskWebhook } from '../routes/webhook.js';
import { notifyTaskStatus } from '../notify/index.js';
import type { QueueJob } from '../queue/driver.js';
import { recordMetric } from '../worker/metrics.js';
import { recordQueueDeadletter, recordQueueFailed, recordQueueRetry } from '../metrics/queue.js';
import { absoluteToStorageUri, isStorageUri } from '../storage/uri.js';
import { materializeStorageObject } from '../storage/object-store.js';
import { assertRenderQuota, recordRenderUsage } from '../services/usage.js';
import { assessBurnQuality, type BurnQualityMetrics } from '../services/quality-gate.js';
import { getFlag } from '../services/flags.js';
import { isWorkerChild, emitToMaster } from '../worker/ipc.js';
import { recordInlineHeartbeat } from '../worker/state.js';

export type HydratedTask = Exclude<Awaited<ReturnType<typeof getTask>>, null>;

type StepHelpers = {
  report: (fraction: number, eta?: string) => Promise<void>;
};

type PipelineStep = {
  key: string;
  label: string;
  weight: number;
  mode?: 'auto' | 'manual';
  onComplete?: (ctx: ExecutionContext, helpers: StepHelpers) => Promise<void> | void;
};

type Pipeline = {
  name: string;
  steps: PipelineStep[];
  initialStep?: string;
};

type ExecutionContext = {
  job: QueueJob;
  task: HydratedTask;
  pipeline: Pipeline;
  workspace: string;
  artifacts: Record<string, ArtifactRecord>;
  inputPath?: string;
  scratch: Record<string, unknown>;
};

const logTaskEvent = (ctx: ExecutionContext, type: TaskEventType, payload?: Record<string, unknown>) => {
  void recordTaskEvent({
    taskId: ctx.task.id,
    organizationId: ctx.task.organizationId,
    type,
    payload,
    actor: 'worker'
  });
};

type TaskStatus = 'queued' | 'running' | 'paused' | 'success' | 'failed' | 'cancelled';

const STEP_DELAY_MIN = 250;
const STEP_DELAY_RANGE = 150;
const RETRY_BASE_MS = env.QUEUE_RETRY_BASE_MS ?? 1000;
const RETRY_MAX_MS = env.QUEUE_RETRY_MAX_MS ?? 30000;

const computeRetryDelay = (attempt: number) => {
  const base = RETRY_BASE_MS * 2 ** attempt;
  const capped = Math.min(base, RETRY_MAX_MS);
  return capped + Math.round(Math.random() * RETRY_BASE_MS * Math.random());
};

const toInputSpec = (value: unknown): InputSpec | undefined => {
  if (typeof value === 'string' && value.length) {
    return value;
  }
  if (value && typeof value === 'object') {
    const candidate = value as { from?: string; artifact?: string };
    if (typeof candidate.from === 'string' && typeof candidate.artifact === 'string') {
      return { from: candidate.from, artifact: candidate.artifact };
    }
  }
  return undefined;
};

const hasAttemptsRemaining = (job: QueueJob) => job.attempts + 1 < job.maxAttempts;

let shuttingDown = false;

const shouldRetryGenError = (code?: string | null) =>
  code === 'GEN_RATE_LIMIT' || code === 'GEN_TIMEOUT' || code === 'GEN_PROVIDER_ERROR';

const touchWorkerHeartbeat = () => {
  if (isWorkerChild()) {
    const slot = Number(process.env.WORKER_SLOT ?? '-1');
    emitToMaster({ type: 'heartbeat', slot: Number.isNaN(slot) ? undefined : slot });
  } else {
    recordInlineHeartbeat();
  }
};

const PIPELINES: Record<string, Pipeline> = {
  ASR: {
    name: 'ASR',
    steps: [
      { key: 'asr_init', label: 'ASR warmup', weight: 5 },
      { key: 'asr_transcribe', label: 'ASR transcription', weight: 25 },
      {
        key: 'asr_post',
        label: 'ASR post-process',
        weight: 5,
        onComplete: async (ctx) => {
          const params = (ctx.task.params ?? {}) as Record<string, unknown>;
          const inputAudioSpec = toInputSpec(params.inputAudio);
          if (!inputAudioSpec) {
            throw new Error('ASR task is missing inputAudio');
          }
          const audioPath = await resolveInput(inputAudioSpec);
          const language = typeof params.language === 'string' ? params.language : undefined;
          const providerOverride = resolveProviderOverride(params, 'asr');
          const transcription = await transcribeAudio({
            taskId: ctx.task.id,
            workspace: ctx.workspace,
            inputAudio: audioPath,
            language,
            provider: providerOverride
          });
          await registerArtifact(ctx, 'srt', transcription.srtPath, 'text/plain', transcription.sizeBytes, {
            ...transcription.metrics,
            segments: transcription.segments.length
          });
        }
      }
    ]
  },
  TTS: {
    name: 'TTS',
    steps: [
      { key: 'tts_init', label: 'TTS warmup', weight: 5 },
      {
        key: 'tts_synthesize',
        label: 'TTS synthesis',
        weight: 25,
        onComplete: async (ctx) => {
          const params = (ctx.task.params ?? {}) as Record<string, unknown>;
          const text =
            (typeof params.text === 'string' && params.text.trim()) ||
            (typeof params.script === 'string' && params.script.trim()) ||
            ctx.task.description ||
            ctx.task.title;
          const subtitleInputSpec = toInputSpec(params.inputSubtitle);
          const subtitleInput = subtitleInputSpec ? await resolveInput(subtitleInputSpec) : undefined;
          const language = typeof params.language === 'string' ? params.language : undefined;
          const providerOverride = resolveProviderOverride(params, 'tts');
          const voiceOverride = typeof params.voiceId === 'string' && params.voiceId.trim().length ? params.voiceId : undefined;
          const speech = await synthesizeSpeech({
            taskId: ctx.task.id,
            workspace: ctx.workspace,
            text: text ?? undefined,
            srtPath: subtitleInput,
            language,
            voiceId: voiceOverride ?? env.ELEVENLABS_VOICE_ID,
            provider: providerOverride
          });
          await registerArtifact(ctx, 'tts_wav', speech.wavPath, 'audio/wav', speech.sizeBytes, {
            ...speech.metrics,
            durationSeconds: speech.durationSeconds,
            sampleRate: speech.sampleRate,
            chars: text?.length ?? 0
          });
        }
      },
      {
        key: 'tts_post',
        label: 'TTS cleanup',
        weight: 5,
        onComplete: async (ctx) => {
          const journal = {
            generatedAt: new Date().toISOString(),
            sampleRate: env.TTS_SAMPLE_RATE
          };
          const payload = JSON.stringify(journal, null, 2);
          const fileName = `${sanitizeName(ctx.task.title ?? ctx.task.id)}_tts.json`;
          const filePath = join(ctx.workspace, fileName);
          await writeFile(filePath, payload, 'utf8');
          await registerArtifact(ctx, 'journal', filePath, 'application/json', Buffer.byteLength(payload));
        }
      }
    ]
  },
  DUBBING: {
    name: 'DUBBING',
    steps: [
      {
        key: 'tts_init',
        label: 'Prepare subtitles',
        weight: 5,
        onComplete: async (ctx) => {
          await ensureDubbingInputs(ctx);
        }
      },
      {
        key: 'tts_synthesize',
        label: 'Synthesize speech',
        weight: 80,
        mode: 'manual',
        onComplete: async (ctx, helpers) => {
          const dubbing = await ensureDubbingInputs(ctx);
          const lines = dubbing.lines ?? [];
          const result = await synthesizeTts(lines, {
            provider: dubbing.provider,
            voiceId: dubbing.voiceId,
            language: dubbing.language,
            sampleRate: env.TTS_SAMPLE_RATE,
            outputPath: join(ctx.workspace, 'tts.wav'),
            concurrency: 4,
            onSegment: async ({ index, total }) => {
              await helpers.report(total > 0 ? index / total : 1, `${Math.max(0, total - index)}s`);
            }
          });
          dubbing.wavPath = result.wavPath;
          dubbing.durationSeconds = result.durationSeconds;
          dubbing.sampleRate = result.sampleRate;
        }
      },
      {
        key: 'tts_merge',
        label: 'Merge segments',
        weight: 10,
        onComplete: async (ctx) => {
          const dubbing = await ensureDubbingInputs(ctx);
          if (!dubbing.wavPath) {
            throw new Error('No synthesized audio found for dubbing task');
          }
        }
      },
      {
        key: 'tts_post',
        label: 'Finalize',
        weight: 5,
        onComplete: async (ctx) => {
          const dubbing = await ensureDubbingInputs(ctx);
          if (!dubbing.wavPath) {
            throw new Error('No synthesized audio found for dubbing task');
          }
          const stats = await stat(dubbing.wavPath);
          await registerArtifact(ctx, 'tts_wav', dubbing.wavPath, 'audio/wav', stats.size, {
            durationSeconds: dubbing.durationSeconds,
            sampleRate: dubbing.sampleRate ?? env.TTS_SAMPLE_RATE
          });
        }
      }
    ]
  },
  BURN: {
    name: 'BURN',
    steps: [
      {
        key: 'burn_init',
        label: 'Prepare sources',
        weight: 5,
        onComplete: async (ctx) => {
          await ensureBurnInputs(ctx);
        }
      },
      {
        key: 'burn_transcode',
        label: 'Transcode',
        weight: 85,
        mode: 'manual',
        onComplete: async (ctx, helpers) => {
          const burn = await ensureBurnInputs(ctx);
          await assertRenderQuota(ctx.task.organizationId);
          const maxQualityRetries = Math.max(0, env.RENDER_RETRY_MAX ?? 0);
          const enforceQuality = await getFlag('quality.enforce', ctx.task.organizationId, true);
          let retryPending = false;

          do {
            burn.attempts = (burn.attempts ?? 0) + 1;
            await helpers.report(0, retryPending ? 'quality_retry' : 'preparing');
            retryPending = false;

            const result = await runBurnPipeline({
              taskId: ctx.task.id,
              workspace: ctx.workspace,
              inputVideo: burn.videoPath ?? '',
              inputAudio: burn.audioPath ?? undefined,
              inputSubtitle: burn.subtitlePath ?? undefined,
              resolution: burn.resolution,
              bitrateKbps: burn.bitrateKbps,
              watermark: burn.watermark ?? undefined,
              hwaccel: burn.hwaccel,
              onProgress: async (fraction, etaSeconds) => {
                const eta =
                  typeof etaSeconds === 'number' && Number.isFinite(etaSeconds)
                    ? `${Math.max(0, Math.round(etaSeconds))}s`
                    : 'processing';
                await helpers.report(fraction, eta);
              }
            });

            burn.outputPath = result.outputPath;
            burn.sizeBytes = result.sizeBytes;
            burn.durationSeconds = result.durationSeconds;
            burn.width = result.width;
            burn.height = result.height;
            burn.bitrateActual = result.bitrateKbps;

            const assessment = await assessBurnQuality({
              enforce: enforceQuality,
              originalVideo: burn.videoPath,
              outputVideo: burn.outputPath
            });
            burn.quality = assessment.metrics;
            burn.lastQualityReason = assessment.reason ?? null;

            if (typeof assessment.metrics.vmaf === 'number') {
              recordMetric('renderVmaf', 'observe', assessment.metrics.vmaf);
            }
            if (typeof assessment.metrics?.loudness?.outputIntegrated === 'number') {
              recordMetric('renderLoudness', 'observe', assessment.metrics.loudness.outputIntegrated);
            }

            if (assessment.shouldRetry && burn.attempts <= maxQualityRetries) {
              retryPending = true;
              recordMetric('renderRetries', 'inc', 1);
              burn.bitrateKbps = Math.round((burn.bitrateKbps ?? result.bitrateKbps ?? 8000) * 1.2);
              await recordTaskEvent({
                taskId: ctx.task.id,
                organizationId: ctx.task.organizationId,
                type: 'task.retry',
                payload: { reason: assessment.reason ?? 'quality_gate', attempt: burn.attempts },
                actor: 'worker'
              });
              continue;
            }

            if (assessment.shouldRetry && burn.attempts > maxQualityRetries) {
              logger.warn(
                { taskId: ctx.task.id, reason: assessment.reason },
                'Quality gate triggered but retry limit reached'
              );
            }

            await recordRenderUsage(ctx.task.organizationId, result.durationSeconds ?? 0);
            break;
          } while (retryPending);
        }
      },
      {
        key: 'burn_post',
        label: 'Finalize',
        weight: 10,
        onComplete: async (ctx) => {
          const burn = await ensureBurnInputs(ctx);
          if (!burn.outputPath) {
            throw new Error('Burn output missing');
          }
          const journal = {
            generatedAt: new Date().toISOString(),
            resolution: burn.resolution,
            durationSeconds: burn.durationSeconds ?? null,
            width: burn.width ?? null,
            height: burn.height ?? null,
            bitrateKbps: burn.bitrateActual ?? null,
            attempts: burn.attempts ?? 1,
            quality: burn.quality ?? null,
            qualityReason: burn.lastQualityReason ?? null
          };
          const payload = JSON.stringify(journal, null, 2);
          const fileName = `${sanitizeName(ctx.task.title ?? ctx.task.id)}_burn.json`;
          const filePath = join(ctx.workspace, fileName);
          await writeFile(filePath, payload, 'utf8');
          await registerArtifact(ctx, 'journal', filePath, 'application/json', Buffer.byteLength(payload));
          await registerOutputArtifact(ctx);
        }
      }
    ]
  },
  GEN: {
    name: 'GEN',
    initialStep: 'prepare',
    steps: [
      {
        key: 'generate',
        label: 'Generate video',
        weight: 100,
        mode: 'manual',
        onComplete: async (ctx) => {
          const artifacts = await runGenVideo({
            id: ctx.task.id,
            organizationId: ctx.task.organizationId,
            params: ctx.task.params
          });
          ctx.artifacts = { ...(ctx.artifacts ?? {}), ...artifacts };
        }
      }
    ]
  },
  GEN_EFFECT: {
    name: 'GEN',
    steps: [
      { key: 'effect_prepare', label: 'Prepare effect', weight: 10 },
      {
        key: 'effect_apply',
        label: 'Apply effect',
        weight: 80,
        mode: 'manual',
        onComplete: async (ctx) => {
          const artifacts = await runGenEffect({
            id: ctx.task.id,
            organizationId: ctx.task.organizationId,
            params: ctx.task.params
          });
          ctx.artifacts = { ...(ctx.artifacts ?? {}), ...artifacts };
        }
      },
      { key: 'effect_finalize', label: 'Finalize effect', weight: 10 }
    ]
  }
};

const activeTasks = new Set<string>();
const pausedTasks = new Set<string>();
const cancelledTasks = new Set<string>();
let runnerTimer: NodeJS.Timeout | null = null;
let runningWorkers = 0;
const taskStartTimes = new Map<string, number>();

const randomDelay = () => STEP_DELAY_MIN + Math.floor(Math.random() * STEP_DELAY_RANGE);

const determinePipelineKey = (task: HydratedTask) => {
  const candidate = extractKey(task.params?.pipeline) ?? extractKey(task.params?.kind) ?? extractKey(task.preset);
  if (!candidate) return 'ASR';
  if (candidate.includes('GEN_EFFECT')) return 'GEN_EFFECT';
  if (candidate.includes('GEN')) return 'GEN';
  if (candidate.includes('TTS')) return 'TTS';
  if (candidate.includes('DUB')) return 'DUBBING';
  if (candidate.includes('BURN')) return 'BURN';
  if (candidate.includes('ASR')) return 'ASR';
  return 'ASR';
};

const extractKey = (value: unknown) => (typeof value === 'string' && value.trim().length ? value.trim().toUpperCase() : null);

const hashFile = async (filePath: string) =>
  new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const resolveProviderOverride = (params: Record<string, unknown> | undefined, key: 'asr' | 'tts') => {
  if (!params) return undefined;
  const raw = (params as Record<string, unknown>).provider;
  if (typeof raw === 'string' && raw.trim().length) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    const scoped = (raw as Record<string, unknown>)[key];
    if (typeof scoped === 'string' && scoped.trim().length) {
      return scoped;
    }
  }
  return undefined;
};

const registerArtifact = async (
  ctx: ExecutionContext,
  key: string,
  filePath: string,
  type: string,
  size: number,
  metadata?: Record<string, unknown>
) => {
  const storagePath = absoluteToStorageUri(filePath);
  const fileHash = await hashFile(filePath).catch((error) => {
    logger.warn({ err: error, filePath }, 'Failed to hash artifact, continuing without hash');
    return null;
  });
  const record: ArtifactRecord = {
    name: key,
    path: storagePath,
    type,
    size,
    createdAt: new Date().toISOString(),
    metadata: {
      ...(metadata ?? {}),
      ...(fileHash ? { hash: fileHash } : {})
    }
  };
  ctx.artifacts = (await saveArtifacts(ctx.task.id, { artifacts: { [key]: record } })).artifacts;
};

const registerOutputArtifact = async (ctx: ExecutionContext) => {
  const burn = getBurnState(ctx);
  if (!burn.outputPath) return 0;
  const fileStats = await stat(burn.outputPath);
  await registerArtifact(ctx, 'video', burn.outputPath, 'video/mp4', fileStats.size, {
    durationSeconds: burn.durationSeconds,
    width: burn.width,
    height: burn.height,
    bitrateKbps: burn.bitrateActual,
    quality: burn.quality ?? null,
    qualityReason: burn.lastQualityReason ?? null
  });
  return fileStats.size;
};

const resolveOptionalInput = async (spec: unknown) => {
  if (typeof spec === 'string') {
    return resolvePath(process.cwd(), spec);
  }
  if (spec && typeof spec === 'object' && 'from' in spec && 'artifact' in spec) {
    const ref = spec as { from: string; artifact: string };
    return resolveInput({ from: ref.from, artifact: ref.artifact });
  }
  return undefined;
};

const resolveMediaInput = async (input: unknown): Promise<string | null> => {
  if (!input) return null;
  if (typeof input === 'string') {
    if (isStorageUri(input)) {
      return materializeStorageObject(input);
    }
    return resolvePath(process.cwd(), input);
  }
  if (typeof input === 'object' && input && 'from' in input && 'artifact' in input) {
    const ref = input as { from: string; artifact: string };
    return resolveInput({ from: ref.from, artifact: ref.artifact });
  }
  return null;
};

type DubbingState = {
  initialized?: boolean;
  subtitlePath?: string;
  lines?: TtsLine[];
  provider?: string;
  voiceId?: string;
  language?: string;
  wavPath?: string;
  durationSeconds?: number;
  sampleRate?: number;
};

type BurnWatermark = {
  path: string;
  opacity?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
};

type BurnState = {
  initialized?: boolean;
  videoPath?: string;
  audioPath?: string | null;
  subtitlePath?: string | null;
  watermark?: BurnWatermark | null;
  resolution: '1080p' | '1440p' | '2160p' | 'source';
  bitrateKbps?: number;
  hwaccel: 'auto' | 'none';
  attempts?: number;
  outputPath?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  bitrateActual?: number;
  quality?: BurnQualityMetrics | null;
  lastQualityReason?: string | null;
};

const getDubbingState = (ctx: ExecutionContext): DubbingState => {
  if (!ctx.scratch.dubbing) {
    ctx.scratch.dubbing = {};
  }
  return ctx.scratch.dubbing as DubbingState;
};

const getBurnState = (ctx: ExecutionContext): BurnState => {
  if (!ctx.scratch.burn) {
    ctx.scratch.burn = {};
  }
  return ctx.scratch.burn as BurnState;
};

const ensureBurnInputs = async (ctx: ExecutionContext) => {
  const burn = getBurnState(ctx);
  if (burn.initialized) {
    return burn;
  }
  const params = (ctx.task.params ?? {}) as Record<string, unknown>;
  const videoPath = await resolveMediaInput(params.inputVideo ?? ctx.inputPath ?? null);
  if (!videoPath) {
    throw new Error('Burn task requires inputVideo');
  }
  const audioPath = await resolveMediaInput((params as Record<string, unknown>).inputAudio ?? null);
  const subtitlePath = await resolveMediaInput(params.inputSubtitle ?? null);
  let watermark: BurnState['watermark'] = null;
  if (params.watermark && typeof params.watermark === 'object') {
    const wm = params.watermark as Record<string, unknown>;
    const wmPath = await resolveMediaInput(wm.path ?? null);
    if (wmPath) {
      const allowedPositions = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
      const positionValue = typeof wm.position === 'string' ? wm.position : undefined;
      const position =
        typeof positionValue === 'string' && allowedPositions.has(positionValue)
          ? (positionValue as BurnWatermark['position'])
          : undefined;
      watermark = {
        path: wmPath,
        opacity: typeof wm.opacity === 'number' ? wm.opacity : undefined,
        position
      };
    }
  }
  const resolutionRaw = typeof params.resolution === 'string' ? params.resolution.toLowerCase() : '1080p';
  const allowedResolutions = new Set(['1080p', '1440p', '2160p', 'source']);
  const resolution = allowedResolutions.has(resolutionRaw) ? (resolutionRaw as BurnState['resolution']) : '1080p';
  const bitrate =
    typeof params.bitrate === 'number'
      ? params.bitrate
      : typeof params.bitrate === 'string'
        ? Number(params.bitrate)
        : undefined;
  burn.videoPath = videoPath;
  burn.audioPath = audioPath ?? null;
  burn.subtitlePath = subtitlePath ?? null;
  burn.watermark = watermark;
  burn.resolution = resolution;
  burn.bitrateKbps = Number.isFinite(bitrate) ? Number(bitrate) : undefined;
  burn.hwaccel = params.hwaccel === 'none' ? 'none' : 'auto';
  burn.attempts = 0;
  burn.initialized = true;
  return burn;
};

const parseTimestamp = (value: string) => {
  const sanitized = value.replace(',', '.');
  const parts = sanitized.split(':');
  if (parts.length < 3) return undefined;
  const secondsParts = parts[2].split('.');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = Number(secondsParts[0]);
  const millis = Number(secondsParts[1] ?? 0);
  if ([hours, minutes, seconds, millis].some((n) => Number.isNaN(n))) return undefined;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
};

const parseSrtContents = (raw: string): TtsLine[] => {
  const blocks = raw
    .replace(/\r/g, '')
    .trim()
    .split(/\n{2,}/);
  const lines: TtsLine[] = [];
  for (const block of blocks) {
    const rows = block.split('\n').filter(Boolean);
    if (!rows.length) continue;
    let pointer = 0;
    if (/^\d+$/.test(rows[0])) {
      pointer = 1;
    }
    const cue = rows[pointer]?.match(/(.+?)\s+-->\s+(.+)/);
    let start: number | undefined;
    let end: number | undefined;
    if (cue) {
      start = parseTimestamp(cue[1]?.trim() ?? '');
      end = parseTimestamp(cue[2]?.trim() ?? '');
      pointer += 1;
    }
    const text = rows
      .slice(pointer)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length === 0) continue;
    lines.push({ text, start, end });
  }
  return lines;
};

const parseVttContents = (raw: string): TtsLine[] => {
  const rows = raw.replace(/\r/g, '').split('\n');
  const lines: TtsLine[] = [];
  let buffer: { start?: number; end?: number; text: string[] } | null = null;

  const flush = () => {
    if (buffer && buffer.text.length) {
      const text = buffer.text.join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text.length) {
        lines.push({ text, start: buffer.start, end: buffer.end });
      }
    }
    buffer = null;
  };

  for (const rawLine of rows) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith('WEBVTT')) continue;
    const cue = line.match(/(.+?)\s+-->\s+(.+)/);
    if (cue) {
      flush();
      buffer = {
        start: parseTimestamp(cue[1]?.trim() ?? ''),
        end: parseTimestamp(cue[2]?.trim() ?? ''),
        text: []
      };
      continue;
    }
    if (!buffer) {
      buffer = { text: [] };
    }
    buffer.text.push(line);
  }
  flush();
  return lines;
};

const loadSubtitleLines = async (filePath: string) => {
  const contents = await readFile(filePath, 'utf8');
  const extension = extname(filePath).toLowerCase();
  if (extension === '.vtt') {
    return parseVttContents(contents);
  }
  return parseSrtContents(contents);
};

const ensureDubbingInputs = async (ctx: ExecutionContext) => {
  const dubbing = getDubbingState(ctx);
  if (dubbing.initialized) {
    return dubbing;
  }
  const params = (ctx.task.params ?? {}) as Record<string, unknown>;
  const subtitlePath = await resolveMediaInput(params.inputSubtitle ?? null);
  if (!subtitlePath) {
    throw new Error('Dubbing task requires inputSubtitle');
  }
  const lines = await loadSubtitleLines(subtitlePath);
  const providerOverride = resolveProviderOverride(params, 'tts');
  const directProvider = typeof params.provider === 'string' ? params.provider : undefined;
  dubbing.subtitlePath = subtitlePath;
  dubbing.lines = lines;
  dubbing.provider = directProvider ?? providerOverride;
  dubbing.voiceId = typeof params.voiceId === 'string' ? params.voiceId : undefined;
  dubbing.language = typeof params.language === 'string' ? params.language : undefined;
  dubbing.initialized = true;
  return dubbing;
};

type DependencyState =
  | { state: 'ready' }
  | { state: 'waiting' }
  | { state: 'upstream_failed'; upstreamId: string };

const dependenciesSatisfied = async (task: HydratedTask): Promise<DependencyState> => {
  const deps = Array.isArray(task.dependsOn) ? task.dependsOn : [];
  if (!deps.length) return { state: 'ready' };
  const upstream = await fetchDependencies(deps);
  if (upstream.length !== deps.length) {
    return { state: 'waiting' };
  }
  const failed = upstream.find((item) => item.status === 'failed' || item.status === 'cancelled');
  if (failed) {
    return { state: 'upstream_failed', upstreamId: failed.id };
  }
  const incomplete = upstream.find((item) => item.status !== 'success');
  if (incomplete) {
    return { state: 'waiting' };
  }
  return { state: 'ready' };
};

const stateMetrics = (
  ctx: ExecutionContext,
  phase: string,
  step: string,
  progress: number
) => {
  const summary: Record<string, unknown> = {
    phase,
    step,
    input: ctx.inputPath ? relative(process.cwd(), ctx.inputPath) : undefined
  };
  const scratch = ctx.scratch ?? {};
  const lastErrorCode =
    typeof scratch['lastErrorCode'] === 'string' ? (scratch['lastErrorCode'] as string) : undefined;
  if (lastErrorCode) {
    summary.errorCode = lastErrorCode;
  }
  const lastErrorMessage =
    typeof scratch['lastErrorMessage'] === 'string'
      ? (scratch['lastErrorMessage'] as string)
      : undefined;
  if (lastErrorMessage) {
    summary.errorMessage = lastErrorMessage;
  }
  const burn = (ctx.scratch?.burn as BurnState | undefined) ?? undefined;
  if (typeof burn?.durationSeconds === 'number') {
    summary.durationSeconds = Number(burn.durationSeconds.toFixed(2));
  }
  if (burn?.width) {
    summary.width = burn.width;
  }
  if (burn?.height) {
    summary.height = burn.height;
  }
  if (typeof burn?.bitrateActual === 'number') {
    summary.bitrateKbps = burn.bitrateActual;
  }
  if (burn?.resolution) {
    summary.resolution = burn.resolution;
  }
  if (typeof burn?.attempts === 'number') {
    summary.renderAttempts = burn.attempts;
  }
  return summary;
};

const handleUpstreamFailure = async (task: HydratedTask, upstreamId?: string) => {
  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: 'failed',
      progress: 0,
      eta: '0s',
      result: JSON.stringify({
        ...(task.result ?? {}),
        reason: 'upstream_failed',
        upstreamId
      })
    }
  });
  recordMetric('tasksFailed', 'inc', 1);
  const files = Object.values((await loadArtifacts(task.id)).artifacts ?? {});
  ssePush(task.id, {
    id: task.id,
    status: 'failed',
    progress: 0,
    eta: '0s',
    phase: 'blocked',
    step: 'upstream_failed',
    metrics: { upstreamId },
    files
  });
  sseCloseAll(task.id);
  await refreshQueueMetrics();
  void recordTaskEvent({
    taskId: task.id,
    organizationId: task.organizationId,
    type: 'task.deadletter',
    payload: { reason: 'upstream_failed', upstreamId },
    actor: 'worker'
  });
};

const pushState = async (
  ctx: ExecutionContext,
  status: TaskStatus,
  progress: number,
  eta: string,
  phase: string,
  step: string
) => {
  const metrics = stateMetrics(ctx, phase, step, progress);
  const files = Object.values(ctx.artifacts ?? {});
  const previousStatus = ctx.task.status;
  ctx.task.status = status;
  ctx.task.progress = progress;
  ctx.task.eta = eta;
  ctx.task.result = { phase, step, metrics };
  await prisma.task.update({
    where: { id: ctx.task.id },
    data: { status, progress, eta, result: JSON.stringify({ phase, step, metrics }) }
  });
  await reportJobProgress(ctx.job.id, progress);
  ssePush(ctx.task.id, { id: ctx.task.id, status, progress, eta, phase, step, metrics, files });
  void notifyPipelineProgress(ctx.task, { id: ctx.task.id, status, progress, eta, phase, step, metrics, files });
  if (previousStatus !== status) {
    logTaskEvent(ctx, 'task.status', { from: previousStatus, to: status, phase, step });
  }
  const bucket = Math.floor(progress / 10);
  const lastBucket =
    typeof ctx.scratch.lastProgressBucket === 'number' ? (ctx.scratch.lastProgressBucket as number) : -1;
  if (bucket !== lastBucket) {
    ctx.scratch.lastProgressBucket = bucket;
    void recordTaskEvent({
      taskId: ctx.task.id,
      organizationId: ctx.task.organizationId,
      type: 'task.progress',
      payload: { checkpoint: bucket * 10, progress, phase, step },
      actor: 'worker'
    });
  }
  return metrics;
};

const finalizeState = async (
  ctx: ExecutionContext,
  status: Exclude<TaskStatus, 'queued' | 'running' | 'paused'>,
  progress: number,
  phase: string,
  step: string
) => {
  await pushState(ctx, status, status === 'success' ? 100 : progress, '0s', phase, step);
  const startedAt = taskStartTimes.get(ctx.task.id);
  if (startedAt) {
    const durationSeconds = (Date.now() - startedAt) / 1000;
    recordMetric('taskDuration', 'observe', durationSeconds);
    taskStartTimes.delete(ctx.task.id);
  }
  if (status === 'success') {
    recordMetric('tasksFinished', 'inc', 1);
  } else if (status === 'failed') {
    recordMetric('tasksFailed', 'inc', 1);
  } else if (status === 'cancelled') {
    recordMetric('tasksCancelled', 'inc', 1);
  }
  const files = Object.values(ctx.artifacts ?? {});
  const metricsSnapshot = JSON.parse(JSON.stringify(ctx.task.result?.metrics ?? {}));
  const paramsRecord =
    ctx.task.params && typeof ctx.task.params === 'object' ? (ctx.task.params as Record<string, unknown>) : {};
  const webhookUrl = typeof paramsRecord.webhookUrl === 'string' ? paramsRecord.webhookUrl : undefined;
  const webhookSecret = typeof paramsRecord.webhookSecret === 'string' ? paramsRecord.webhookSecret : undefined;
  if (webhookUrl && webhookUrl.trim()) {
    void triggerTaskWebhook({
      taskId: ctx.task.id,
      orgId: ctx.task.organizationId,
      status,
      metrics: metricsSnapshot,
      webhookUrl,
      webhookSecret
    })
      .then(() =>
        recordTaskEvent({
          taskId: ctx.task.id,
          organizationId: ctx.task.organizationId,
          type: 'webhook.success',
          payload: { status },
          actor: 'worker'
        })
      )
      .catch((error) => {
        logger.warn({ err: error, taskId: ctx.task.id }, 'Webhook dispatch error');
        void recordTaskEvent({
          taskId: ctx.task.id,
          organizationId: ctx.task.organizationId,
          type: 'webhook.failed',
          payload: { status, reason: (error as Error).message },
          actor: 'worker'
        });
      });
  }
  if (status === 'success' || status === 'failed') {
    void notifyTaskStatus({
      orgId: ctx.task.organizationId,
      taskId: ctx.task.id,
      title: ctx.task.title,
      status: status === 'success' ? 'success' : 'failed',
      preset: ctx.task.preset,
      reason: status === 'failed' ? `Phase ${phase} step ${step}` : undefined
    }).catch((error) => logger.warn({ err: error, taskId: ctx.task.id }, 'Notification dispatch error'));
  }
  if (status === 'success') {
    logTaskEvent(ctx, 'task.completed', { phase, step });
  } else if (status === 'failed') {
    logTaskEvent(ctx, 'task.failed', { phase, step });
  } else if (status === 'cancelled') {
    logTaskEvent(ctx, 'task.cancelled', { phase, step });
  }
  sseEmit(ctx.task.id, 'completed', {
    id: ctx.task.id,
    status,
    files,
    metrics: metricsSnapshot
  });
  await refreshQueueMetrics();
  sseCloseAll(ctx.task.id);
};

const completeJob = async (
  ctx: ExecutionContext,
  status: 'success' | 'cancelled',
  progress: number,
  phase: string,
  step: string
) => {
  await finalizeState(ctx, status, progress, phase, step);
  await acknowledgeJob(ctx.job.id);
  await refreshQueueMetrics();
};

const sendToDeadLetter = async (jobId: string, reason: string) => {
  await failJob(jobId, reason, { retryable: false });
  recordQueueFailed();
  recordQueueDeadletter();
};

const failJobPermanently = async (
  ctx: ExecutionContext,
  progress: number,
  phase: string,
  step: string,
  reason: string
) => {
  await finalizeState(ctx, 'failed', progress, phase, step);
  await sendToDeadLetter(ctx.job.id, reason);
  await refreshQueueMetrics();
};

const runTask = async (job: QueueJob, task: HydratedTask) => {
  let ctx!: ExecutionContext;
  try {
    activeTasks.add(task.id);
    runningWorkers += 1;

    const key = determinePipelineKey(task);
    const pipeline = PIPELINES[key] ?? PIPELINES.ASR;
    const workspace = await ensureTaskDir(task.id);
    const artifactState = await loadArtifacts(task.id);
    const inputPath = await resolveOptionalInput(task.params?.input).catch((error) => {
      logger.warn({ err: error, taskId: task.id }, 'resolveInput failed');
      return undefined;
    });

    taskStartTimes.set(task.id, Date.now());
    ctx = {
      job,
      task,
      pipeline,
      workspace,
      artifacts: artifactState.artifacts ?? {},
      inputPath,
      scratch: {}
    };

    const initialStep = pipeline.initialStep ?? 'start';
    await pushState(ctx, 'running', 0, 'calculating', pipeline.name, initialStep);

    const totalWeight = pipeline.steps.reduce((sum, step) => sum + step.weight, 0);
    const shouldFail = Math.random() * 100 < env.FAIL_RATE;
    const failurePoint = shouldFail ? 55 + Math.random() * 35 : null;
    let accumulated = 0;
    let isPaused = false;

    const noopHelpers: StepHelpers = {
      report: async () => {}
    };

    for (const step of pipeline.steps) {

      if (step.mode === 'manual') {
        const manualHelper: StepHelpers = {
          report: async (fraction, eta = 'processing') => {
            const clamped = Math.min(1, Math.max(0, fraction));
            const progressValue = progressFromWeight(accumulated + step.weight * clamped, totalWeight);
            await pushState(ctx, 'running', progressValue, eta, pipeline.name, step.key);
          }
        };

        while (pausedTasks.has(task.id)) {
          if (!isPaused) {
            isPaused = true;
            await pushState(ctx, 'paused', progressFromWeight(accumulated, totalWeight), 'paused', pipeline.name, step.key);
          }
          await delay(400);
        }
        if (isPaused) {
          isPaused = false;
          await pushState(ctx, 'running', progressFromWeight(accumulated, totalWeight), 'resuming', pipeline.name, step.key);
        }
        if (cancelledTasks.has(task.id)) {
          cancelledTasks.delete(task.id);
          await completeJob(ctx, 'cancelled', progressFromWeight(accumulated, totalWeight), pipeline.name, step.key);
          return;
        }

        if (step.onComplete) {
          try {
            await step.onComplete(ctx, manualHelper);
          } catch (error) {
            const httpError = error instanceof HttpError ? error : null;
            if (
              httpError &&
              shouldRetryGenError(httpError.code) &&
              hasAttemptsRemaining(ctx.job)
            ) {
              throw error;
            }
            if (httpError?.code?.startsWith('GEN_')) {
              ctx.scratch.lastErrorCode = httpError.code;
              ctx.scratch.lastErrorMessage = httpError.message;
            } else if (error instanceof Error && error.message) {
              ctx.scratch.lastErrorMessage = error.message;
            }
            logger.error({ err: error, taskId: task.id }, 'artifact generation failed');
            const failureProgress = progressFromWeight(accumulated, totalWeight);
            const reason = httpError?.code ?? `${step.key}_artifact_error`;
            await failJobPermanently(ctx, failureProgress, pipeline.name, step.key, reason);
            return;
          }
        }
        accumulated += step.weight;
        await pushState(ctx, 'running', progressFromWeight(accumulated, totalWeight), 'post', pipeline.name, step.key);
        continue;
      }

      let local = 0;

      while (local < step.weight) {
        if (cancelledTasks.has(task.id)) {
          cancelledTasks.delete(task.id);
          await completeJob(
            ctx,
            'cancelled',
            progressFromWeight(accumulated + local, totalWeight),
            pipeline.name,
            step.key
          );
          return;
        }

        if (pausedTasks.has(task.id)) {
          if (!isPaused) {
            isPaused = true;
            await pushState(ctx, 'paused', progressFromWeight(accumulated + local, totalWeight), 'paused', pipeline.name, step.key);
          }
          await delay(400);
          continue;
        }

        if (isPaused) {
          isPaused = false;
          await pushState(ctx, 'running', progressFromWeight(accumulated + local, totalWeight), 'resuming', pipeline.name, step.key);
        }

        const delta = Math.min(step.weight - local, Math.max(1, step.weight * Math.random() * 0.3));
        local += delta;
        const progress = progressFromWeight(accumulated + local, totalWeight);
        const eta = `${Math.max(0, Math.round((totalWeight - (accumulated + local)) * 0.6))}s`;
        await pushState(ctx, 'running', progress, eta, pipeline.name, step.key);

        if (failurePoint && progress >= failurePoint) {
          await failJobPermanently(ctx, progress, pipeline.name, step.key, `${step.key}_error`);
          return;
        }

        await delay(randomDelay());
      }

      accumulated += step.weight;
      if (step.onComplete) {
        try {
          await step.onComplete(ctx, noopHelpers);
          await pushState(ctx, 'running', progressFromWeight(accumulated, totalWeight), 'post', pipeline.name, step.key);
        } catch (error) {
          logger.error({ err: error, taskId: task.id }, 'artifact generation failed');
          await failJobPermanently(
            ctx,
            progressFromWeight(accumulated, totalWeight),
            pipeline.name,
            step.key,
            `${step.key}_artifact_error`
          );
          return;
        }
      }
    }

    await completeJob(ctx, 'success', 100, pipeline.name, 'complete');
  } catch (error) {
    logger.error({ err: error, taskId: task.id }, 'runner error');
    if (ctx) {
      if (hasAttemptsRemaining(ctx.job)) {
        const delay = computeRetryDelay(ctx.job.attempts);
        await failJob(ctx.job.id, (error as Error).message ?? 'runner_error', {
          retryable: true,
          delayMs: delay
        });
        recordQueueRetry();
        await refreshQueueMetrics();
        await prisma.task.update({
          where: { id: ctx.task.id },
          data: { status: 'queued', eta: `${Math.round(delay / 1000)}s` }
        });
        void recordTaskEvent({
          taskId: ctx.task.id,
          organizationId: ctx.task.organizationId,
          type: 'task.retry',
          payload: { reason: 'worker_error', delayMs: delay },
          actor: 'worker'
        });
      } else {
        await failJobPermanently(ctx, ctx.task.progress ?? 0, ctx.pipeline.name, 'error', 'worker_error');
      }
    } else {
      const pipeline = PIPELINES[determinePipelineKey(task)] ?? PIPELINES.ASR;
      const artifacts = Object.values((await loadArtifacts(task.id)).artifacts ?? {});
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'failed', eta: '0s' }
      });
      ssePush(task.id, {
        id: task.id,
        status: 'failed',
        progress: 0,
        eta: '0s',
        phase: pipeline.name,
        step: 'error',
        metrics: {},
        files: artifacts
      });
      void recordTaskEvent({
        taskId: task.id,
        organizationId: task.organizationId,
        type: 'task.failed',
        payload: { phase: pipeline.name, step: 'error' },
        actor: 'worker'
      });
      sseCloseAll(task.id);
    }
  } finally {
    taskStartTimes.delete(task.id);
    if (activeTasks.has(task.id)) {
      activeTasks.delete(task.id);
      runningWorkers -= 1;
    }
  }
};

const progressFromWeight = (weight: number, total: number) => Math.min(100, Math.round((weight / total) * 100));

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const dispatch = async () => {
  if (shuttingDown) return;
  touchWorkerHeartbeat();
  if (runningWorkers >= env.CONCURRENCY) return;
  const job = await dequeueJob();
  if (!job) return;
  const hydrated = await getTask(job.taskId);
  if (!hydrated) {
    await acknowledgeJob(job.id);
    await refreshQueueMetrics();
    return;
  }
  const depState = await dependenciesSatisfied(hydrated);
  if (depState.state === 'waiting') {
    await releaseJob(job.id, { delayMs: 1000 });
    void recordTaskEvent({
      taskId: hydrated.id,
      organizationId: hydrated.organizationId,
      type: 'task.retry',
      payload: { reason: 'dependencies_waiting' },
      actor: 'worker'
    });
    return;
  }
  if (depState.state === 'upstream_failed') {
    await handleUpstreamFailure(hydrated, depState.upstreamId);
    await sendToDeadLetter(job.id, 'upstream_failed');
    await refreshQueueMetrics();
    return;
  }
  await prisma.task.update({
    where: { id: hydrated.id },
    data: { status: 'running', progress: hydrated.progress ?? 0 }
  });
  void refreshQueueMetrics();
  void runTask(job, hydrated).catch((error) =>
    logger.error({ err: error, taskId: hydrated.id }, 'worker crash')
  );
  touchWorkerHeartbeat();
};

export const runnerLoop = () => {
  if (runnerTimer || shuttingDown) return;
  runnerTimer = setInterval(dispatch, 250);
};

const waitForDrain = async (timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (runningWorkers > 0 && Date.now() < deadline) {
    await delay(100);
  }
  if (runningWorkers > 0) {
    logger.warn({ runningWorkers }, 'Runner drain timed out');
  }
};

export const stopRunner = async (timeoutMs = 5000) => {
  shuttingDown = true;
  if (runnerTimer) {
    clearInterval(runnerTimer);
    runnerTimer = null;
  }
  await waitForDrain(timeoutMs);
};

export const controlTask = async (
  id: string,
  organizationId: string,
  action: 'pause' | 'resume' | 'cancel',
  actor?: string | null
) => {
  const actorId = actor ?? null;
  const existing = await prisma.task.findFirst({ where: { id, organizationId } });
  if (!existing) {
    return null;
  }
  if (action === 'cancel') {
    if (activeTasks.has(id)) {
      cancelledTasks.add(id);
      void recordTaskEvent({
        taskId: id,
        organizationId,
        type: 'task.status',
        payload: { from: existing.status, to: 'cancel_requested' },
        actor: actorId
      });
      return getTask(id);
    }
    await prisma.task.update({ where: { id }, data: { status: 'cancelled', eta: '0s' } }).catch(() => null);
    ssePush(id, {
      id,
      status: 'cancelled',
      progress: 0,
      eta: '0s',
      phase: 'cancel',
      step: 'cancel',
      metrics: {},
      files: Object.values((await loadArtifacts(id)).artifacts ?? {})
    });
    recordMetric('tasksCancelled', 'inc', 1);
    await refreshQueueMetrics();
    sseCloseAll(id);
    void recordTaskEvent({
      taskId: id,
      organizationId,
      type: 'task.cancelled',
      payload: { from: existing.status, reason: 'user' },
      actor: actorId
    });
    return getTask(id);
  }

  if (action === 'pause') {
    pausedTasks.add(id);
    await prisma.task.update({ where: { id }, data: { status: 'paused' } }).catch(() => null);
    await refreshQueueMetrics();
    void recordTaskEvent({
      taskId: id,
      organizationId,
      type: 'task.status',
      payload: { from: existing.status, to: 'paused' },
      actor: actorId
    });
    return getTask(id);
  }

  if (action === 'resume') {
    pausedTasks.delete(id);
    const nextStatus = activeTasks.has(id) ? 'running' : 'queued';
    await prisma.task.update({ where: { id }, data: { status: nextStatus } }).catch(() => null);
    await refreshQueueMetrics();
    void recordTaskEvent({
      taskId: id,
      organizationId,
      type: 'task.status',
      payload: { from: existing.status, to: nextStatus },
      actor: actorId
    });
    return getTask(id);
  }

  return null;
};

export const startRunner = runnerLoop;
