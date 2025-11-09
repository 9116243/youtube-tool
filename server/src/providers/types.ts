export const VIDEO_GEN_PROVIDER_NAMES = [
  'mock',
  'luma',
  'runway',
  'haiper',
  'kling',
  'replicate',
  'domoai',
] as const;

export type VideoGenProviderName = (typeof VIDEO_GEN_PROVIDER_NAMES)[number];

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
