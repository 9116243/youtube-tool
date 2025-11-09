import fetch from 'node-fetch';
import type { VideoGenAdapter, VideoGenAsset, VideoGenPollResponse, VideoGenSubmitRequest } from '../types';
import { appEnv } from '../../utils/env';
import { HttpError } from '../../utils/http-error';
import { buildReplicateInput } from './mapping';
import { recordGenerationProviderRequest } from '../../metrics/generation';

type ReplicatePrediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: Array<string | { url?: string }>;
  error?: string;
  logs?: string;
  metrics?: { progress?: number };
  urls?: { get?: string; cancel?: string };
};

type CachedJob = {
  model: string;
  input: Record<string, unknown>;
};

const PROVIDER = 'replicate';
const DEFAULT_MODEL = 'black-forest-labs/flux-pro';

const waiters: Array<() => void> = [];
let inflight = 0;

const jobCache = new Map<string, CachedJob>();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const acquireSlot = () =>
  new Promise<void>((resolve) => {
    if (inflight < appEnv.REPLICATE_MAX_CONCURRENCY) {
      inflight += 1;
      resolve();
      return;
    }
    waiters.push(resolve);
  });

const releaseSlot = () => {
  inflight = Math.max(0, inflight - 1);
  const next = waiters.shift();
  if (next) {
    inflight += 1;
    next();
  }
};

const ensureConfigured = () => {
  if (!appEnv.REPLICATE_API_TOKEN) {
    throw new HttpError(500, 'GEN_PROVIDER_ERROR', 'Replicate provider not configured');
  }
};

const computeBackoff = (attempt: number) =>
  Math.min(4000, 300 * 2 ** attempt) + Math.round(Math.random() * 150);

const replicateRequest = async <T>(
  method: string,
  path: string,
  action: string,
  body?: Record<string, unknown>,
): Promise<T> => {
  ensureConfigured();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let shouldRetry = false;
    let retryDelay = 0;
    await acquireSlot();
    try {
      const response = await fetch(`${appEnv.REPLICATE_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${appEnv.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as unknown) : undefined;
      if ((response.status === 429 || response.status >= 500) && attempt < 4) {
        shouldRetry = true;
        retryDelay = computeBackoff(attempt);
      } else if (!response.ok) {
        throw new HttpError(
          response.status >= 500 ? 502 : response.status,
          response.status === 403 || response.status === 422 ? 'GEN_CONTENT_VIOLATION' : 'GEN_PROVIDER_ERROR',
          (payload as Record<string, unknown>)?.error?.toString() ??
            (payload as Record<string, unknown>)?.detail?.toString() ??
            'Replicate request failed',
          payload,
        );
      } else {
        recordGenerationProviderRequest(PROVIDER, action, 'success');
        return payload as T;
      }
    } catch (error) {
      recordGenerationProviderRequest(PROVIDER, action, 'error');
      if (
        error instanceof HttpError &&
        error.code === 'GEN_RATE_LIMIT' &&
        attempt < 4
      ) {
        shouldRetry = true;
        retryDelay = computeBackoff(attempt);
      } else {
        throw error;
      }
    } finally {
      releaseSlot();
    }
    if (shouldRetry) {
      await delay(retryDelay);
    } else {
      break;
    }
  }
  throw new HttpError(503, 'GEN_RATE_LIMIT', 'Replicate API retry budget exceeded');
};

const downloadBinary = async (url: string, label: string) => {
  ensureConfigured();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let shouldRetry = false;
    let retryDelay = 0;
    await acquireSlot();
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${appEnv.REPLICATE_API_TOKEN}`,
        },
      });
      if ((response.status === 429 || response.status >= 500) && attempt < 4) {
        shouldRetry = true;
        retryDelay = computeBackoff(attempt);
      } else if (!response.ok) {
        throw new HttpError(response.status, 'GEN_PROVIDER_ERROR', `Replicate asset download failed (${label})`);
      } else {
        recordGenerationProviderRequest(PROVIDER, label, 'success');
        return Buffer.from(await response.arrayBuffer());
      }
    } catch (error) {
      recordGenerationProviderRequest(PROVIDER, label, 'error');
      if (
        error instanceof HttpError &&
        error.code === 'GEN_RATE_LIMIT' &&
        attempt < 4
      ) {
        shouldRetry = true;
        retryDelay = computeBackoff(attempt);
      } else {
        throw error;
      }
    } finally {
      releaseSlot();
    }
    if (shouldRetry) {
      await delay(retryDelay);
    } else {
      break;
    }
  }
  throw new HttpError(503, 'GEN_RATE_LIMIT', `Unable to download Replicate asset (${label})`);
};

const pickVideoOutput = (output: Array<string | { url?: string }> = []) => {
  const urls = output
    .map((item) => (typeof item === 'string' ? item : item?.url))
    .filter((url): url is string => Boolean(url));
  const videos = urls.filter((url) => /\.mp4($|\?)/i.test(url));
  const images = urls.filter((url) => /\.jpe?g$|\.png$|\.webp$/i.test(url));
  return {
    video: videos[0] ?? urls[0] ?? null,
    cover: images[0] ?? null,
    preview: videos[1] ?? videos[0] ?? null,
    all: urls,
  };
};

const resolveModel = (policy?: string) => {
  if (policy?.toLowerCase().startsWith('force:replicate')) {
    const [, , modelPath] = policy.split(':');
    if (modelPath) {
      return decodeURIComponent(modelPath);
    }
  }
  return DEFAULT_MODEL;
};

const buildAssetsFromPrediction = async (prediction: ReplicatePrediction): Promise<VideoGenAsset[]> => {
  const outputs = pickVideoOutput(prediction.output ?? []);
  const assets: VideoGenAsset[] = [];
  if (outputs.video) {
    const buffer = await downloadBinary(outputs.video, 'download_video');
    assets.push({
      kind: 'primary',
      filename: 'primary.mp4',
      mime: 'video/mp4',
      buffer,
      metadata: {
        provider: PROVIDER,
        providerRaw: {
          id: prediction.id,
          output: prediction.output,
        },
      },
    });
    if (outputs.preview) {
      const previewBuffer =
        outputs.preview === outputs.video
          ? Buffer.from(buffer)
          : await downloadBinary(outputs.preview, 'download_preview');
      assets.push({
        kind: 'preview',
        filename: 'preview.mp4',
        mime: 'video/mp4',
        buffer: previewBuffer,
      });
    }
  }
  if (outputs.cover) {
    const coverBuffer = await downloadBinary(outputs.cover, 'download_cover');
    assets.push({
      kind: 'cover',
      filename: 'cover.jpg',
      mime: 'image/jpeg',
      buffer: coverBuffer,
    });
  } else {
    assets.push({
      kind: 'cover',
      filename: 'cover.jpg',
      mime: 'image/jpeg',
      buffer: Buffer.from(`REP-${prediction.id}`),
    });
  }
  assets.push({
    kind: 'metadata',
    filename: 'metadata.json',
    mime: 'application/json',
    buffer: Buffer.from(JSON.stringify(prediction, null, 2)),
  });
  return assets;
};

const mapStatus = (prediction: ReplicatePrediction): VideoGenPollResponse => {
  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    return {
      status: 'failed',
      progress: 1,
      errorCode: 'GEN_PROVIDER_ERROR',
      errorMessage: prediction.error ?? 'Replicate generation failed',
    };
  }
  if (prediction.status === 'succeeded') {
    return {
      status: 'success',
      progress: 1,
      assets: [],
    };
  }
  const progress = prediction.metrics?.progress ?? (prediction.status === 'processing' ? 0.75 : 0.2);
  return {
    status: 'running',
    progress,
    etaSeconds: undefined,
  };
};

export const replicateVideoGenAdapter: VideoGenAdapter = {
  name: PROVIDER,
  async submit(request) {
    const model = resolveModel(request.policy);
    const input = buildReplicateInput(request);
    const prediction = await replicateRequest<ReplicatePrediction>('POST', '/v1/predictions', 'submit', {
      version: model,
      input,
    });
    if (!prediction?.id) {
      throw new HttpError(502, 'GEN_PROVIDER_ERROR', 'Replicate did not return an id');
    }
    jobCache.set(prediction.id, { model, input });
    return { requestId: prediction.id };
  },
  async poll(requestId) {
    const prediction = await replicateRequest<ReplicatePrediction>('GET', `/v1/predictions/${requestId}`, 'poll');
    const mapped = mapStatus(prediction);
    if (mapped.status === 'success') {
      const assets = await buildAssetsFromPrediction(prediction);
      return { ...mapped, assets };
    }
    return mapped;
  },
  async fetchAssets(requestId) {
    const prediction = await replicateRequest<ReplicatePrediction>('GET', `/v1/predictions/${requestId}`, 'fetch');
    if (prediction.status !== 'succeeded') {
      throw new HttpError(409, 'GEN_PROVIDER_ERROR', 'Replicate assets not ready', {
        id: prediction.id,
        status: prediction.status,
      });
    }
    return buildAssetsFromPrediction(prediction);
  },
  async cancel(requestId: string) {
    try {
      if (jobCache.has(requestId)) {
        await replicateRequest('POST', `/v1/predictions/${requestId}/cancel`, 'cancel');
      }
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        return;
      }
      throw error;
    } finally {
      jobCache.delete(requestId);
    }
  },
};
