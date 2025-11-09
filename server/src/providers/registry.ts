import { HttpError } from '../utils/http-error';
import { VIDEO_GEN_PROVIDER_NAMES, type VideoGenAdapter, type VideoGenProviderName } from './types';
import { mockVideoGenAdapter } from './mock/video';
import { lumaVideoGenAdapter } from './luma';
import { runwayVideoGenAdapter } from './runway';
import { haiperVideoGenAdapter } from './haiper';
import { replicateVideoGenAdapter } from './replicate';
import { getRouteCandidates } from './strategy';
import providersConfig from '../config/providers.example.json';

type ProviderConfigEntry = {
  endpoint: string;
  model: string;
  limit: number;
  cost: number;
};

type ProviderConfigMap = Record<VideoGenProviderName, ProviderConfigEntry>;

export type ProviderEntry = {
  name: VideoGenProviderName;
  adapter: VideoGenAdapter;
  config: ProviderConfigEntry;
  fallbackCandidates: VideoGenProviderName[];
};

const configMap = providersConfig as ProviderConfigMap;

const createPlaceholderAdapter = (name: VideoGenProviderName): VideoGenAdapter => {
  const cancel = mockVideoGenAdapter.cancel;
  return {
    name,
    submit: (request) => mockVideoGenAdapter.submit(request),
    poll: (requestId) => mockVideoGenAdapter.poll(requestId),
    fetchAssets: (requestId) => mockVideoGenAdapter.fetchAssets(requestId),
    cancel: cancel ? (requestId) => cancel(requestId) : undefined,
  };
};

const FALLBACKS: Record<VideoGenProviderName, VideoGenProviderName[]> = {
  mock: [],
  luma: ['mock'],
  runway: ['luma', 'mock'],
  haiper: ['mock'],
  kling: ['mock'],
  replicate: ['mock'],
  domoai: ['mock'],
};

const providerRegistry: Record<VideoGenProviderName, ProviderEntry> = {
  mock: {
    name: 'mock',
    adapter: mockVideoGenAdapter,
    config: configMap.mock,
    fallbackCandidates: FALLBACKS.mock,
  },
  luma: {
    name: 'luma',
    adapter: lumaVideoGenAdapter,
    config: configMap.luma,
    fallbackCandidates: FALLBACKS.luma,
  },
  runway: {
    name: 'runway',
    adapter: runwayVideoGenAdapter,
    config: configMap.runway,
    fallbackCandidates: FALLBACKS.runway,
  },
  haiper: {
    name: 'haiper',
    adapter: haiperVideoGenAdapter,
    config: configMap.haiper,
    fallbackCandidates: FALLBACKS.haiper,
  },
  kling: {
    name: 'kling',
    adapter: createPlaceholderAdapter('kling'),
    config: configMap.kling,
    fallbackCandidates: FALLBACKS.kling,
  },
  replicate: {
    name: 'replicate',
    adapter: replicateVideoGenAdapter,
    config: configMap.replicate,
    fallbackCandidates: FALLBACKS.replicate,
  },
  domoai: {
    name: 'domoai',
    adapter: createPlaceholderAdapter('domoai'),
    config: configMap.domoai,
    fallbackCandidates: FALLBACKS.domoai,
  },
};

export const pickAdapter = (policy?: string): ProviderEntry => {
  const candidates = getRouteCandidates(policy);
  if (!candidates.length) {
    throw new HttpError(400, 'GEN_UNSUPPORTED', 'No provider candidates found');
  }
  const providerName = candidates[0];
  return providerRegistry[providerName];
};

export const getProviderEntry = (name: VideoGenProviderName) => providerRegistry[name];
