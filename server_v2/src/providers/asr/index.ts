import { env } from '../../utils/env.js';
import { mockAsrProvider } from './mock.js';
import { openaiAsrProvider } from './openai.js';

export type AsrSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
  confidence?: number;
};

export type AsrTranscribeOptions = {
  inputAudio: string;
  language?: string;
  outputPath: string;
};

export type AsrTranscribeResult = {
  srtPath: string;
  segments: AsrSegment[];
  metrics: Record<string, unknown>;
};

export interface AsrProvider {
  name: string;
  transcribe(options: AsrTranscribeOptions): Promise<AsrTranscribeResult>;
}

const registry: Record<string, AsrProvider> = {
  mock: mockAsrProvider,
  openai: openaiAsrProvider
};

const normalizeKey = (value?: string | null) =>
  typeof value === 'string' && value.trim().length ? value.trim().toLowerCase() : undefined;

export const listAsrProviders = () => Object.keys(registry);

export const getAsrProvider = (key?: string) => {
  const normalized = normalizeKey(key) ?? env.ASR_PROVIDER ?? 'mock';
  const provider = registry[normalized];
  if (!provider) {
    throw new Error(`Unsupported ASR provider "${normalized}"`);
  }
  return provider;
};
