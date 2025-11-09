import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const ensureDir = async (filePath: string) => {
  await mkdir(dirname(filePath), { recursive: true });
};

export const pcmToWav = (pcm: Buffer, sampleRate: number) => {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
};

export const writeWavFile = async (outputPath: string, wavBuffer: Buffer) => {
  await ensureDir(outputPath);
  await writeFile(outputPath, wavBuffer);
  return outputPath;
};

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RetryableError extends Error {
  retryable: boolean;
  status?: number;

  constructor(message: string, options?: { retryable?: boolean; status?: number }) {
    super(message);
    this.retryable = Boolean(options?.retryable);
    this.status = options?.status;
  }
}

export const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 500): Promise<T> => {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof RetryableError ? error.retryable : false;
      if (!retryable || attempt >= maxRetries) {
        throw error;
      }
      const delay = baseDelay * 2 ** attempt + Math.round(Math.random() * baseDelay);
      await sleep(delay);
      attempt += 1;
    }
  }
};

export const runWithConcurrency = async <T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> => {
  if (tasks.length === 0) return [];
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, tasks.length);

  const workers = Array.from({ length: workerCount }).map(async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= tasks.length) break;
      results[current] = await tasks[current]();
    }
  });

  await Promise.all(workers);
  return results;
};

export const buffersToWav = async (segments: Buffer[], sampleRate: number, outputPath: string) => {
  const pcm = Buffer.concat(segments);
  const wav = pcmToWav(pcm, sampleRate);
  await writeWavFile(outputPath, wav);
  const durationSeconds = pcm.length / (sampleRate * 2);
  return { wavPath: outputPath, durationSeconds, sampleRate };
};
