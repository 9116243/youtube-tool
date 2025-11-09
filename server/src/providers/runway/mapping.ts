import type { VideoGenSubmitRequest } from '../types';

export type RunwayModel = 'gen3-flash' | 'gen3-alpha';

const RESOLUTION_PRIORITY: Record<'1080p' | '2k' | '4k', number> = {
  '1080p': 1,
  '2k': 2,
  '4k': 3,
};

const MIN_DURATION = 5;
const FLASH_MAX_DURATION = 10;
const ALPHA_MAX_DURATION = 16;

const sanitizePolicy = (policy: string) => {
  if (!policy) return 'balanced';
  return policy.startsWith('force:') ? 'balanced' : policy;
};

const selectModel = (request: VideoGenSubmitRequest): RunwayModel => {
  const policy = sanitizePolicy(request.policy);
  if (policy === 'best_quality') {
    return 'gen3-alpha';
  }
  if (policy === 'lowest_cost') {
    return 'gen3-flash';
  }
  const resolutionScore = RESOLUTION_PRIORITY[request.resolution] ?? RESOLUTION_PRIORITY['1080p'];
  if (resolutionScore >= RESOLUTION_PRIORITY['4k']) {
    return 'gen3-alpha';
  }
  if (resolutionScore >= RESOLUTION_PRIORITY['2k'] && (request.duration ?? 0) > 15) {
    return 'gen3-alpha';
  }
  if ((request.duration ?? 0) > 20) {
    return 'gen3-alpha';
  }
  return 'gen3-flash';
};

const clampDuration = (duration: number | undefined, model: RunwayModel) => {
  const requested = Number.isFinite(duration) ? (duration as number) : 10;
  const upperBound = model === 'gen3-alpha' ? ALPHA_MAX_DURATION : FLASH_MAX_DURATION;
  return Math.max(MIN_DURATION, Math.min(upperBound, requested));
};

const clampStoryboard = (storyboard?: string) => {
  if (!storyboard) return undefined;
  return storyboard.slice(0, 2000);
};

const referenceUrls = (references: VideoGenSubmitRequest['references']) =>
  (references ?? [])
    .map((ref) => ref.url?.trim())
    .filter((url): url is string => Boolean(url) && /^https?:\/\//i.test(url))
    .slice(0, 4);

const normalizeAspect = (aspect: VideoGenSubmitRequest['aspect']) => {
  if (aspect === '9:16' || aspect === '1:1') {
    return aspect;
  }
  return '16:9';
};

const guidanceForPolicy = (policy: string) => {
  const sanitized = sanitizePolicy(policy);
  if (sanitized === 'best_quality') return 7;
  if (sanitized === 'lowest_cost') return 4.5;
  return 6;
};

export type RunwayJobPayload = {
  model: RunwayModel;
  prompt: string;
  negative_prompt?: string;
  ratio: '16:9' | '9:16' | '1:1';
  duration: number;
  seed?: number;
  mode: 'prompt';
  guidance_scale: number;
  reference_images?: string[];
  storyboard?: string;
};

export type RunwayJobConfig = {
  model: RunwayModel;
  duration: number;
  ratio: RunwayJobPayload['ratio'];
  payload: RunwayJobPayload;
};

export const buildRunwayJobConfig = (request: VideoGenSubmitRequest): RunwayJobConfig => {
  const model = selectModel(request);
  const duration = clampDuration(request.duration, model);
  const ratio = normalizeAspect(request.aspect);
  const payload: RunwayJobPayload = {
    model,
    prompt: request.prompt,
    negative_prompt: request.negative,
    ratio,
    duration,
    seed: request.seed,
    mode: 'prompt',
    guidance_scale: guidanceForPolicy(request.policy),
    reference_images: referenceUrls(request.references),
    storyboard: clampStoryboard(request.storyboard),
  };
  if (!payload.reference_images?.length) {
    delete payload.reference_images;
  }
  if (!payload.storyboard) {
    delete payload.storyboard;
  }
  if (!payload.negative_prompt) {
    delete payload.negative_prompt;
  }
  if (!payload.seed && payload.seed !== 0) {
    delete payload.seed;
  }
  return {
    model,
    duration,
    ratio,
    payload,
  };
};
