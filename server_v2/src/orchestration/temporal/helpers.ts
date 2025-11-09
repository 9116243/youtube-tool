import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { env } from '../../utils/env.js';
import { materializeStorageObject } from '../../storage/object-store.js';
import { isStorageUri, storageUriToAbsolutePath } from '../../storage/uri.js';
import type { WatermarkConfig } from './types.js';

const ensureDir = async (path: string) => {
  await mkdir(path, { recursive: true });
};

export const ensureShotWorkspace = async (taskId: string, shotId: string) => {
  const base = join(process.cwd(), env.WORK_DIR, 'temporal', taskId, shotId);
  await ensureDir(base);
  return base;
};

export const resolveSourcePath = async (value: string) => {
  if (!value) throw new Error('Expected non-empty source path');
  if (isStorageUri(value)) {
    return materializeStorageObject(value);
  }
  if (value.startsWith('/')) {
    return value;
  }
  return resolvePath(process.cwd(), value);
};

export const resolveWatermarkPath = async (config?: WatermarkConfig | null) => {
  if (!config?.path) return null;
  const resolved = await resolveSourcePath(config.path);
  return {
    ...config,
    path: resolved
  };
};

export const stageMetadataPath = (workspace: string, stage: string) => join(workspace, `${stage}.json`);

export const loadStageMetadata = async <T>(workspace: string, stage: string): Promise<T | null> => {
  try {
    const filePath = stageMetadataPath(workspace, stage);
    await stat(filePath);
    const contents = await readFile(filePath, 'utf8');
    return JSON.parse(contents) as T;
  } catch {
    return null;
  }
};

export const saveStageMetadata = async (workspace: string, stage: string, value: unknown) => {
  const filePath = stageMetadataPath(workspace, stage);
  await ensureDir(dirname(filePath));
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
};


export const normalizeStorageUri = (path: string) => {
  if (isStorageUri(path)) {
    return path;
  }
  return storageUriToAbsolutePath(path);
};
