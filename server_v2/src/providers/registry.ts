import { mockVideoGenAdapter } from './mock/video.js';
import { runwayVideoGenAdapter } from './runway/index.js';
import { lumaVideoGenAdapter } from './luma/index.js';
import { haiperVideoGenAdapter } from './haiper/index.js';
import { replicateVideoGenAdapter } from './replicate/index.js';

export const videoGenProviders = {
  mock: mockVideoGenAdapter,
  runway: runwayVideoGenAdapter,
  luma: lumaVideoGenAdapter,
  haiper: haiperVideoGenAdapter,
  replicate: replicateVideoGenAdapter
} as const;

export type VideoGenProviderName = keyof typeof videoGenProviders;

export const listVideoGenProviders = () => Object.keys(videoGenProviders);
