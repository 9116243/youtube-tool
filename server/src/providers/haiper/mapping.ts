import type { VideoGenSubmitRequest } from '../types';

const clampDuration = (value: number | undefined) => {
  if (!Number.isFinite(value)) return 10;
  return Math.min(30, Math.max(5, Math.round(value ?? 10)));
};

const clampFps = (value: number | undefined) => {
  if (!Number.isFinite(value)) return 24;
  return Math.min(60, Math.max(12, Math.round(value ?? 24)));
};

const sanitizeSeed = (seed?: number) => {
  if (!Number.isFinite(seed)) {
    return undefined;
  }
  const normalized = Math.round(seed as number);
  return normalized >= 0 ? normalized : undefined;
};

const mapReferences = (references: VideoGenSubmitRequest['references']) =>
  (references ?? [])
    .map((item) => item.url?.trim())
    .filter((url): url is string => Boolean(url) && /^https?:\/\//i.test(url))
    .slice(0, 5);

export type HaiperJobPayload = {
  prompt: string;
  negative_prompt?: string;
  duration: number;
  fps: number;
  seed?: number;
  references?: string[];
};

export type HaiperJobConfig = {
  payload: HaiperJobPayload;
  resolution: VideoGenSubmitRequest['resolution'];
};

export const buildHaiperJobConfig = (request: VideoGenSubmitRequest): HaiperJobConfig => {
  const duration = clampDuration(request.duration);
  const fps = clampFps(request.fps);
  const refs = mapReferences(request.references);

  const payload: HaiperJobPayload = {
    prompt: request.prompt,
    negative_prompt: request.negative,
    duration,
    fps,
    seed: sanitizeSeed(request.seed),
    references: refs.length ? refs : undefined,
  };

  if (!payload.negative_prompt) {
    delete payload.negative_prompt;
  }
  if (!payload.seed && payload.seed !== 0) {
    delete payload.seed;
  }
  if (!payload.references) {
    delete payload.references;
  }

  return {
    payload,
    resolution: request.resolution,
  };
};
