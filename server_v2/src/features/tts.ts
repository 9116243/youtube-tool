import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getTtsProvider } from '../providers/tts/index.js';
import type { TtsSynthesizeResult } from '../providers/tts/index.js';
import { env } from '../utils/env.js';
import { sanitizeName } from '../tasks/artifacts.js';
import { logger } from '../utils/logger.js';

type CacheMeta = {
  provider: string;
  voiceId?: string;
  language?: string;
  sampleRate: number;
  durationSeconds?: number;
  metrics: Record<string, unknown>;
  textHash: string;
  createdAt: string;
};

const cacheRoot = join(process.cwd(), env.WORK_DIR, '.cache', 'tts');

const ensureCacheDir = async () => {
  await mkdir(cacheRoot, { recursive: true });
  return cacheRoot;
};

const fileExists = async (filePath: string) => {
  try {
    await stat(filePath);
    return true;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

const textFromSrt = async (srtPath?: string) => {
  if (!srtPath) return null;
  try {
    const contents = await readFile(srtPath, 'utf8');
    const lines = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^\d+$/.test(line) && !line.includes('-->'));
    return lines.join(' ').replace(/\s+/g, ' ').trim();
  } catch (error) {
    logger.warn({ err: error, srtPath }, 'Failed to read SRT for TTS text conversion');
    return null;
  }
};

const resolveSpeechText = async (text?: string, srtPath?: string) => {
  if (text && text.trim().length) {
    return text.trim();
  }
  const parsed = await textFromSrt(srtPath);
  if (parsed && parsed.length) {
    return parsed;
  }
  throw new Error('TTS synthesis requires text or a readable subtitle file');
};

const buildCacheKey = (textHash: string, provider: string, voiceId: string | undefined, language: string | undefined, sampleRate: number) =>
  createHash('sha256')
    .update([textHash, provider, voiceId ?? '', language ?? '', String(sampleRate)].join('|'))
    .digest('hex');

const cachePaths = (key: string) => ({
  data: join(cacheRoot, `${key}.wav`),
  meta: join(cacheRoot, `${key}.json`)
});

const loadCache = async (key: string) => {
  const paths = cachePaths(key);
  if (!(await fileExists(paths.data)) || !(await fileExists(paths.meta))) {
    return null;
  }
  try {
    const meta = JSON.parse(await readFile(paths.meta, 'utf8')) as CacheMeta;
    return { paths, meta };
  } catch (error) {
    logger.warn({ err: error, key }, 'Failed to parse TTS cache metadata');
    return null;
  }
};

const finalizeFile = async (tempPath: string, finalPath: string) => {
  try {
    await rename(tempPath, finalPath);
  } catch (error: any) {
    if (error?.code === 'EEXIST') {
      await rm(tempPath).catch(() => null);
      return;
    }
    throw error;
  }
};

export type SynthesizeSpeechOptions = {
  taskId: string;
  workspace: string;
  text?: string;
  srtPath?: string;
  language?: string;
  voiceId?: string;
  provider?: string;
};

export type SynthesizeSpeechResult = {
  wavPath: string;
  durationSeconds?: number;
  sampleRate: number;
  provider: string;
  cacheKey: string;
  cacheHit: boolean;
  sizeBytes: number;
  metrics: Record<string, unknown>;
};

const buildMeta = (
  provider: string,
  voiceId: string | undefined,
  language: string | undefined,
  sampleRate: number,
  textHash: string,
  synthResult: TtsSynthesizeResult
): CacheMeta => ({
  provider,
  voiceId,
  language,
  sampleRate,
  durationSeconds: synthResult.durationSeconds,
  metrics: synthResult.metrics ?? {},
  textHash,
  createdAt: new Date().toISOString()
});

export const synthesizeSpeech = async (options: SynthesizeSpeechOptions): Promise<SynthesizeSpeechResult> => {
  await ensureCacheDir();
  const provider = getTtsProvider(options.provider);
  const sampleRate = env.TTS_SAMPLE_RATE;
  const script = await resolveSpeechText(options.text, options.srtPath);
  const textHash = createHash('sha256').update(script).digest('hex');
  const cacheKey = buildCacheKey(textHash, provider.name, options.voiceId, options.language, sampleRate);
  const existing = await loadCache(cacheKey);
  const destinationName = sanitizeName(`tts-${cacheKey}.wav`);
  const destinationPath = join(options.workspace, destinationName);

  if (existing) {
    await copyFile(existing.paths.data, destinationPath);
    const stats = await stat(destinationPath);
    return {
      wavPath: destinationPath,
      durationSeconds: existing.meta.durationSeconds,
      sampleRate: existing.meta.sampleRate,
      provider: existing.meta.provider,
      cacheKey,
      cacheHit: true,
      sizeBytes: stats.size,
      metrics: {
        ...(existing.meta.metrics ?? {}),
        cacheHit: true,
        provider: existing.meta.provider,
        voiceId: existing.meta.voiceId
      }
    };
  }

  const paths = cachePaths(cacheKey);
  const tempDataPath = `${paths.data}.${process.pid}.tmp`;
  const tempMetaPath = `${paths.meta}.${process.pid}.tmp`;

  const speechLines = [{ text: script }];
  const synthResult = await provider.synthesize(speechLines, {
    language: options.language,
    voiceId: options.voiceId,
    sampleRate,
    outputPath: tempDataPath
  });

  await finalizeFile(tempDataPath, paths.data);
  const metaPayload = buildMeta(provider.name, options.voiceId, options.language, sampleRate, textHash, synthResult);
  await writeFile(tempMetaPath, JSON.stringify(metaPayload, null, 2), 'utf8');
  await finalizeFile(tempMetaPath, paths.meta);

  await copyFile(paths.data, destinationPath);
  const stats = await stat(destinationPath);

  return {
    wavPath: destinationPath,
    durationSeconds: synthResult.durationSeconds ?? metaPayload.durationSeconds,
    sampleRate: synthResult.sampleRate ?? sampleRate,
    provider: provider.name,
    cacheKey,
    cacheHit: false,
    sizeBytes: stats.size,
    metrics: {
      ...(synthResult.metrics ?? {}),
      cacheHit: false,
      provider: provider.name,
      voiceId: options.voiceId
    }
  };
};
