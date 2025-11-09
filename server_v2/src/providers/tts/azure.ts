import { env } from '../../utils/env.js';
import { logger } from '../../utils/logger.js';
import type { TtsLine, TtsProvider, TtsSynthesizeOptions, TtsSynthesizeResult } from './index.js';
import { buffersToWav, RetryableError, runWithConcurrency, withRetry } from './utils.js';

const SUPPORTED_SAMPLE_RATES = [8000, 16000, 24000, 48000];

const pickSampleRate = (requested: number) => {
  const closest = SUPPORTED_SAMPLE_RATES.reduce((prev, curr) =>
    Math.abs(curr - requested) < Math.abs(prev - requested) ? curr : prev
  );
  return closest;
};

const escapeSsml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const buildSsml = (text: string, language: string, voiceId: string) =>
  `<speak version="1.0" xml:lang="${language}"><voice xml:lang="${language}" name="${voiceId}">${escapeSsml(text)}</voice></speak>`;

const synthesizeSegment = async (
  text: string,
  opts: { key: string; region: string; language: string; voiceId: string; format: string; retry: number }
) => {
  const endpoint = `https://${opts.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const body = buildSsml(text, opts.language, opts.voiceId);
  const response = await withRetry(
    async () => {
      const result = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': opts.key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': opts.format,
          'User-Agent': 'ytbpro-tts/1.0'
        },
        body
      });
      if (!result.ok) {
        const retryable = result.status === 429 || result.status >= 500;
        const errorText = await result.text().catch(() => result.statusText);
        throw new RetryableError(
          `Azure TTS request failed (${result.status}): ${errorText}`,
          { retryable, status: result.status }
        );
      }
      return result;
    },
    opts.retry
  );
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
};

export const azureTtsProvider: TtsProvider = {
  name: 'azure',
  async synthesize(lines: TtsLine[], options: TtsSynthesizeOptions): Promise<TtsSynthesizeResult> {
    const key = env.AZURE_SPEECH_KEY;
    const region = env.AZURE_SPEECH_REGION;
    if (!key || !region) {
      throw new Error('AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be set to use the Azure TTS provider');
    }
    const language = options.language ?? 'en-US';
    const voiceId = options.voiceId ?? `${language}-JennyNeural`;
    const sampleRate = pickSampleRate(options.sampleRate);
    const format = `raw-${sampleRate}hz-16bit-mono-pcm`;
    const concurrency = options.concurrency ?? 4;
    const retryMax = env.QUEUE_MAX_RETRIES ?? 3;

    const tasks = lines.map((line, index) => async () => {
      const buffer = await synthesizeSegment(line.text, {
        key,
        region,
        language,
        voiceId,
        format,
        retry: retryMax
      });
      await options.onSegment?.({ index: index + 1, total: lines.length });
      return buffer;
    });

    logger.debug({ provider: 'azure', segments: lines.length }, 'Starting Azure TTS synthesis');
    const segments = await runWithConcurrency(tasks, concurrency);
    const result = await buffersToWav(segments, sampleRate, options.outputPath);
    return {
      ...result,
      metrics: {
        provider: 'azure',
        segments: lines.length,
        voiceId
      }
    };
  }
};
