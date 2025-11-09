import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import OpenAI from 'openai';
import { env } from '../../utils/env.js';
import { logger } from '../../utils/logger.js';
import type { AsrProvider, AsrSegment } from './index.js';

const formatTimestamp = (seconds: number) => {
  const date = new Date(seconds * 1000);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss},${ms}`;
};

const segmentsToSrt = (segments: AsrSegment[]) =>
  segments
    .map(
      (segment, index) =>
        `${index + 1}\n${formatTimestamp(segment.start)} --> ${formatTimestamp(segment.end)}\n${segment.text.trim()}\n`
    )
    .join('\n');

const ensureDir = async (filePath: string) => mkdir(dirname(filePath), { recursive: true });

let client: OpenAI | null = null;

const getClient = () => {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for the OpenAI ASR provider');
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
};

const mapSegments = (source: unknown[]): AsrSegment[] =>
  source.map((segment, index) => ({
    id: typeof (segment as { id?: number }).id === 'number' ? (segment as { id: number }).id : index + 1,
    start: Number((segment as { start?: number }).start ?? 0),
    end: Number(
      (segment as { end?: number }).end ??
        ((segment as { start?: number }).start ?? 0) + Math.max(1, Number((segment as { duration?: number }).duration ?? 1))
    ),
    text: String((segment as { text?: string }).text ?? '').trim(),
    confidence:
      typeof (segment as { confidence?: number }).confidence === 'number'
        ? (segment as { confidence: number }).confidence
        : undefined
  }));

export const openaiAsrProvider: AsrProvider = {
  name: 'openai-whisper',
  async transcribe({ inputAudio, language, outputPath }) {
    const client = getClient();
    const response = await client.audio.transcriptions.create({
      file: createReadStream(inputAudio),
      model: 'whisper-1',
      response_format: 'verbose_json',
      temperature: 0,
      language
    });

    const segments = Array.isArray((response as { segments?: unknown[] }).segments)
      ? mapSegments((response as { segments: unknown[] }).segments)
      : [
          {
            id: 1,
            start: 0,
            end: Number((response as { duration?: number }).duration ?? 5),
            text: String((response as { text?: string }).text ?? '').trim() || 'Transcription unavailable'
          }
        ];

    const srt = segmentsToSrt(segments);
    await ensureDir(outputPath);
    await writeFile(outputPath, srt, 'utf8');

    logger.debug(
      { segments: segments.length, duration: (response as { duration?: number }).duration },
      'OpenAI transcription completed'
    );

    return {
      srtPath: outputPath,
      segments,
      metrics: {
        provider: 'openai-whisper',
        language: (response as { language?: string }).language ?? language ?? 'auto',
        durationSeconds: (response as { duration?: number }).duration ?? null
      }
    };
  }
};
