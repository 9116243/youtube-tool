import { env } from '../../utils/env.js';
import { mockTtsProvider } from './mock.js';
import { elevenLabsTtsProvider } from './elevenlabs.js';
import { azureTtsProvider } from './azure.js';

export type TtsLine = {
  text: string;
  start?: number;
  end?: number;
};

export type SegmentProgress = {
  index: number;
  total: number;
};

export type TtsSynthesizeOptions = {
  provider?: string;
  voiceId?: string;
  language?: string;
  sampleRate: number;
  outputPath: string;
  concurrency?: number;
  onSegment?: (progress: SegmentProgress) => Promise<void> | void;
};

export type TtsSynthesizeResult = {
  wavPath: string;
  durationSeconds?: number;
  sampleRate: number;
  metrics?: Record<string, unknown>;
};

export interface TtsProvider {
  name: string;
  synthesize(lines: TtsLine[], options: TtsSynthesizeOptions): Promise<TtsSynthesizeResult>;
}

const registry: Record<string, TtsProvider> = {
  mock: mockTtsProvider,
  elevenlabs: elevenLabsTtsProvider,
  azure: azureTtsProvider
};

const normalizeKey = (value?: string | null) =>
  typeof value === 'string' && value.trim().length ? value.trim().toLowerCase() : undefined;

const resolveProvider = (key?: string) => {
  const normalized = normalizeKey(key) ?? env.TTS_PROVIDER ?? 'mock';
  const provider = registry[normalized];
  if (!provider) {
    throw new Error(`Unsupported TTS provider "${normalized}"`);
  }
  return provider;
};

const coalesceLines = (lines: TtsLine[]) => {
  const normalized = lines
    .map((line) => ({
      ...line,
      text: line.text?.replace(/\s+/g, ' ').trim() ?? ''
    }))
    .filter((line) => line.text.length > 0);
  if (normalized.length > 0) {
    return normalized;
  }
  return [{ text: ' ' }];
};

export const synthesizeTts = async (lines: TtsLine[], options: TtsSynthesizeOptions) => {
  const provider = resolveProvider(options.provider);
  const effectiveLines = coalesceLines(lines);
  return provider.synthesize(effectiveLines, options);
};

export const listTtsProviders = () => Object.keys(registry);

export const getTtsProvider = (key?: string) => resolveProvider(key);
