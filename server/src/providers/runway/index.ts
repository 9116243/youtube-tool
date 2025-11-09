import { HttpError } from '../../utils/http-error';
import { appEnv } from '../../utils/env';
import type { VideoGenAdapter, VideoGenAsset, VideoGenPollResponse, VideoGenSubmitRequest } from '../types';
import { buildRunwayJobConfig, type RunwayJobConfig } from './mapping';
import { estimateRunwayCostCents } from './cost';
import { recordGenerationProviderRequest } from '../../metrics/generation';

type RunwayVideoResponse = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  eta?: number;
  eta_seconds?: number;
  output?: Array<{ url: string; type?: string; mime_type?: string }>;
  assets?: Array<{ url: string; type?: string }>;
  duration?: number;
  model?: string;
  ratio?: string;
  thumbnail_url?: string;
  preview_url?: string;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

const PROVIDER = 'runway';
const API_PATH_VIDEOS = '/v1/videos';
const MAX_HTTP_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 500;

const jobCache = new Map<string, RunwayJobConfig>();

const waiters: Array<() => void> = [];
let inflight = 0;

const acquireSlot = () =>
  new Promise<void>((resolve) => {
    if (inflight < appEnv.RUNWAY_MAX_CONCURRENCY) {
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
  if (!appEnv.RUNWAY_API_KEY) {
    throw new HttpError(500, 'GEN_PROVIDER_ERROR', 'Runway provider is not configured');
  }
};

const computeBackoff = (attempt: number) =>
  Math.min(5000, BACKOFF_BASE_MS * 2 ** attempt) + Math.round(Math.random() * 200);

const extractError = (payload: unknown) => {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const err = (payload as Record<string, unknown>).error;
    if (err && typeof err === 'object') {
      return err as { code?: string; message?: string };
    }
  }
  return undefined;
};

const buildContentViolation = (message: string, details?: unknown) =>
  new HttpError(422, 'GEN_CONTENT_VIOLATION', message, details);

const mapRunwayError = (status: number, payload: unknown) => {
  const err = extractError(payload);
  const details = err ?? payload;
  const message =
    err?.message ??
    (typeof payload === 'object' && payload && 'message' in payload
      ? String((payload as Record<string, unknown>).message)
      : 'Runway API request failed');
  if (status === 429) {
    return new HttpError(429, 'GEN_RATE_LIMIT', message, details);
  }
  if (status === 422 || status === 403) {
    if (err?.code === 'content_policy' || /content/i.test(message)) {
      return buildContentViolation(message, details);
    }
  }
  return new HttpError(status >= 500 ? 502 : status, 'GEN_PROVIDER_ERROR', message, details);
};

const recordProviderOutcome = (action: string, outcome: 'success' | 'error') => {
  recordGenerationProviderRequest(PROVIDER, action, outcome);
};

const runwayJsonRequest = async <T>(method: string, path: string, action: string, body?: unknown): Promise<T> => {
  ensureConfigured();
  for (let attempt = 0; attempt < MAX_HTTP_ATTEMPTS; attempt += 1) {
    let shouldRetry = false;
    let retryDelay = 0;
    await acquireSlot();
    try {
      const response = await fetch(`${appEnv.RUNWAY_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${appEnv.RUNWAY_API_KEY}`,
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
        throw mapRunwayError(response.status, payload);
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
  throw new HttpError(503, 'GEN_RATE_LIMIT', 'Runway API retry budget exceeded');
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
          Authorization: `Bearer ${appEnv.RUNWAY_API_KEY}`,
        },
      });
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_HTTP_ATTEMPTS - 1) {
        shouldRetry = true;
        retryDelay = computeBackoff(attempt);
      } else if (!response.ok) {
        throw mapRunwayError(response.status, { url, label });
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
  throw new HttpError(503, 'GEN_RATE_LIMIT', `Unable to download ${label} from Runway`, { url });
};

const extractVideoUrl = (payload: RunwayVideoResponse) => {
  return payload.output?.find((item) => item.url && item.type === 'primary')?.url ??
    payload.output?.[0]?.url ??
    payload.assets?.find((item) => item.type === 'video')?.url ??
    payload.preview_url ??
    null;
};

const extractCoverUrl = (payload: RunwayVideoResponse) =>
  payload.output?.find((item) => item.type === 'cover')?.url ??
  payload.assets?.find((item) => item.type === 'cover')?.url ??
  payload.thumbnail_url ??
  null;

const placeholderCover = (jobId: string) =>
  Buffer.from(`RUNWAY_COVER_PLACEHOLDER_${jobId}_${Date.now().toString(36)}`);

const buildAssetsFromResponse = async (
  jobId: string,
  payload: RunwayVideoResponse,
  ctx?: RunwayJobConfig,
): Promise<VideoGenAsset[]> => {
  const primaryUrl = extractVideoUrl(payload);
  if (!primaryUrl) {
    throw new HttpError(502, 'GEN_PROVIDER_ERROR', 'Runway returned no output URL', { jobId });
  }
  const primaryBuffer = await downloadAsset(primaryUrl, 'download_primary');
  const previewBuffer = Buffer.from(primaryBuffer);
  const coverUrl = extractCoverUrl(payload);
  const coverBuffer = coverUrl ? await downloadAsset(coverUrl, 'download_cover') : placeholderCover(jobId);
  const metadata = {
    jobId,
    status: payload.status,
    model: payload.model ?? ctx?.model,
    duration: payload.duration ?? ctx?.duration,
    ratio: payload.ratio ?? ctx?.ratio,
    output: payload.output ?? payload.assets,
    metadata: payload.metadata,
  };
  return [
    {
      kind: 'primary',
      filename: 'primary.mp4',
      mime: 'video/mp4',
      buffer: primaryBuffer,
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

const sanitizeProgress = (value?: number) => {
  if (!Number.isFinite(value ?? NaN)) return 0.1;
  return Math.min(0.99, Math.max(0.05, value ?? 0));
};

const makeRunningResponse = (payload: RunwayVideoResponse): VideoGenPollResponse => ({
  status: 'running',
  progress: sanitizeProgress(payload.progress),
  etaSeconds: payload.eta_seconds ?? payload.eta,
});

export const runwayVideoGenAdapter: VideoGenAdapter = {
  name: PROVIDER,
  async submit(request: VideoGenSubmitRequest) {
    const config = buildRunwayJobConfig(request);
    const job = await runwayJsonRequest<RunwayVideoResponse>('POST', API_PATH_VIDEOS, 'submit', {
      ...config.payload,
    }).catch((error) => {
      throw error instanceof HttpError
        ? error
        : new HttpError(502, 'GEN_PROVIDER_ERROR', 'Runway submission failed', { cause: error });
    });
    if (!job?.id) {
      throw new HttpError(502, 'GEN_PROVIDER_ERROR', 'Runway did not return a job id');
    }
    jobCache.set(job.id, config);
    return { requestId: job.id };
  },
  async poll(requestId: string) {
    const job = await runwayJsonRequest<RunwayVideoResponse>('GET', `${API_PATH_VIDEOS}/${requestId}`, 'poll');
    if (job.status === 'failed') {
      jobCache.delete(requestId);
      const errorMessage = job.error?.message ?? 'Runway job failed';
      const code = job.error?.code === 'content_policy' ? 'GEN_CONTENT_VIOLATION' : 'GEN_PROVIDER_ERROR';
      return {
        status: 'failed',
        progress: 1,
        errorCode: code,
        errorMessage,
      };
    }
    if (job.status === 'completed') {
      const ctx = jobCache.get(requestId);
      jobCache.delete(requestId);
      const assets = await buildAssetsFromResponse(requestId, job, ctx);
      const duration = job.duration ?? ctx?.duration ?? 0;
      const model =
        job.model === 'gen3-alpha' || job.model === 'gen3-flash'
          ? job.model
          : (ctx?.model ?? 'gen3-flash');
      const costCents = estimateRunwayCostCents(duration, model);
      return {
        status: 'success',
        progress: 1,
        durationSec: duration,
        costCents,
        assets,
      };
    }
    return makeRunningResponse(job);
  },
  async fetchAssets(requestId: string) {
    const job = await runwayJsonRequest<RunwayVideoResponse>('GET', `${API_PATH_VIDEOS}/${requestId}`, 'fetch');
    if (job.status !== 'completed') {
      throw new HttpError(409, 'GEN_PROVIDER_ERROR', 'Runway assets are not ready', {
        requestId,
        status: job.status,
      });
    }
    const ctx = jobCache.get(requestId);
    jobCache.delete(requestId);
    return buildAssetsFromResponse(requestId, job, ctx);
  },
  async cancel(requestId: string) {
    try {
      await runwayJsonRequest('DELETE', `${API_PATH_VIDEOS}/${requestId}`, 'cancel');
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
