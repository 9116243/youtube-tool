import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { HttpError } from '../utils/http-error.js';
import { ensureTaskDir, saveArtifacts } from '../tasks/artifacts.js';
import { absoluteToStorageUri, storageUriToAbsolutePath } from '../storage/uri.js';
import { ssePush } from '../sse.js';
import { getVideoGenAdapter, type VideoGenAsset } from '../providers/types.js';
import { buildGenerationRoutes, recordRouteOutcomeStats, type RouteCandidate } from '../providers/strategy.js';
import type { ArtifactRecord } from '../tasks/models.js';
import {
  recordGenerationCost,
  recordGenerationRouteDecision,
  recordGenerationFallback
} from '../metrics/generation.js';
import { env } from '../utils/env.js';
import { runVideoQc, isFixableResult, applyQcFixes, type QCResult } from '../qc/video.js';
import { resolveLicenseRecord, writeLicenseFile } from '../licensing/index.js';
import type { LicenseRecord } from '../licensing/types.js';
import { getRunwayRateCents } from '../providers/runway/cost.js';
import type { RunwayModel } from '../providers/runway/mapping.js';
import { getLumaRateCents } from '../providers/luma/cost.js';
import { getHaiperRateCents } from '../providers/haiper/cost.js';
import { calculateRequestedMinutes, enforceGenerationQuotas, recordGenerationAudit } from '../services/generation.js';

type GenVideoParams = {
  prompt: string;
  storyboard?: string;
  duration: number;
  resolution: '1080p' | '2k' | '4k';
  fps?: number;
  aspect: '16:9' | '9:16' | '1:1';
  seed?: number;
  negative?: string;
  references: Array<{ url: string; label?: string }>;
  providerPolicy: string;
};

type GenTaskLike = {
  id: string;
  organizationId: string;
  params?: Record<string, unknown>;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const computeHash = async (filePath: string) => {
  const hash = crypto.createHash('sha256');
  const data = await fs.readFile(filePath);
  hash.update(data);
  return hash.digest('hex');
};

const serializeJson = (value: unknown) => (value === undefined ? null : JSON.stringify(value));

const mergeMetadata = (current: string | null | undefined, patch: Record<string, unknown>) => {
  let base: Record<string, unknown> = {};
  if (typeof current === 'string') {
    try {
      base = JSON.parse(current) as Record<string, unknown>;
    } catch {
      base = {};
    }
  }
  return JSON.stringify({ ...base, ...patch });
};

const tenantForTask = (task: GenTaskLike) => task.organizationId;

const buildLicenseOverrides = (providerKey: string, params: GenVideoParams): Partial<LicenseRecord> => {
  const overrides: Partial<LicenseRecord> = {};
  if (providerKey === 'luma') {
    overrides.plan = `Dream Machine ${params.resolution.toUpperCase()}`;
  } else if (providerKey === 'haiper') {
    overrides.plan = `Haiper Studio ${params.resolution.toUpperCase()}`;
  } else if (providerKey === 'replicate' && params.providerPolicy?.startsWith('force:replicate:')) {
    const [, , forcedModel] = params.providerPolicy.split(':');
    if (forcedModel) {
      overrides.plan = `Replicate ${decodeURIComponent(forcedModel)}`;
    }
  }
  return overrides;
};

const runwayModelFromRoute = (route: RouteCandidate): RunwayModel => {
  const policy = route.policyOverride?.toLowerCase() ?? '';
  const provider = route.providerId.toLowerCase();
  if (policy.includes('alpha') || provider.includes('alpha')) {
    return 'gen3-alpha';
  }
  return 'gen3-flash';
};

const resolveRouteRateCents = (route: RouteCandidate, params: GenVideoParams) => {
  const adapterKey = route.adapterKey ?? route.providerId;
  if (adapterKey === 'runway') {
    return getRunwayRateCents(runwayModelFromRoute(route));
  }
  if (adapterKey === 'luma') {
    return getLumaRateCents(params.resolution);
  }
  if (adapterKey === 'haiper') {
    return getHaiperRateCents();
  }
  return 0;
};

const GEN_STATUS_MAP: Record<string, number> = {
  GEN_RATE_LIMIT: 429,
  GEN_CONTENT_VIOLATION: 422,
  GEN_PROVIDER_ERROR: 502,
  GEN_TIMEOUT: 504,
  GEN_UNSUPPORTED: 400,
  GEN_INTERNAL: 500
};

const normalizeGenCode = (code?: string) =>
  typeof code === 'string' && code.startsWith('GEN_') ? code : 'GEN_PROVIDER_ERROR';

const buildGenHttpError = (
  code: string | undefined,
  message: string,
  details?: Record<string, unknown>
) => {
  const normalized = normalizeGenCode(code);
  const status = GEN_STATUS_MAP[normalized] ?? 500;
  return new HttpError(status, normalized, message, details);
};

const wrapProviderError = (
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
  details?: Record<string, unknown>
) => {
  if (error instanceof HttpError) {
    return error;
  }
  const message = error instanceof Error ? error.message : fallbackMessage;
  return buildGenHttpError(fallbackCode, message, details);
};

const emitGenEvent = async (
  taskId: string,
  generationId: string,
  step: 'prepare' | 'generate' | 'upscale' | 'compose' | 'complete',
  progress: number,
  status: 'running' | 'success' | 'failed',
  etaSeconds?: number,
  files?: ArtifactRecord[]
) => {
  await prisma.generationEvent.create({
    data: {
      generationId,
      status,
      step,
      payload: serializeJson(files ? { files } : undefined)
    }
  });
  ssePush(taskId, {
    id: taskId,
    status,
    progress,
    phase: 'GEN',
    step,
    eta: etaSeconds ? `${etaSeconds}s` : undefined,
    files,
    metrics: {}
  });
  await prisma.task.update({
    where: { id: taskId },
    data: { progress, eta: etaSeconds ? `${etaSeconds}s` : null }
  });
};

const ensureRequiredAssets = (assets: VideoGenAsset[], params: GenVideoParams) => {
  const kinds = new Set(assets.map((asset) => asset.kind));
  const summary = JSON.stringify(
    {
      prompt: params.prompt,
      negative: params.negative,
      storyboard: params.storyboard,
      duration: params.duration,
      resolution: params.resolution,
      fps: params.fps ?? 24,
      aspect: params.aspect,
      references: params.references
    },
    null,
    2
  );
  const ensure = (kind: VideoGenAsset['kind'], filename: string, mime: string, content: string) => {
    assets.push({
      kind,
      filename,
      mime,
      buffer: Buffer.from(content)
    });
  };
  if (!kinds.has('primary')) {
    ensure('primary', 'primary.mp4', 'video/mp4', `MOCK_PRIMARY_${params.prompt.slice(0, 24)}`);
  }
  if (!kinds.has('preview')) {
    ensure('preview', 'preview.mp4', 'video/mp4', `MOCK_PREVIEW_${params.prompt.slice(0, 24)}`);
  }
  if (!kinds.has('cover')) {
    ensure('cover', 'cover.jpg', 'image/jpeg', `MOCK_COVER_${params.prompt.slice(0, 24)}`);
  }
  if (!kinds.has('metadata')) {
    assets.push({
      kind: 'metadata',
      filename: 'metadata.json',
      mime: 'application/json',
      buffer: Buffer.from(summary)
    });
  }
  return assets;
};

const writeAssets = async (taskId: string, workspace: string, assets: VideoGenAsset[]) => {
  const records: Record<string, ArtifactRecord> = {};
  for (const asset of assets) {
    const target = join(workspace, asset.filename);
    await fs.writeFile(target, asset.buffer);
    const storagePath = absoluteToStorageUri(target);
    records[asset.kind] = {
      name: asset.kind,
      path: storagePath,
      type: asset.mime,
      size: asset.buffer.length,
      createdAt: new Date().toISOString(),
      metadata: asset.metadata ?? {}
    };
  }
  await saveArtifacts(taskId, { artifacts: records });
  return records;
};

const parseGenVideoParams = (task: GenTaskLike): GenVideoParams => {
  const params = (task.params ?? {}) as Record<string, unknown>;
  if (params.kind !== 'gen_video') {
    throw new Error('GEN_UNSUPPORTED: task is not gen_video');
  }
  return {
    prompt: String(params.prompt ?? ''),
    storyboard: typeof params.storyboard === 'string' ? params.storyboard : undefined,
    duration: Number(params.duration ?? 0),
    resolution: params.resolution as GenVideoParams['resolution'],
    fps: params.fps ? Number(params.fps) : undefined,
    aspect: (params.aspect as GenVideoParams['aspect']) ?? '16:9',
    seed: params.seed ? Number(params.seed) : undefined,
    negative: typeof params.negative === 'string' ? params.negative : undefined,
    references: Array.isArray(params.references)
      ? params.references
          .filter((item): item is { url: string; label?: string } => typeof item?.url === 'string')
          .map((item) => ({ url: item.url, label: item.label }))
      : [],
    providerPolicy: typeof params.providerPolicy === 'string' ? params.providerPolicy : 'balanced'
  };
};

export const runGenVideo = async (task: GenTaskLike) => {
  let generationId: string | null = null;
  try {
    const params = parseGenVideoParams(task);
    const workspace = await ensureTaskDir(task.id);
     const tenantId = tenantForTask(task);
     const estimatedMinutes = calculateRequestedMinutes(params.duration);
    const routes = buildGenerationRoutes(params.providerPolicy);
    const plan =
      routes.length > 0
        ? routes
        : [{ providerId: 'mock', adapterKey: 'mock', policyOverride: params.providerPolicy }];
    const originalPolicy = params.providerPolicy;
    const routeRates = plan.map((route) => resolveRouteRateCents(route, params));
    let activePricePerMin = routeRates[0] ?? 0;

    let generation = await prisma.generation.create({
      data: {
        taskId: task.id,
        organizationId: task.organizationId,
        tenantId,
        provider: plan[0].adapterKey ?? plan[0].providerId,
        policy: plan[0].policyOverride,
        estimatedMinutes,
        pricePerMinCents: activePricePerMin,
        prompt: params.prompt,
        negativePrompt: params.negative ?? null,
        durationSec: params.duration,
        resolution: params.resolution,
        fps: params.fps ?? null,
        aspectRatio: params.aspect,
        seed: params.seed ?? null,
        metadata: serializeJson({
          storyboard: params.storyboard,
          references: params.references
        })
      }
    });
    generationId = generation.id;

    await enforceGenerationQuotas({
      generationId: generation.id,
      organizationId: task.organizationId,
      tenantId,
      estimatedMinutes
    });

    const executeAttempt = async (policyOverride: string) => {
      const attemptParams: GenVideoParams = { ...params, providerPolicy: policyOverride };
      const adapter = getVideoGenAdapter(attemptParams.providerPolicy);
      await emitGenEvent(task.id, generation.id, 'prepare', 5, 'running');
      const submission = await adapter
        .submit({
          prompt: attemptParams.prompt,
          negative: attemptParams.negative,
          storyboard: attemptParams.storyboard,
          duration: attemptParams.duration,
          resolution: attemptParams.resolution,
          fps: attemptParams.fps,
          aspect: attemptParams.aspect,
          seed: attemptParams.seed,
          references: attemptParams.references,
          policy: attemptParams.providerPolicy
        })
        .catch((error) => {
          throw wrapProviderError(error, 'GEN_PROVIDER_ERROR', 'Provider submission failed', {
            provider: adapter.name,
            policy: attemptParams.providerPolicy
          });
        });

      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: 'running', externalId: submission.requestId }
      });

      const fetchAssetsFromProvider = async () => {
        try {
          return await adapter.fetchAssets(submission.requestId);
        } catch (error: unknown) {
          throw wrapProviderError(
            error,
            'GEN_PROVIDER_ERROR',
            'Failed to fetch assets from provider',
            {
              provider: adapter.name,
              requestId: submission.requestId
            }
          );
        }
      };

      let completedAssets: VideoGenAsset[] | null = null;
      let finalCostCents: number | null = null;
      while (!completedAssets) {
        const status = await adapter
          .poll(submission.requestId)
          .catch((error) =>
            Promise.reject(
              wrapProviderError(error, 'GEN_PROVIDER_ERROR', 'Provider polling failed', {
                provider: adapter.name,
                requestId: submission.requestId
              })
            )
          );

        if (status.status === 'failed') {
          await prisma.generation.update({
            where: { id: generation.id },
            data: {
              status: 'failed',
              metadata: mergeMetadata(generation.metadata, {
                errorCode: status.errorCode,
                errorMessage: status.errorMessage
              })
            }
          });
          if (status.errorCode === 'GEN_CONTENT_VIOLATION') {
            await recordGenerationAudit({
              generationId: generation.id,
              organizationId: task.organizationId,
              event: 'content_violation',
              details: {
                message: status.errorMessage,
                provider: adapter.name
              }
            });
          }
          await emitGenEvent(
            task.id,
            generation.id,
            'generate',
            Math.round(status.progress * 80) + 10,
            'failed'
          );
          const failure = buildGenHttpError(
            status.errorCode ?? 'GEN_PROVIDER_ERROR',
            status.errorMessage || 'Generation failed',
            {
              provider: adapter.name,
              requestId: submission.requestId
            }
          );
          logger.warn(
            { taskId: task.id, provider: adapter.name, code: failure.code },
            'Video generation failed'
          );
          throw failure;
        }

        if (status.status === 'success') {
          completedAssets =
            status.assets && status.assets.length ? status.assets : await fetchAssetsFromProvider();
          const resolvedDuration = status.durationSec ?? generation.durationSec ?? params.duration;
          const billedMinutes = calculateRequestedMinutes(resolvedDuration ?? params.duration);
          const billedCents = Math.max(0, activePricePerMin) * billedMinutes;
          finalCostCents = status.costCents ?? billedCents ?? 0;
          const safeCost = finalCostCents ?? 0;
          const appliedRate =
            activePricePerMin || (billedMinutes ? Math.round(safeCost / billedMinutes) : 0);
          await prisma.generation.update({
            where: { id: generation.id },
            data: {
              status: 'success',
              durationSec: resolvedDuration,
              costCents: finalCostCents,
              pricePerMinCents: appliedRate,
              billedMinutes,
              billedCents
            }
          });
          await emitGenEvent(task.id, generation.id, 'generate', 80, 'running', status.etaSeconds);
          break;
        }

        const progress = Math.round(status.progress * 70) + 10;
        await emitGenEvent(task.id, generation.id, 'generate', progress, 'running', status.etaSeconds);
        await delay(1500);
      }

      const assetsForWrite =
        completedAssets && completedAssets.length ? completedAssets : await fetchAssetsFromProvider();

      await emitGenEvent(task.id, generation.id, 'upscale', 85, 'running');
      const finalizedAssets = ensureRequiredAssets(assetsForWrite ?? [], attemptParams);
      const artifacts = await writeAssets(task.id, workspace, finalizedAssets);
      const filesForSse = Object.values(artifacts);
      await emitGenEvent(task.id, generation.id, 'compose', 95, 'running');
      await emitGenEvent(task.id, generation.id, 'complete', 100, 'success', undefined, filesForSse);

      const assetEntries = await Promise.all(
        Object.values(artifacts).map(async (artifact) => ({
          generationId: generation.id,
          kind: artifact.name,
          path: artifact.path,
          size: artifact.size ?? 0,
          hash: await computeHash(storageUriToAbsolutePath(artifact.path)),
          metadata: serializeJson(artifact.metadata ?? {})
        }))
      );
      await prisma.generationAsset.createMany({ data: assetEntries });
      await runQcIfEnabled(task, workspace, artifacts);

      return { artifacts, costCents: finalCostCents ?? 0 };
    };

    let finalArtifacts: Record<string, ArtifactRecord> | null = null;
    let finalCostCents = 0;
    let activeRoute: RouteCandidate | null = null;
    let previousProviderLabel = 'initial';
    let lastError: Error | null = null;

    for (let index = 0; index < plan.length; index += 1) {
      const route = plan[index];
      activeRoute = route;
      activePricePerMin = routeRates[index] ?? activePricePerMin;
      if (index > 0) {
        generation = await prisma.generation.update({
          where: { id: generation.id },
          data: {
            provider: route.adapterKey ?? route.providerId,
            policy: route.policyOverride,
            pricePerMinCents: activePricePerMin
          }
        });
      }
      recordGenerationRouteDecision(originalPolicy, previousProviderLabel, route.providerId);

      let routeError: Error | null = null;
      for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
        const attemptStart = Date.now();
        try {
          const result = await executeAttempt(route.policyOverride);
          const latency = Date.now() - attemptStart;
          recordRouteOutcomeStats(route.providerId, true, latency, result.costCents);
          finalArtifacts = result.artifacts;
          finalCostCents = result.costCents;
          previousProviderLabel = route.providerId;
          lastError = null;
          break;
        } catch (error: unknown) {
          routeError = error as Error;
          const latency = Date.now() - attemptStart;
          recordRouteOutcomeStats(route.providerId, false, latency);
          lastError = routeError;
          if (attemptIndex < 1) {
            await delay(300 * 2 ** attemptIndex);
          }
        }
      }

      if (finalArtifacts) {
        break;
      }

      const nextRoute = plan[index + 1];
      if (nextRoute) {
        const reason =
          routeError instanceof HttpError && routeError.code ? routeError.code : 'GEN_PROVIDER_ERROR';
        await prisma.generationEvent.create({
          data: {
            generationId: generation.id,
            status: 'failed',
            step: 'fallback',
            payload: JSON.stringify({
              fallback_from: route.providerId,
              fallback_to: nextRoute.providerId,
              reason
            })
          }
        });
        recordGenerationFallback(route.providerId, nextRoute.providerId, reason);
        await recordGenerationAudit({
          generationId: generation.id,
          organizationId: task.organizationId,
          event: 'fallback',
          details: {
            from: route.providerId,
            to: nextRoute.providerId,
            reason
          }
        });
        previousProviderLabel = route.providerId;
        continue;
      }

      break;
    }

    if (!finalArtifacts) {
      throw lastError ?? new Error('GEN_PROVIDER_ERROR: all providers failed');
    }

    const licenseKey = activeRoute?.providerId ?? plan[0]?.providerId ?? 'default';
    const licenseRecord = resolveLicenseRecord(licenseKey, buildLicenseOverrides(licenseKey, params));
    await writeLicenseFile(task.id, workspace, licenseRecord);
    const updatedMetadata = mergeMetadata(generation.metadata, { license: licenseRecord });
    generation = await prisma.generation.update({
      where: { id: generation.id },
      data: { metadata: updatedMetadata }
    });

    if (finalCostCents > 0) {
      recordGenerationCost(activeRoute?.providerId ?? 'unknown', originalPolicy, finalCostCents);
    }

    return finalArtifacts;
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      if (generationId && error.code === 'GEN_CONTENT_VIOLATION') {
        await recordGenerationAudit({
          generationId,
          organizationId: task.organizationId,
          event: 'content_violation',
          details: { message: error.message }
        });
      }
      throw error;
    }
    logger.error({ err: error, taskId: task.id }, 'gen_video orchestrator error');
    throw buildGenHttpError('GEN_INTERNAL', 'Generation orchestrator failed', {
      taskId: task.id
    });
  }
};

const runQcIfEnabled = async (
  task: GenTaskLike,
  workspace: string,
  artifacts: Record<string, ArtifactRecord>
) => {
  if (!env.QC_ENABLE) return;
  const primary = artifacts.primary;
  if (!primary?.path) return;
  const primaryPath = storageUriToAbsolutePath(primary.path);
  let qcResult: QCResult | null = await runVideoQc(primaryPath);
  let fixesApplied: string[] = [];

  if (!qcResult.passed && isFixableResult(qcResult)) {
    const fixed = await applyQcFixes(primaryPath, qcResult);
    if (fixed) {
      fixesApplied = qcResult.fixes?.map((fix) => fix.action) ?? [];
      qcResult = await runVideoQc(primaryPath);
    }
  }

  if (!qcResult.passed) {
    throw new HttpError(502, 'GEN_QC_FAIL', 'Video failed QC', {
      issues: qcResult.issues
    });
  }

  await writeQcMetadata(workspace, artifacts, qcResult, fixesApplied);
  const stats = await fs.stat(primaryPath);
  artifacts.primary.size = stats.size;
  await saveArtifacts(task.id, { artifacts });
};

const writeQcMetadata = async (
  workspace: string,
  artifacts: Record<string, ArtifactRecord>,
  qcResult: QCResult,
  fixesApplied: string[]
) => {
  const now = new Date().toISOString();
  let metadataRecord = artifacts.metadata;
  let metadataPath: string;
  if (metadataRecord?.path) {
    metadataPath = storageUriToAbsolutePath(metadataRecord.path);
  } else {
    metadataPath = join(workspace, 'metadata.json');
  }

  let data: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(metadataPath, 'utf8').catch(() => null);
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  data.qc = {
    timestamp: now,
    passed: qcResult.passed,
    issues: qcResult.issues,
    fixesApplied,
    metrics: qcResult.metrics ?? {}
  };

  await fs.writeFile(metadataPath, JSON.stringify(data, null, 2));
  const stats = await fs.stat(metadataPath);
  const storagePath = metadataRecord?.path ?? absoluteToStorageUri(metadataPath);
  artifacts.metadata = {
    name: 'metadata',
    path: storagePath,
    type: 'application/json',
    size: stats.size,
    createdAt: now,
    metadata: metadataRecord?.metadata ?? {}
  };
};
