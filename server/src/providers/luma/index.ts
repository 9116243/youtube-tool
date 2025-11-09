import { HttpError } from '../../utils/http-error';
import { appEnv } from '../../utils/env';
import type { VideoGenAdapter, VideoGenAsset, VideoGenPollResponse, VideoGenSubmitRequest } from '../types';
import { buildLumaJobConfig, type LumaJobConfig } from './mapping';
import { estimateLumaCostCents } from './cost';
import { recordGenerationProviderRequest } from '../../metrics/generation';

type LumaGenerationResponse = {
  id: string;
  status: 'pending' | 'queued' | 'generating' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  eta_seconds?: number;
  duration?: number;
  duration_seconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  stage?: string;
  video_url?: string;
  preview_url?: string;
  cover_url?: string;
  assets?: {
    video?: string;
    preview?: string;
    thumbnail?: string;
    cover?: string;
  };
  output?: {
    video?: string;
    preview?: string;
    cover?: string;
    thumbnail?: string;
  };
  metadata?: Record<string, unknown>;
  error?: { code?: string; message?: string };
};

const PROVIDER = 'luma';
const API_GENERATIONS = '/v1/generations';
const MAX_HTTP_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 400;

const jobCache = new Map<string, LumaJobConfig>();
const waiters: Array<() => void> = [];
let inflight = 0;

const acquireSlot = () =>
  new Promise<void>((resolve) => {
    if (inflight < appEnv.LUMA_MAX_CONCURRENCY) {
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
  if (!appEnv.LUMA_API_KEY) {
    throw new HttpError(500, 'GEN_PROVIDER_ERROR', 'Luma provider is not configured');
  }
};

const computeBackoff = (attempt: number) =>
  Math.min(4000, BACKOFF_BASE_MS * 2 ** attempt) + Math.round(Math.random() * 150);

const extractError = (payload: unknown) => {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const err = (payload as Record<string, unknown>).error;
    if (err && typeof err === 'object') {
      return err as { code?: string; message?: string };
    }
  }
  return undefined;
};

const mapLumaError = (status: number, payload: unknown) => {
  const error = extractError(payload);
  const message =
    error?.message ??
    (typeof payload === 'object' && payload && 'message' in payload
      ? String((payload as Record<string, unknown>).message)
      : 'Luma API request failed');

  if (status === 429) {
    return new HttpError(429, 'GEN_RATE_LIMIT', message, payload);
  }

  if (
    status === 422 ||
    status === 403 ||
    error?.code === 'content_policy' ||
    (message && /content|safety/i.test(message))
  ) {
    return new HttpError(422, 'GEN_CONTENT_VIOLATION', message, payload);
  }

  const normalizedStatus = status >= 500 ? 502 : status;
  return new HttpError(normalizedStatus, 'GEN_PROVIDER_ERROR', message, payload);
};

const recordProviderOutcome = (action: string, outcome: 'success' | 'error') => {
  recordGenerationProviderRequest(PROVIDER, action, outcome);
};

const lumaJsonRequest = async <T>(method: string, path: string, action: string, body?: unknown): Promise<T> => {
  ensureConfigured();
  for (let attempt = 0; attempt < MAX_HTTP_ATTEMPTS; attempt += 1) {
    let shouldRetry = false;
    let retryDelay = 0;
    await acquireSlot();
    try {
      const response = await fetch(`${appEnv.LUMA_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${appEnv.LUMA_API_KEY}`,
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
        throw mapLumaError(response.status, payload);
      } else {
        recordProviderOutcome(action, 'success');
        return payload as T;
      }
    } catch (error) {
      recordProviderOutcome(action, 'error');
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
  throw new HttpError(503, 'GEN_RATE_LIMIT', 'Luma API retry budget exceeded');
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
          Authorization: `Bearer ${appEnv.LUMA_API_KEY}`,
        },
      });
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_HTTP_ATTEMPTS - 1) {
        shouldRetry = true;
        retryDelay = computeBackoff(attempt);
      } else if (!response.ok) {
        throw mapLumaError(response.status, { url, label });
      } else {
        recordProviderOutcome(label, 'success');
        const buffer = Buffer.from(await response.arrayBuffer());
        return buffer;
      }
    } catch (error) {
      recordProviderOutcome(label, 'error');
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
  throw new HttpError(503, 'GEN_RATE_LIMIT', `Unable to download ${label} from Luma`, { url });
};

const videoUrlFromResponse = (payload: LumaGenerationResponse) =>
  payload.video_url ??
  payload.assets?.video ??
  payload.output?.video ??
  payload.preview_url ??
  null;

const previewUrlFromResponse = (payload: LumaGenerationResponse) =>
  payload.preview_url ?? payload.assets?.preview ?? payload.output?.preview ?? null;

const coverUrlFromResponse = (payload: LumaGenerationResponse) =>
  payload.cover_url ??
  payload.assets?.cover ??
  payload.assets?.thumbnail ??
  payload.output?.cover ??
  payload.output?.thumbnail ??
  null;

const placeholderCover = (jobId: string) =>
  Buffer.from(`LUMA_COVER_PLACEHOLDER_${jobId}_${Date.now().toString(36)}`);

const buildAssetsFromResponse = async (
  jobId: string,
  payload: LumaGenerationResponse,
  ctx?: LumaJobConfig,
): Promise<VideoGenAsset[]> => {
  const videoUrl = videoUrlFromResponse(payload);
  if (!videoUrl) {
    throw new HttpError(502, 'GEN_PROVIDER_ERROR', 'Luma returned no video URL', { jobId });
  }
  const videoBuffer = await downloadAsset(videoUrl, 'download_video');
  const previewUrl = previewUrlFromResponse(payload);
  const previewBuffer = previewUrl ? await downloadAsset(previewUrl, 'download_preview') : Buffer.from(videoBuffer);
  const coverUrl = coverUrlFromResponse(payload);
  const coverBuffer = coverUrl ? await downloadAsset(coverUrl, 'download_cover') : placeholderCover(jobId);
  const metadata = {
    jobId,
    status: payload.status,
    duration: payload.duration_seconds ?? payload.duration ?? ctx?.payload.duration,
    width: payload.width ?? ctx?.payload.width,
    height: payload.height ?? ctx?.payload.height,
    fps: payload.fps ?? ctx?.payload.fps,
    assets: payload.assets ?? payload.output,
    stage: payload.stage,
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
  return Math.min(0.99, Math.max(0.05, value ?? 0));
};

const makeRunningResponse = (payload: LumaGenerationResponse): VideoGenPollResponse => ({
  status: 'running',
  progress: clampProgress(payload.progress),
  etaSeconds: payload.eta_seconds,
});

const determineCost = (payload: LumaGenerationResponse, ctx?: LumaJobConfig) => {
  const resolution = ctx?.resolution ?? '1080p';
  const duration = payload.duration_seconds ?? payload.duration ?? ctx?.payload.duration ?? 0;
  return estimateLumaCostCents(duration, resolution);
};

export const lumaVideoGenAdapter: VideoGenAdapter = {
  name: PROVIDER,
  async submit(request: VideoGenSubmitRequest) {
    const config = buildLumaJobConfig(request);
    const response = await lumaJsonRequest<LumaGenerationResponse>(
      'POST',
      API_GENERATIONS,
      'submit',
      config.payload,
    );
    if (!response?.id) {
      throw new HttpError(502, 'GEN_PROVIDER_ERROR', 'Luma did not return a generation id');
    }
    jobCache.set(response.id, config);
    return { requestId: response.id };
  },
  async poll(requestId: string) {
    const response = await lumaJsonRequest<LumaGenerationResponse>('GET', `${API_GENERATIONS}/${requestId}`, 'poll');
    if (response.status === 'failed' || response.status === 'cancelled') {
      jobCache.delete(requestId);
      const code = response.error?.code === 'content_policy' ? 'GEN_CONTENT_VIOLATION' : 'GEN_PROVIDER_ERROR';
      return {
        status: 'failed',
        progress: 1,
        errorCode: code,
        errorMessage: response.error?.message ?? 'Luma generation failed',
      };
    }
    if (response.status === 'completed') {
      const ctx = jobCache.get(requestId);
      jobCache.delete(requestId);
      const assets = await buildAssetsFromResponse(requestId, response, ctx);
      const costCents = determineCost(response, ctx);
      const durationSec = response.duration_seconds ?? response.duration ?? ctx?.payload.duration;
      return {
        status: 'success',
        progress: 1,
        durationSec: durationSec ?? undefined,
        costCents,
        assets,
      };
    }
    return makeRunningResponse(response);
  },
  async fetchAssets(requestId: string) {
    const response = await lumaJsonRequest<LumaGenerationResponse>(
      'GET',
      `${API_GENERATIONS}/${requestId}`,
      'fetch',
    );
    if (response.status !== 'completed') {
      throw new HttpError(
        409,
        'GEN_PROVIDER_ERROR',
        'Luma assets are not ready',
        { requestId, status: response.status },
      );
    }
    const ctx = jobCache.get(requestId);
    jobCache.delete(requestId);
    return buildAssetsFromResponse(requestId, response, ctx);
  },
  async cancel(requestId: string) {
    try {
      await lumaJsonRequest('DELETE', `${API_GENERATIONS}/${requestId}`, 'cancel');
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
