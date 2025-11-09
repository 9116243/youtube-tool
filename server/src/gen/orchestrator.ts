import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { Task } from '@prisma/client';
import { prisma } from '../db/prisma';
import { appEnv } from '../utils/env';
import { logger } from '../utils/logger';
import { HttpError } from '../utils/http-error';
import { safeJsonParse } from '../utils/json';
import { ssePush } from '../sse';
import { recordGenerationCost, recordGenerationRouteDecision, recordGenerationFallback } from '../metrics/generation';
import { getProviderEntry, type ProviderEntry } from '../providers/registry';
import { getRouteCandidates, registerProviderOutcome } from '../providers/strategy';
import type { VideoGenAsset, VideoGenPollResponse, VideoGenProviderName } from '../providers/types';

const PHASE = 'GEN';
const POLL_DELAY_MS = 1500;

const referenceSchema = z.object({
  url: z.string().min(1),
  label: z.string().min(1).optional(),
});

const providerPolicySchema = z
  .union([
    z.enum(['best_quality', 'balanced', 'lowest_cost']),
    z.string().regex(/^force:[^:\s]+(:.*)?$/i),
  ])
  .default('balanced');

const genVideoParamsSchema = z
  .object({
    prompt: z.string().min(1),
    storyboard: z.string().optional(),
    duration: z.coerce.number().int().min(1).max(600),
    resolution: z.enum(['1080p', '2k', '4k']),
    fps: z.coerce.number().int().positive().optional(),
    aspect: z.enum(['16:9', '9:16', '1:1']),
    seed: z.coerce.number().int().nonnegative().optional(),
    negative: z.string().optional(),
    references: z.array(referenceSchema).optional().default([]),
    providerPolicy: providerPolicySchema,
  })
  .strict();

type GenVideoParams = z.infer<typeof genVideoParamsSchema>;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const clampProgress = (value: number | undefined, max = 95) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 1;
  }
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return Math.min(max, Math.max(1, percent));
};

const formatEta = (seconds?: number) => (seconds && Number.isFinite(seconds) ? `${Math.round(seconds)}s` : undefined);

const workspaceRoot = resolve(process.cwd(), appEnv.WORKSPACE_DIR);

const ensureWorkspace = async (taskId: string) => {
  await fs.mkdir(workspaceRoot, { recursive: true });
  const target = join(workspaceRoot, taskId);
  await fs.mkdir(target, { recursive: true });
  return target;
};

type TaskStatusUpdate = 'RUNNING' | 'SUCCESS' | 'FAILED';

const updateTaskProgress = async (taskId: string, progress: number, status: TaskStatusUpdate) =>
  prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      progress: Math.min(100, Math.max(0, Math.round(progress))),
    },
  });

const recordGenerationEvent = (generationId: string, step: string, message?: string, payload?: Record<string, unknown>) =>
  prisma.generationEvent.create({
    data: {
      generationId,
      phase: PHASE,
      step,
      message,
      payload: payload ? JSON.stringify(payload) : undefined,
    },
  });

type ProgressPayload = Record<string, unknown> & {
  metrics?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

const emitProgress = async ({
  taskId,
  generationId,
  step,
  progress,
  status,
  message,
  etaSeconds,
  payload,
}: {
  taskId: string;
  generationId: string;
  step: string;
  progress: number;
  status: TaskStatusUpdate;
  message?: string;
  etaSeconds?: number;
  payload?: ProgressPayload;
}) => {
  await updateTaskProgress(taskId, progress, status);
  await recordGenerationEvent(generationId, step, message, payload);
  ssePush(taskId, {
    id: taskId,
    progress: Math.min(100, Math.max(0, Math.round(progress))),
    status: status.toLowerCase(),
    phase: PHASE,
    step,
    eta: formatEta(etaSeconds),
    metrics: payload?.metrics,
    files: payload?.files,
  });
};

type SavedAsset = {
  kind: string;
  filename: string;
  path: string;
  mime: string;
  size: number;
  hash: string;
  metadata?: Record<string, unknown>;
};

const persistAssets = async (workspace: string, generationId: string, assets: VideoGenAsset[]): Promise<SavedAsset[]> => {
  const saved: SavedAsset[] = [];
  for (const asset of assets) {
    const target = join(workspace, asset.filename);
    await fs.writeFile(target, asset.buffer);
    const stats = await fs.stat(target);
    const hash = createHash('sha256').update(asset.buffer).digest('hex');
    await prisma.generationAsset.create({
      data: {
        generationId,
        kind: asset.kind,
        filename: asset.filename,
        path: asset.filename,
        mime: asset.mime,
        size: stats.size,
        hash,
        metadata: asset.metadata ? JSON.stringify(asset.metadata) : undefined,
      },
    });
    saved.push({
      kind: asset.kind,
      filename: asset.filename,
      path: asset.filename,
      mime: asset.mime,
      size: stats.size,
      hash,
      metadata: asset.metadata,
    });
  }
  return saved;
};

const buildManifest = (taskId: string, saved: SavedAsset[], params: GenVideoParams) => ({
  taskId,
  prompt: params.prompt,
  resolution: params.resolution,
  duration: params.duration,
  aspect: params.aspect,
  createdAt: new Date().toISOString(),
  artifacts: saved.reduce<Record<string, Record<string, unknown>>>((acc, asset) => {
    acc[asset.kind] = {
      filename: asset.filename,
      path: asset.path,
      mime: asset.mime,
      size: asset.size,
      hash: asset.hash,
      metadata: asset.metadata ?? null,
    };
    return acc;
  }, {}),
  references: params.references,
});

const writeManifest = async (workspace: string, manifest: Record<string, unknown>) => {
  await fs.writeFile(join(workspace, 'artifacts.json'), JSON.stringify(manifest, null, 2));
};

const mergeMetadata = (current: string | null | undefined, patch: Record<string, unknown>) => {
  let base: Record<string, unknown> = {};
  if (current) {
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed === 'object' && parsed !== null) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      base = {};
    }
  }
  return JSON.stringify({ ...base, ...patch });
};

export const orchestrateGenVideo = async (task: Task): Promise<void> => {
  const rawParams = safeJsonParse<Record<string, unknown>>(task.params);
  const parsed = genVideoParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    await updateTaskProgress(task.id, 0, 'FAILED');
    throw new HttpError(400, 'GEN_INVALID_PARAMS', 'Invalid video generation parameters', parsed.error.flatten());
  }
  const params = parsed.data;
  const workspace = await ensureWorkspace(task.id);
  const plan = getRouteCandidates(params.providerPolicy);
  if (!plan.length) {
    throw new HttpError(400, 'GEN_UNSUPPORTED', 'No providers are available for this policy');
  }
  let generation = await prisma.generation.create({
    data: {
      taskId: task.id,
      provider: 'pending',
      policy: params.providerPolicy,
      prompt: params.prompt,
      negative: params.negative ?? null,
      durationSec: params.duration,
      resolution: params.resolution,
      aspectRatio: params.aspect,
      fps: params.fps ?? null,
      seed: params.seed ?? null,
      references: JSON.stringify(params.references),
      metadata: JSON.stringify({
        storyboard: params.storyboard,
        createdAt: new Date().toISOString(),
      }),
    },
  });
  if (plan.length > 1) {
    await recordGenerationEvent(generation.id, 'prepare', 'can_fallback', {
      plan,
    });
  }
  await emitProgress({
    taskId: task.id,
    generationId: generation.id,
    step: 'prepare',
    progress: 5,
    status: 'RUNNING',
    message: 'Preparing generation',
  });
  await prisma.generation.update({
    where: { id: generation.id },
    data: { status: 'RUNNING' },
  });

  const runProviderAgainstAdapter = async (entry: ProviderEntry) => {
    const submission = await entry.adapter.submit({
      prompt: params.prompt,
      negative: params.negative,
      storyboard: params.storyboard,
      duration: params.duration,
      resolution: params.resolution,
      fps: params.fps,
      aspect: params.aspect,
      seed: params.seed,
      references: params.references,
      policy: params.providerPolicy,
    });
    generation = await prisma.generation.update({
      where: { id: generation.id },
      data: { requestId: submission.requestId, status: 'RUNNING' },
    });

    let finalPoll: VideoGenPollResponse | null = null;
    while (true) {
      await delay(POLL_DELAY_MS);
      const poll = await entry.adapter.poll(submission.requestId);
      const progress = clampProgress(poll.progress);
      await emitProgress({
        taskId: task.id,
        generationId: generation.id,
        step: 'generate',
        progress,
        status: 'RUNNING',
        message: 'Provider status: ' + poll.status,
        etaSeconds: 'etaSeconds' in poll ? poll.etaSeconds : undefined,
        payload: {
          providerStatus: poll.status,
          provider: entry.name,
          etaSeconds: 'etaSeconds' in poll ? poll.etaSeconds : undefined,
          durationSec: 'durationSec' in poll ? poll.durationSec : undefined,
        },
      });
      if (poll.status === 'success') {
        finalPoll = poll;
        break;
      }
      if (poll.status === 'failed') {
        const code = poll.errorCode ?? 'GEN_PROVIDER_ERROR';
        const message = poll.errorMessage ?? 'Generation provider failed';
        throw new HttpError(502, message, code, { provider: entry.name });
      }
    }
    if (!finalPoll) {
      throw new HttpError(502, 'GEN_PROVIDER_ERROR', 'Generation did not complete', { provider: entry.name });
    }
    const assets = await entry.adapter.fetchAssets(submission.requestId);
    return { assets, finalPoll, requestId: submission.requestId };
  };

  try {
    let finalProvider: VideoGenProviderName | null = null;
    let finalAssets: VideoGenAsset[] | null = null;
    let finalPoll: VideoGenPollResponse | null = null;
    let finalRequestId = '';
    let lastProviderLabel = 'initial';

    for (let index = 0; index < plan.length; index += 1) {
      const providerName = plan[index];
      const entry = getProviderEntry(providerName);
      if (!entry) {
        continue;
      }
      recordGenerationRouteDecision(params.providerPolicy, lastProviderLabel, providerName);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await emitProgress({
          taskId: task.id,
          generationId: generation.id,
          step: 'prepare',
          progress: 8,
          status: 'RUNNING',
          message: 'Dispatching to ' + providerName,
          payload: { provider: providerName },
        });
        const attemptStart = Date.now();
        try {
          const result = await runProviderAgainstAdapter(entry);
          finalAssets = result.assets;
          finalPoll = result.finalPoll;
          finalRequestId = result.requestId;
          registerProviderOutcome(providerName, true, Date.now() - attemptStart, finalPoll?.costCents);
          finalProvider = providerName;
          break;
        } catch (error) {
          registerProviderOutcome(providerName, false, Math.max(0, Date.now() - attemptStart));
          const reason = error instanceof HttpError ? error.code : 'GEN_PROVIDER_ERROR';
          if (attempt >= 1) {
            const nextProvider = plan[index + 1];
            if (nextProvider) {
              await recordGenerationEvent(generation.id, 'fallback', 'provider_fallback', {
                fallback_from: providerName,
                fallback_to: nextProvider,
                reason,
              });
              recordGenerationFallback(providerName, nextProvider, reason);
              lastProviderLabel = providerName;
            }
            break;
          }
          continue;
        }
      }
      if (finalAssets) {
        break;
      }
    }

    if (!finalAssets || !finalProvider) {
      await prisma.generation.update({ where: { id: generation.id }, data: { status: 'FAILED' } });
      throw new HttpError(502, 'GEN_PROVIDER_ERROR', 'All providers failed');
    }

    await emitProgress({
      taskId: task.id,
      generationId: generation.id,
      step: 'upscale',
      progress: 92,
      status: 'RUNNING',
      message: 'Finalizing assets',
    });
    const saved = await persistAssets(workspace, generation.id, finalAssets);
    const costCents = finalPoll?.costCents;
    if (costCents && Number.isFinite(costCents)) {
      recordGenerationCost(finalProvider, params.providerPolicy, costCents);
    }
    const assetIndex = saved.reduce<Record<string, unknown>>((acc, asset) => {
      acc[asset.kind] = asset.path;
      return acc;
    }, {});
    const manifest = buildManifest(task.id, saved, params);
    await emitProgress({
      taskId: task.id,
      generationId: generation.id,
      step: 'compose',
      progress: 96,
      status: 'RUNNING',
      message: 'Writing artifacts',
      payload: { files: assetIndex },
    });
    await writeManifest(workspace, manifest);
    const mergedMetadata = mergeMetadata(generation.metadata, {
      assets: assetIndex,
      references: params.references,
    });
    await prisma.generation.update({
      where: { id: generation.id },
      data: {
        requestId: finalRequestId,
        provider: finalProvider,
        status: 'success',
        metadata: mergedMetadata,
        costCents: costCents ?? undefined,
      },
    });
    await emitProgress({
      taskId: task.id,
      generationId: generation.id,
      step: 'complete',
      progress: 100,
      status: 'SUCCESS',
      message: 'Generation complete',
      payload: { files: assetIndex },
    });
  } catch (error) {
    await prisma.generation.update({ where: { id: generation.id }, data: { status: 'failed' } });
    await emitProgress({
      taskId: task.id,
      generationId: generation.id,
      step: 'complete',
      progress: 100,
      status: 'FAILED',
      message: error instanceof Error ? error.message : 'Generation failed',
      payload: error instanceof HttpError ? { code: error.code } : undefined,
    });
    logger.error('gen_video orchestrator failed', { taskId: task.id, err: error });
    throw error;
  }
};