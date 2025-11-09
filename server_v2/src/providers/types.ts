import { HttpError } from '../utils/http-error.js';
import { videoGenProviders, type VideoGenProviderName } from './registry.js';

export type VideoReference = {
  url: string;
  label?: string;
};

export type VideoGenSubmitRequest = {
  prompt: string;
  negative?: string;
  storyboard?: string;
  duration: number;
  resolution: '1080p' | '2k' | '4k';
  fps?: number;
  aspect: '16:9' | '9:16' | '1:1';
  seed?: number;
  references: VideoReference[];
  policy: string;
};

export type VideoGenAsset = {
  kind: 'primary' | 'preview' | 'cover' | 'metadata';
  filename: string;
  mime: string;
  buffer: Buffer;
  metadata?: Record<string, unknown>;
};

export type VideoGenSubmitResponse = {
  requestId: string;
};

export type VideoGenPollResponse =
  | {
      status: 'queued' | 'running';
      progress: number;
      etaSeconds?: number;
    }
  | {
      status: 'success';
      progress: number;
      etaSeconds?: number;
      durationSec?: number;
      costCents?: number;
      assets?: VideoGenAsset[];
    }
  | {
      status: 'failed';
      progress: number;
      errorCode?: string;
      errorMessage: string;
    };

export interface VideoGenAdapter {
  name: string;
  submit(request: VideoGenSubmitRequest): Promise<VideoGenSubmitResponse>;
  poll(requestId: string): Promise<VideoGenPollResponse>;
  fetchAssets(requestId: string): Promise<VideoGenAsset[]>;
  cancel?(requestId: string): Promise<void>;
}

const normalizePolicy = (policy: string) => policy.trim().toLowerCase();

const pickDefaultAdapter = (normalizedPolicy: string) => {
  if (normalizedPolicy === 'best_quality' && videoGenProviders.runway) {
    return videoGenProviders.runway;
  }
  if (normalizedPolicy === 'balanced' && videoGenProviders.luma) {
    return videoGenProviders.luma;
  }
  if (normalizedPolicy === 'lowest_cost' && videoGenProviders.haiper) {
    return videoGenProviders.haiper;
  }
  return videoGenProviders.mock;
};

export const getVideoGenAdapter = (policy: string) => {
  const normalized = normalizePolicy(policy);
  if (normalized.startsWith('force:')) {
    const remainder = normalized.slice('force:'.length);
    const [key] = remainder.split(':');
    const adapter = videoGenProviders[key as VideoGenProviderName];
    if (!adapter) {
      throw new HttpError(400, 'GEN_UNSUPPORTED', `Provider "${key}" is not registered`);
    }
    return adapter;
  }
  const adapter = pickDefaultAdapter(normalized) ?? videoGenProviders.mock;
  if (!adapter) {
    throw new HttpError(500, 'GEN_INTERNAL', 'No video generation provider is registered');
  }
  return adapter;
};
