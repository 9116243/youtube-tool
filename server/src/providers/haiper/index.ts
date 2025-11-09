import { HttpError } from '../../utils/http-error';
import { appEnv } from '../../utils/env';
import { logger } from '../../utils/logger';
import type { VideoGenAdapter, VideoGenAsset, VideoGenPollResponse, VideoGenSubmitRequest } from '../types';
import { buildHaiperJobConfig, type HaiperJobConfig } from './mapping';
import { estimateHaiperCostCents } from './cost';
import { recordGenerationProviderRequest } from '../../metrics/generation';

type HaiperGeneration = {
  id: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed';
  progress?: number;
  eta_seconds?: number;
  duration?: number;
  video_url?: string;
  preview_url?: string;
  cover_url?: string;
  output?: {
    video?: string;
    preview?: string;
    cover?: string;
  };
  metadata?: Record<string, unknown>;
  error?: { code?: string; message?: string };
};

const PROVIDER = 'haiper';
const API_PATH_GENERATIONS = '/v1/generations';
const MAX_HTTP_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 250;
const FALLBACK_NOTE = 'supports cross-vendor fallback';

const jobCache = new Map<string, HaiperJobConfig>();
const waiters: Array<() => void> = [];
let inflight = 0;

const acquireSlot = () =>
  new Promise<void>((resolve) => {
    if (inflight < appEnv.HAIPER_MAX_CONCURRENCY) {
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureConfigured = () => {
  if (!appEnv.HAIPER_API_KEY) {
    throw new HttpError(500, 'GEN_PROVIDER_ERROR', 'Haiper provider is not configured');
  }
};

const computeBackoff = (attempt: number) =>
  Math.min(4000, BACKOFF_BASE_MS * 2 ** attempt) + Math.round(Math.random() * 120);

const extractError = (payload: unknown) => {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const err = (payload as Record<string, unknown>).error;
    if (err && typeof err === 'object') {
      return err as { code?: string; message?: string };
    }
  }
  return undefined;
};

const mapHaiperError = (status: number, payload: unknown) => {
  const err = extractError(payload);
  const message =
    err?.message ??
    (typeof payload === 'object' && payload && 'message' in payload
      ? String((payload as Record<string, unknown>).message)
      : 'Haiper API request failed');
  if (status === 429) {
    return new HttpError(429, 'GEN_RATE_LIMIT', message, payload);
  }
  if (status === 422 || status === 403 || err?.code === 'content_policy') {
    return new HttpError(422, 'GEN_CONTENT_VIOLATION', message, payload);
  }
  return new HttpError(status >= 500 ? 502 : status, 'GEN_PROVIDER_ERROR', message, payload);
};

const recordOutcome = (action: string, outcome: 'success' | 'error') => {
  recordGenerationProviderRequest(PROVIDER, action, outcome);
};

const haiperJsonRequest = async <T>(method: string, path: string, action: string, body?: unknown): Promise<T> => {
  ensureConfigured();
  for (let attempt = 0; attempt < MAX_HTTP_ATTEMPTS; attempt += 1) {
    let shouldRetry = false;
    let retryDelay = 0;
    await acquireSlot();
    try {
      const response = await fetch(`${appEnv.HAIPER_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${appEnv.HAIPER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as unknown) : undefined;
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_HTTP_ATTEMPTS - 1) {
        shouldRetry = true;
        retryDelay = computeBackoff(attempt);
      } else if (!response.ok) {
        throw mapHaiperError(response.status, payload);
      } else {
        recordOutcome(action, 'success');
        return payload as T;
      }
    } catch (error) {
      recordOutcome(action, 'error');
      if (
        error instanceof HttpError &&
        error.code === 'GEN_RATE_LIMIT' &&
        attempt < MAX_HTTP_ATTEMPTS - 1
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
  throw new HttpError(503, 'GEN_RATE_LIMIT', 'Haiper API retry budget exceeded');
};

const downloadAsset = async (url: string, label: string) => {
  ensureConfigured();
  for (let attempt = 0; attempt < MAX_HTTP_ATTEMPTS; attempt += 1) {
    let shouldRetry = false;
    let retryDelay = 0;
    await acquireSlot();
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${appEnv.HAIPER_API_KEY}`,
        },
      });
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_HTTP_ATTEMPTS - 1) {
        shouldRetry = true;
        retryDelay = computeBackoff(attempt);
      } else if (!response.ok) {
        throw mapHaiperError(response.status, { url, label });
      } else {
        recordOutcome(label, 'success');
        const buffer = Buffer.from(await response.arrayBuffer());
        return buffer;
      }
    } catch (error) {
      recordOutcome(label, 'error');
      if (
        error instanceof HttpError &&
        error.code === 'GEN_RATE_LIMIT' &&
        attempt < MAX_HTTP_ATTEMPTS - 1
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
  throw new HttpError(503, 'GEN_RATE_LIMIT', `Unable to download ${label} from Haiper`, { url });
};

const videoUrlFromResponse = (payload: HaiperGeneration) =>
  payload.video_url ?? payload.output?.video ?? payload.preview_url ?? null;

const previewUrlFromResponse = (payload: HaiperGeneration) =>
  payload.preview_url ?? payload.output?.preview ?? null;

const coverUrlFromResponse = (payload: HaiperGeneration) =>
  payload.cover_url ?? payload.output?.cover ?? null;

const placeholderCover = (jobId: string) =>
  Buffer.from(`HAIPER_COVER_PLACEHOLDER_${jobId}_${Date.now().toString(36)}`);

const buildAssetsFromResponse = async (
  jobId: string,
  payload: HaiperGeneration,
  ctx?: HaiperJobConfig,
): Promise<VideoGenAsset[]> => {
  const videoUrl = videoUrlFromResponse(payload);
  if (!videoUrl) {
    throw new HttpError(502, 'GEN_PROVIDER_ERROR', 'Haiper returned no video URL', { jobId });
  }
  const videoBuffer = await downloadAsset(videoUrl, 'download_video');
  const previewUrl = previewUrlFromResponse(payload);
  const previewBuffer = previewUrl ? await downloadAsset(previewUrl, 'download_preview') : Buffer.from(videoBuffer);
  const coverUrl = coverUrlFromResponse(payload);
  const coverBuffer = coverUrl ? await downloadAsset(coverUrl, 'download_cover') : placeholderCover(jobId);
  const metadata = {
    jobId,
    status: payload.status,
    duration: payload.duration ?? ctx?.payload.duration,
    metadata: payload.metadata,
  };
  return [
    {
      kind: 'primary',
      filename: 'primary.mp4',
      mime: 'video/mp4',
      buffer: videoBuffer,
    },
    {
      kind: 'preview',
      filename: 'preview.mp4',
      mime: 'video/mp4',
      buffer: previewBuffer,
    },
    {
      kind: 'cover',
      filename: 'cover.jpg',
      mime: 'image/jpeg',
      buffer: coverBuffer,
    },
    {
      kind: 'metadata',
      filename: 'metadata.json',
      mime: 'application/json',
      buffer: Buffer.from(JSON.stringify(metadata, null, 2)),
    },
  ];
};

const clampProgress = (value?: number) => {
  if (!Number.isFinite(value ?? NaN)) return 0.05;
  return Math.min(0.99, Math.max(0.05, Number(value ?? 0)));
};

const makeRunningResponse = (payload: HaiperGeneration): VideoGenPollResponse => ({
  status: 'running',
  progress: clampProgress(payload.progress),
  etaSeconds: payload.eta_seconds,
});

const fallbackMessage = (message?: string) =>
  message ? `${message} (${FALLBACK_NOTE})` : `Haiper generation failed (${FALLBACK_NOTE})`;

export const haiperVideoGenAdapter: VideoGenAdapter = {
  name: PROVIDER,
  async submit(request: VideoGenSubmitRequest) {
    const config = buildHaiperJobConfig(request);
    const response = await haiperJsonRequest<HaiperGeneration>('POST', API_PATH_GENERATIONS, 'submit', config.payload);
    if (!response?.id) {
      throw new HttpError(502, 'GEN_PROVIDER_ERROR', 'Haiper did not return a generation id');
    }
    jobCache.set(response.id, config);
    return { requestId: response.id };
  },
  async poll(requestId: string) {
    const response = await haiperJsonRequest<HaiperGeneration>('GET', `${API_PATH_GENERATIONS}/${requestId}`, 'poll');
    if (response.status === 'failed') {
      jobCache.delete(requestId);
      logger.warn('Haiper generation failed, supports cross-vendor fallback', { provider: PROVIDER, requestId });
      return {
        status: 'failed',
        progress: 1,
        errorCode: 'GEN_PROVIDER_ERROR',
        errorMessage: fallbackMessage(response.error?.message),
      };
    }
    if (response.status === 'completed') {
      const ctx = jobCache.get(requestId);
      jobCache.delete(requestId);
      const assets = await buildAssetsFromResponse(requestId, response, ctx);
      const durationSec = response.duration ?? ctx?.payload.duration ?? 0;
      const costCents = estimateHaiperCostCents(durationSec);
      return {
        status: 'success',
        progress: 1,
        durationSec,
        costCents,
        assets,
      };
    }
    return makeRunningResponse(response);
  },
  async fetchAssets(requestId: string) {
    const response = await haiperJsonRequest<HaiperGeneration>('GET', `${API_PATH_GENERATIONS}/${requestId}`, 'fetch');
    if (response.status !== 'completed') {
      throw new HttpError(409, 'GEN_PROVIDER_ERROR', 'Haiper assets are not ready', {
        requestId,
        status: response.status,
      });
    }
    const ctx = jobCache.get(requestId);
    jobCache.delete(requestId);
    return buildAssetsFromResponse(requestId, response, ctx);
  },
  async cancel(requestId: string) {
    try {
      await haiperJsonRequest('DELETE', `${API_PATH_GENERATIONS}/${requestId}`, 'cancel');
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
