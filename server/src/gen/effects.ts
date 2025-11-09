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
import { domoaiEffectAdapter } from '../providers/domoai';
import { buildDomoAiEffectPayload, type EffectKind } from '../providers/domoai/mapping';
import { recordGenerationCost } from '../metrics/generation';

const workspaceRoot = resolve(process.cwd(), appEnv.WORKSPACE_DIR);
const VARIANT_NAME = 'variant-001';
const EFFECT_PHASE = 'EFFECT';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const genEffectSchema = z
  .object({
    effect: z.enum(['zoom', 'reframe', 'kenburns']).default('zoom'),
    inputVideo: z.union([
      z.string().min(1),
      z
        .object({
          from: z.string().min(1),
          artifact: z.string().min(1).default('primary'),
        })
        .strict(),
    ]),
    fps: z.number().positive().optional(),
    resolution: z.enum(['1080p', '2k', '4k']).optional(),
    providerPolicy: z.string().optional(),
  })
  .strict();

type GenEffectParams = z.infer<typeof genEffectSchema>;

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
      phase: EFFECT_PHASE,
      step,
      message,
      payload: payload ? JSON.stringify(payload) : undefined,
    },
  });

type EffectProgressPayload = Record<string, unknown>;

const emitEffectProgress = async ({
  taskId,
  generationId,
  step,
  progress,
  status,
  message,
  payload,
}: {
  taskId: string;
  generationId: string;
  step: string;
  progress: number;
  status: TaskStatusUpdate;
  message?: string;
  payload?: EffectProgressPayload;
}) => {
  await updateTaskProgress(taskId, progress, status);
  await recordGenerationEvent(generationId, step, message, payload);
  ssePush(taskId, {
    id: taskId,
    progress: Math.min(100, Math.max(0, Math.round(progress))),
    status: status.toLowerCase(),
    phase: EFFECT_PHASE,
    step,
    message,
    files: payload?.files as Record<string, unknown>,
  });
};

const resolveInputPath = async (input: GenEffectParams['inputVideo']) => {
  if (typeof input === 'string') {
    return input;
  }
  const artifactName = input.artifact.toLowerCase().endsWith('.mp4')
    ? input.artifact
    : `${input.artifact}.mp4`;
  const target = join(workspaceRoot, input.from, artifactName);
  try {
    await fs.access(target);
    return target;
  } catch {
    throw new HttpError(400, 'GEN_INPUT_MISSING', 'Referenced artifact not found', {
      from: input.from,
      artifact: input.artifact,
    });
  }
};

const resolutionDimensions: Record<'1080p' | '2k' | '4k', { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};

const ensureWorkspace = async (taskId: string) => {
  await fs.mkdir(workspaceRoot, { recursive: true });
  const target = join(workspaceRoot, taskId);
  await fs.mkdir(target, { recursive: true });
  return target;
};

const waitForEffectAssets = async (requestId: string) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const poll = await domoaiEffectAdapter.poll(requestId);
    if ('status' in poll && poll.status === 'success' && poll.assets?.length) {
      return poll.assets;
    }
    if ('status' in poll && poll.status === 'failed') {
      throw new HttpError(502, poll.errorMessage ?? 'Effect failed', 'GEN_PROVIDER_ERROR', { requestId });
    }
    await delay(200);
  }
  throw new HttpError(502, 'GEN_PROVIDER_ERROR', 'Effect timed out');
};

const computeEffectCost = (seconds = 10) => {
  const rate = appEnv.DOMOAI_PRICE_PER_MIN_EFFECT ?? 0;
  if (!rate) return 0;
  return Math.round((rate / 60) * seconds);
};

export const runGenEffect = async (task: Task): Promise<void> => {
  const rawParams = safeJsonParse<Record<string, unknown>>(task.params);
  const parsed = genEffectSchema.safeParse(rawParams);
  if (!parsed.success) {
    await updateTaskProgress(task.id, 0, 'FAILED');
    throw new HttpError(400, 'GEN_INVALID_PARAMS', 'Invalid effect parameters', parsed.error.flatten());
  }
  const params = parsed.data;
  const workspace = await ensureWorkspace(task.id);
  let generationRecord:
    | (Awaited<
        ReturnType<typeof prisma['generation']['create']>
      >)
    | null = null;
  try {
    const inputPath = await resolveInputPath(params.inputVideo);
    const dims = resolutionDimensions[params.resolution ?? '1080p'];
    const effectPayload = buildDomoAiEffectPayload({
      effect: params.effect,
      width: dims.width,
      height: dims.height,
      fps: params.fps ?? 24,
    });
    generationRecord = await prisma.generation.create({
      data: {
        taskId: task.id,
        provider: 'domoai',
        policy: params.providerPolicy ?? 'force:domoai',
        prompt: `effect:${params.effect}`,
        durationSec: 0,
        resolution: params.resolution ?? '1080p',
        aspectRatio: '16:9',
        fps: effectPayload.fps,
        metadata: JSON.stringify({
          effect: params.effect,
          resolution: params.resolution ?? '1080p',
        }),
      },
    });
    await emitEffectProgress({
      taskId: task.id,
      generationId: generationRecord.id,
      step: 'prepare',
      progress: 10,
      status: 'RUNNING',
      message: 'Preparing effect',
    });
    const submission = await domoaiEffectAdapter.submit({
      inputPath,
      effect: params.effect,
      width: effectPayload.width,
      height: effectPayload.height,
      fps: effectPayload.fps,
    });
    await emitEffectProgress({
      taskId: task.id,
      generationId: generationRecord.id,
      step: 'generate',
      progress: 35,
      status: 'RUNNING',
      message: 'Processing effect',
    });
    const assets = await waitForEffectAssets(submission.requestId);
    await emitEffectProgress({
      taskId: task.id,
      generationId: generationRecord.id,
      step: 'compose',
      progress: 60,
      status: 'RUNNING',
      message: 'Writing variant artifacts',
    });
    const variantDir = join(workspace, 'variants', VARIANT_NAME);
    await fs.mkdir(variantDir, { recursive: true });
    const savedAssets: Array<{ kind: string; path: string }> = [];
    for (const asset of assets) {
      const assetPath = join(variantDir, asset.filename);
      await fs.writeFile(assetPath, asset.buffer);
      const stats = await fs.stat(assetPath);
      const hash = createHash('sha256').update(asset.buffer).digest('hex');
      const relativePath = ['variants', VARIANT_NAME, asset.filename].join('/');
      await prisma.generationAsset.create({
        data: {
          generationId: generationRecord.id,
          kind: `variant-${asset.kind}`,
          filename: asset.filename,
          path: relativePath,
          mime: asset.mime,
          size: stats.size,
          hash,
          metadata: asset.metadata ? JSON.stringify(asset.metadata) : undefined,
        },
      });
      savedAssets.push({
        kind: asset.kind,
        path: relativePath,
      });
    }
    const metadataPath = join(variantDir, 'metadata.json');
    const metadataJson = {
      variant: VARIANT_NAME,
      effect: params.effect,
      files: savedAssets,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadataJson, null, 2));
    const costCents = computeEffectCost();
    const metadataBase = safeJsonParse<Record<string, unknown>>(generationRecord.metadata);
    await prisma.generation.update({
      where: { id: generationRecord.id },
      data: {
        status: 'success',
        costCents,
        metadata: JSON.stringify({
          ...metadataBase,
          variants: [
            {
              name: VARIANT_NAME,
              path: `variants/${VARIANT_NAME}/primary.mp4`,
              effect: params.effect,
            },
          ],
        }),
      },
    });
    recordGenerationCost('domoai', params.providerPolicy ?? 'force:domoai', costCents);
    await emitEffectProgress({
      taskId: task.id,
      generationId: generationRecord.id,
      step: 'complete',
      progress: 100,
      status: 'SUCCESS',
      message: 'Effect generation complete',
      payload: { files: { variant: `variants/${VARIANT_NAME}/primary.mp4` } },
    });
  } catch (error) {
    if (generationRecord) {
      await prisma.generation.update({
        where: { id: generationRecord.id },
        data: { status: 'failed' },
      });
    }
    await emitEffectProgress({
      taskId: task.id,
      generationId: generationRecord?.id ?? task.id,
      step: 'complete',
      progress: 100,
      status: 'FAILED',
      message: error instanceof Error ? error.message : 'Effect generation failed',
    });
    logger.error('gen_effect failed', { taskId: task.id, err: error });
    await updateTaskProgress(task.id, 100, 'FAILED');
    throw error;
  }
};
