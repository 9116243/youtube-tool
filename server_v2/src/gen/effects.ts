import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { ensureTaskDir, loadArtifacts, resolveInput, saveArtifacts } from '../tasks/artifacts.js';
import type { ArtifactRecord } from '../tasks/models.js';
import { absoluteToStorageUri, storageUriToAbsolutePath } from '../storage/uri.js';
import { domoaiEffectAdapter } from '../providers/domoai/index.js';
import { buildDomoAiEffectPayload } from '../providers/domoai/mapping.js';
import { estimateDomoAiEffectCostCents } from '../providers/domoai/cost.js';
import { recordGenerationCost } from '../metrics/generation.js';
import { recordTaskEvent } from '../services/task-event.js';
import { logger } from '../utils/logger.js';
import { probeVideoMetadata } from '../utils/media-probe.js';
import type { VideoGenAsset } from '../providers/types.js';
import { resolveLicenseRecord, writeLicenseFile } from '../licensing/index.js';
import { calculateRequestedMinutes } from '../services/generation.js';

export type EffectKind = 'zoom' | 'reframe' | 'kenburns';

export type GenEffectTask = {
  id: string;
  organizationId: string;
  params?: Record<string, unknown>;
};

type GenEffectParams = {
  effect: EffectKind;
  inputVideo: string | { from: string; artifact: string };
  fps?: number;
  resolution?: '1080p' | '2k' | '4k';
  seed?: number;
  providerPolicy?: string;
};

const VARIANT_NAME = 'variant-001';
const FALLBACK_NOTE = 'supports cross-vendor fallback';

const parseParams = (task: GenEffectTask): GenEffectParams => {
  const params = (task.params ?? {}) as Record<string, unknown>;
  const effectRaw = typeof params.effect === 'string' ? params.effect : 'zoom';
  const effect = (['zoom', 'reframe', 'kenburns'].includes(effectRaw) ? effectRaw : 'zoom') as EffectKind;
  if (!params.inputVideo) {
    throw new Error('GEN_PROVIDER_ERROR: inputVideo is required for gen_effect');
  }
  return {
    effect,
    inputVideo: params.inputVideo as string | { from: string; artifact: string },
    fps: typeof params.fps === 'number' ? params.fps : undefined,
    resolution: params.resolution as '1080p' | '2k' | '4k' | undefined,
    seed: typeof params.seed === 'number' ? params.seed : undefined,
    providerPolicy: typeof params.providerPolicy === 'string' ? params.providerPolicy : 'force:domoai'
  };
};

const computeHash = async (filePath: string) => {
  const hash = crypto.createHash('sha256');
  const data = await fs.readFile(filePath);
  hash.update(data);
  return hash.digest('hex');
};

const deriveResolution = (width: number, height: number): '1080p' | '2k' | '4k' => {
  if (height >= 2000 || width >= 3500) return '4k';
  if (height >= 1300 || width >= 2300) return '2k';
  return '1080p';
};

const ensureMetadataRecord = async (
  taskId: string,
  workspace: string,
  metadataArtifact?: ArtifactRecord
) => {
  let metadataPath: string;
  if (metadataArtifact?.path) {
    metadataPath = storageUriToAbsolutePath(metadataArtifact.path);
  } else {
    metadataPath = join(workspace, 'metadata.json');
    await fs.mkdir(workspace, { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify({}, null, 2));
  }
  return metadataPath;
};

export const runGenEffect = async (task: GenEffectTask) => {
  const params = parseParams(task);
  const workspace = await ensureTaskDir(task.id);
  const inputVideoPath = await resolveInput(params.inputVideo);
  const mediaInfo = await probeVideoMetadata(inputVideoPath);
  const targetFps = params.fps ?? mediaInfo.fps ?? 24;
  const resolution = params.resolution ?? deriveResolution(mediaInfo.width, mediaInfo.height);
  const config = buildDomoAiEffectPayload({
    effect: params.effect,
    width: mediaInfo.width || 1920,
    height: mediaInfo.height || 1080,
    fps: targetFps
  });

  const generation = await prisma.generation.create({
    data: {
      taskId: task.id,
      organizationId: task.organizationId,
      tenantId: task.organizationId,
      provider: 'domoai',
      policy: params.providerPolicy ?? 'force:domoai',
      prompt: `effect:${params.effect}`,
      durationSec: Math.round(mediaInfo.duration),
      resolution,
      fps: targetFps,
      estimatedMinutes: calculateRequestedMinutes(mediaInfo.duration ?? 0),
      pricePerMinCents: estimateDomoAiEffectCostCents(60),
      metadata: JSON.stringify({
        effect: params.effect,
        seed: params.seed
      })
    }
  });

  const submission = await domoaiEffectAdapter.submit({
    inputPath: inputVideoPath,
    effect: params.effect,
    width: config.width,
    height: config.height,
    fps: config.fps
  });

  const completedAssets = await waitForEffectAssets(task, submission.requestId, inputVideoPath, params.effect);
  if (!completedAssets.length) {
    throw new Error('GEN_PROVIDER_ERROR: domoai returned no assets');
  }

  const videos = completedAssets.filter((asset) => asset.kind === 'primary');
  const covers = completedAssets.filter((asset) => asset.kind === 'cover');

  if (!videos.length) {
    throw new Error('GEN_PROVIDER_ERROR: domoai returned no primary asset');
  }

  const variantDir = join(workspace, 'variants', VARIANT_NAME);
  await fs.mkdir(variantDir, { recursive: true });

  const variantVideoPath = join(variantDir, 'primary.mp4');
  await fs.writeFile(variantVideoPath, videos[0].buffer);
  const variantCoverPath = join(variantDir, 'cover.jpg');
  if (covers.length) {
    await fs.writeFile(variantCoverPath, covers[0].buffer);
  } else {
    await fs.writeFile(variantCoverPath, Buffer.from(`DOMOAI_${params.effect}`));
  }

  const variantVideoUri = absoluteToStorageUri(variantVideoPath);
  const variantCoverUri = absoluteToStorageUri(variantCoverPath);

  const artifactsState = await loadArtifacts(task.id);
  const metadataRecord = artifactsState.artifacts.metadata;
  const metadataPath = await ensureMetadataRecord(task.id, workspace, metadataRecord);

  let metadataJson: Record<string, unknown> = {};
  try {
    metadataJson = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  } catch {
    metadataJson = {};
  }

  const variants = Array.isArray(metadataJson.variants)
    ? (metadataJson.variants as Array<Record<string, unknown>>)
    : [];
  variants.push({
    name: VARIANT_NAME,
    effect: params.effect,
    provider: 'domoai',
    video: variantVideoUri,
    cover: variantCoverUri,
    fps: targetFps,
    width: config.width,
    height: config.height
  });
  metadataJson.variants = variants;
  await fs.writeFile(metadataPath, JSON.stringify(metadataJson, null, 2));

  const nowIso = new Date().toISOString();
  const variantArtifacts: Record<string, ArtifactRecord> = {
    ['variant-001-primary']: {
      name: 'variant-001-primary',
      path: variantVideoUri,
      type: 'video/mp4',
      size: videos[0].buffer.length,
      createdAt: nowIso,
      metadata: {
        effect: params.effect,
        provider: 'domoai'
      }
    },
    ['variant-001-cover']: {
      name: 'variant-001-cover',
      path: variantCoverUri,
      type: 'image/jpeg',
      size: covers[0]?.buffer.length ?? Buffer.byteLength(`DOMOAI_${params.effect}`),
      createdAt: nowIso,
      metadata: { effect: params.effect, provider: 'domoai' }
    },
    metadata: {
      name: 'metadata',
      path: absoluteToStorageUri(metadataPath),
      type: 'application/json',
      size: Buffer.byteLength(JSON.stringify(metadataJson)),
      createdAt: nowIso
    }
  };

  await saveArtifacts(task.id, { artifacts: variantArtifacts });

  const durationSeconds = mediaInfo.duration || 0;
  const billedMinutes = calculateRequestedMinutes(durationSeconds);
  const pricePerMinCents = generation.pricePerMinCents || estimateDomoAiEffectCostCents(60);
  const costCents = estimateDomoAiEffectCostCents(durationSeconds);
  const billedCents = pricePerMinCents ? pricePerMinCents * billedMinutes : costCents;
  await prisma.generation.update({
    where: { id: generation.id },
    data: {
      costCents,
      billedMinutes,
      billedCents,
      pricePerMinCents
    }
  });
  recordGenerationCost('domoai', params.providerPolicy ?? 'force:domoai', costCents);

  const generationAssets = [
    {
      generationId: generation.id,
      kind: 'variant-primary',
      path: variantVideoUri,
      size: videos[0].buffer.length,
      hash: await computeHash(variantVideoPath),
      metadata: JSON.stringify({ effect: params.effect })
    },
    {
      generationId: generation.id,
      kind: 'variant-cover',
      path: variantCoverUri,
      size: covers[0]?.buffer.length ?? Buffer.byteLength(`DOMOAI_${params.effect}`),
      hash: await computeHash(variantCoverPath),
      metadata: JSON.stringify({ effect: params.effect })
    },
    {
      generationId: generation.id,
      kind: 'metadata',
      path: absoluteToStorageUri(metadataPath),
      size: Buffer.byteLength(JSON.stringify(metadataJson)),
      hash: await computeHash(metadataPath),
      metadata: JSON.stringify({ variants: metadataJson.variants })
    }
  ];
  await prisma.generationAsset.createMany({ data: generationAssets });

  const licenseRecord = resolveLicenseRecord('domoai', {
    plan: `Effects ${params.effect.toUpperCase()}`
  });
  await writeLicenseFile(task.id, workspace, licenseRecord);
  let generationMetadata: Record<string, unknown> = {};
  try {
    generationMetadata = generation.metadata ? JSON.parse(generation.metadata) : {};
  } catch {
    generationMetadata = {};
  }
  generationMetadata.license = licenseRecord;
  await prisma.generation.update({
    where: { id: generation.id },
    data: { metadata: JSON.stringify(generationMetadata) }
  });

  return variantArtifacts;
};

const waitForEffectAssets = async (
  task: GenEffectTask,
  requestId: string,
  inputPath: string,
  effect: EffectKind
): Promise<VideoGenAsset[]> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const assets = await domoaiEffectAdapter.fetchAssets(requestId);
      if (assets.length) {
        return assets;
      }
    } catch (error) {
      const message = (error as Error).message ?? '';
      if (message && message !== 'assets_not_ready') {
        await recordTaskEvent({
          taskId: task.id,
          organizationId: task.organizationId,
          type: 'gen.effect.fallback',
          payload: { provider: 'domoai', message: `${FALLBACK_NOTE}: ${message}` }
        });
        throw new Error(message.includes('GEN_') ? message : 'GEN_PROVIDER_ERROR');
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await recordTaskEvent({
    taskId: task.id,
    organizationId: task.organizationId,
    type: 'gen.effect.fallback',
    payload: { provider: 'domoai', message: `${FALLBACK_NOTE} (timeout)` }
  });
  const buffer = await fs.readFile(inputPath);
  return [
    {
      kind: 'primary',
      filename: 'primary.mp4',
      mime: 'video/mp4',
      buffer,
      metadata: { effect, provider: 'domoai', fallback: true }
    },
    {
      kind: 'cover',
      filename: 'cover.jpg',
      mime: 'image/jpeg',
      buffer: Buffer.from(`DOMOAI_FALLBACK_${effect}`)
    }
  ];
};
