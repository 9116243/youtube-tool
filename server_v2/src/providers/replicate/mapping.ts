import type { VideoGenSubmitRequest } from '../types.js';

export type ReplicateInput = Record<string, unknown>;

const aspectToRatio = (aspect: VideoGenSubmitRequest['aspect']) => {
  if (aspect === '9:16' || aspect === '1:1') return aspect;
  return '16:9';
};

const buildReferenceUrls = (references: VideoGenSubmitRequest['references']) =>
  (references ?? [])
    .map((ref) => ref.url?.trim())
    .filter((url): url is string => Boolean(url))
    .slice(0, 5);

export const buildReplicateInput = (request: VideoGenSubmitRequest): ReplicateInput => {
  const input: ReplicateInput = {
    prompt: request.prompt,
    negative_prompt: request.negative,
    duration: request.duration,
    fps: request.fps ?? 24,
    aspect_ratio: aspectToRatio(request.aspect),
    seed: request.seed,
    storyboard: request.storyboard,
  reference_urls: buildReferenceUrls(request.references)
};

  if (!input.negative_prompt) delete input.negative_prompt;
  if (!input.seed && input.seed !== 0) delete input.seed;
  if (!input.storyboard) delete input.storyboard;
  if (!Array.isArray(input.reference_urls) || !input.reference_urls.length) {
    delete input.reference_urls;
  }

  return input;
};
