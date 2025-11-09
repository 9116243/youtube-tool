import type { VideoGenSubmitRequest } from '../types.js';

const RESOLUTION_HEIGHT: Record<VideoGenSubmitRequest['resolution'], number> = {
  '1080p': 1080,
  '2k': 1440,
  '4k': 2160
};

const ASPECTS = {
  '16:9': { width: 16, height: 9 },
  '9:16': { width: 9, height: 16 },
  '1:1': { width: 1, height: 1 }
} as const;

const sanitizeDuration = (seconds: number | undefined) => {
  if (!seconds || !Number.isFinite(seconds)) return 10;
  return Math.min(30, Math.max(3, Math.round(seconds)));
};

const sanitizeFps = (fps?: number) => {
  if (!fps || !Number.isFinite(fps)) return 24;
  return Math.min(60, Math.max(12, Math.round(fps)));
};

const sanitizeSeed = (seed?: number) => {
  if (!Number.isFinite(seed)) return undefined;
  const normalized = Math.round(seed!);
  if (normalized < 0) return undefined;
  return normalized;
};

const filterRefs = (references: VideoGenSubmitRequest['references']) =>
  (references ?? [])
    .map((ref) => ref.url?.trim())
    .filter((url): url is string => Boolean(url) && /^https?:\/\//i.test(url))
    .slice(0, 5);

const computeDimensions = (
  resolution: VideoGenSubmitRequest['resolution'],
  aspect: VideoGenSubmitRequest['aspect']
) => {
  const base = RESOLUTION_HEIGHT[resolution] ?? RESOLUTION_HEIGHT['1080p'];
  const ratios = ASPECTS[aspect] ?? ASPECTS['16:9'];
  if (aspect === '9:16') {
    const width = Math.round((base * ratios.width) / ratios.height);
    const height = base;
    return { width: ensureEven(width), height: ensureEven(height) };
  }
  const height = base;
  const width = Math.round((height * ratios.width) / ratios.height);
  return { width: ensureEven(width), height: ensureEven(height) };
};

const ensureEven = (value: number) => {
  const even = value % 2 === 0 ? value : value - 1;
  return Math.max(2, even);
};

export type LumaJobPayload = {
  text_prompt: string;
  negative_prompt?: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  aspect_ratio: '16:9' | '9:16' | '1:1';
  seed?: number;
  refs?: string[];
};

export type LumaJobConfig = {
  payload: LumaJobPayload;
  resolution: VideoGenSubmitRequest['resolution'];
};

export const buildLumaJobConfig = (request: VideoGenSubmitRequest): LumaJobConfig => {
  const duration = sanitizeDuration(request.duration);
  const fps = sanitizeFps(request.fps);
  const dimensions = computeDimensions(request.resolution, request.aspect);
  const refs = filterRefs(request.references);
  const payload: LumaJobPayload = {
    text_prompt: request.prompt,
    negative_prompt: request.negative,
    duration,
    width: dimensions.width,
    height: dimensions.height,
    fps,
    aspect_ratio: (request.aspect as LumaJobPayload['aspect_ratio']) ?? '16:9',
    seed: sanitizeSeed(request.seed),
    refs: refs.length ? refs : undefined
  };
  if (!payload.negative_prompt) {
    delete payload.negative_prompt;
  }
  if (!payload.seed && payload.seed !== 0) {
    delete payload.seed;
  }
  if (!payload.refs) {
    delete payload.refs;
  }
  return { payload, resolution: request.resolution };
};
