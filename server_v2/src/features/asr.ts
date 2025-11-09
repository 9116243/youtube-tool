import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AsrSegment } from '../providers/asr/index.js';
import { getAsrProvider } from '../providers/asr/index.js';
import { sanitizeName } from '../tasks/artifacts.js';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

type CacheMeta = {
  provider: string;
  language?: string;
  segments: AsrSegment[];
  metrics: Record<string, unknown>;
  createdAt: string;
};

const cacheRoot = join(process.cwd(), env.WORK_DIR, '.cache', 'asr');

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

const hashFile = async (filePath: string) =>
  new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const buildCacheKey = async (inputAudio: string, provider: string, language?: string) => {
  const sourceHash = await hashFile(inputAudio);
  return createHash('sha256').update([sourceHash, provider, language ?? ''].join('|')).digest('hex');
};

const cachePaths = (key: string) => ({
  data: join(cacheRoot, `${key}.srt`),
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
    logger.warn({ err: error, key }, 'Failed to parse ASR cache metadata');
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

export type TranscribeAudioOptions = {
  taskId: string;
  workspace: string;
  inputAudio: string;
  language?: string;
  provider?: string;
};

export type TranscribeAudioResult = {
  srtPath: string;
  segments: AsrSegment[];
  metrics: Record<string, unknown>;
  provider: string;
  cacheKey: string;
  cacheHit: boolean;
  sizeBytes: number;
};

export const transcribeAudio = async (options: TranscribeAudioOptions): Promise<TranscribeAudioResult> => {
  await ensureCacheDir();
  const provider = getAsrProvider(options.provider);
  const cacheKey = await buildCacheKey(options.inputAudio, provider.name, options.language);
  const existing = await loadCache(cacheKey);
  const destinationName = sanitizeName(`asr-${cacheKey}.srt`);
  const destinationPath = join(options.workspace, destinationName);

  if (existing) {
    await copyFile(existing.paths.data, destinationPath);
    const stats = await stat(destinationPath);
    return {
      srtPath: destinationPath,
      segments: existing.meta.segments ?? [],
      metrics: {
        ...(existing.meta.metrics ?? {}),
        cacheHit: true,
        provider: existing.meta.provider
      },
      provider: existing.meta.provider,
      cacheKey,
      cacheHit: true,
      sizeBytes: stats.size
    };
  }

  const paths = cachePaths(cacheKey);
  const tempDataPath = `${paths.data}.${process.pid}.tmp`;
  const tempMetaPath = `${paths.meta}.${process.pid}.tmp`;

  const result = await provider.transcribe({
    inputAudio: options.inputAudio,
    language: options.language,
    outputPath: tempDataPath
  });

  await finalizeFile(tempDataPath, paths.data);
  const metaPayload: CacheMeta = {
    provider: provider.name,
    language: options.language,
    segments: result.segments,
    metrics: result.metrics ?? {},
    createdAt: new Date().toISOString()
  };
  await writeFile(tempMetaPath, JSON.stringify(metaPayload, null, 2), 'utf8');
  await finalizeFile(tempMetaPath, paths.meta);

  await copyFile(paths.data, destinationPath);
  const stats = await stat(destinationPath);

  return {
    srtPath: destinationPath,
    segments: result.segments,
    metrics: {
      ...(result.metrics ?? {}),
      cacheHit: false,
      provider: provider.name
    },
    provider: provider.name,
    cacheKey,
    cacheHit: false,
    sizeBytes: stats.size
  };
};
