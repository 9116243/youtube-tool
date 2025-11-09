import { env } from '../../utils/env.js';
import { logger } from '../../utils/logger.js';
import type { TtsLine, TtsProvider, TtsSynthesizeOptions, TtsSynthesizeResult } from './index.js';
import { buffersToWav, RetryableError, runWithConcurrency, withRetry } from './utils.js';

const buildPayload = (text: string, sampleRate: number, language?: string) => ({
  text,
  model_id: language && language.toLowerCase().startsWith('en') ? 'eleven_monolingual_v1' : 'eleven_multilingual_v2',
  voice_settings: { stability: 0.45, similarity_boost: 0.75 },
  output_format: `pcm_${sampleRate}`
});

const getApiKey = () => env.ELEVEN_API_KEY || env.ELEVENLABS_API_KEY;

const synthesizeSegment = async (
  text: string,
  opts: { voiceId: string; sampleRate: number; language?: string; apiKey: string; retry: number }
) => {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}`;
  const payload = buildPayload(text, opts.sampleRate, opts.language);
  const response = await withRetry(
    async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': opts.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const errorText = await res.text().catch(() => res.statusText);
        throw new RetryableError(
          `ElevenLabs request failed (${res.status}): ${errorText}`,
          { retryable, status: res.status }
        );
      }
      return res;
    },
    opts.retry
  );
  return Buffer.from(await response.arrayBuffer());
};

export const elevenLabsTtsProvider: TtsProvider = {
  name: 'elevenlabs',
  async synthesize(lines: TtsLine[], options: TtsSynthesizeOptions): Promise<TtsSynthesizeResult> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('ELEVEN_API_KEY (or ELEVENLABS_API_KEY) is required for the ElevenLabs provider');
    }
    const selectedVoice = options.voiceId ?? env.ELEVENLABS_VOICE_ID;
    if (!selectedVoice) {
      throw new Error('ELEVENLABS_VOICE_ID (or per-task voiceId) is required for ElevenLabs synthesis');
    }
    const sampleRate = options.sampleRate;
    const concurrency = options.concurrency ?? 4;
    const retryMax = env.QUEUE_MAX_RETRIES ?? 3;

    const tasks = lines.map((line, index) => async () => {
      const buffer = await synthesizeSegment(line.text, {
        voiceId: selectedVoice,
        sampleRate,
        language: options.language,
        apiKey,
        retry: retryMax
      });
      await options.onSegment?.({ index: index + 1, total: lines.length });
      return buffer;
    });

    logger.debug({ provider: 'elevenlabs', segments: lines.length }, 'Starting ElevenLabs synthesis');
    const segments = await runWithConcurrency(tasks, concurrency);
    const result = await buffersToWav(segments, sampleRate, options.outputPath);
    return {
      ...result,
      metrics: {
        provider: 'elevenlabs',
        segments: lines.length,
        voiceId: selectedVoice
      }
    };
  }
};
