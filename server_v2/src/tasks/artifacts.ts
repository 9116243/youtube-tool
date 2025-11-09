import { resolve } from 'node:path';
import type { ArtifactRecord } from './models.js';
import { getStorageAdapter } from '../adapters/storage/index.js';
import { isStorageUri, storageUriToAbsolutePath } from '../storage/uri.js';
import { materializeStorageObject } from '../storage/object-store.js';

const storage = getStorageAdapter();

export type ArtifactsFile = {
  artifacts: Record<string, ArtifactRecord>;
};

const toRecord = (items: ArtifactRecord[]) =>
  items.reduce<Record<string, ArtifactRecord>>((acc, item) => {
    acc[item.name] = item;
    return acc;
  }, {});

export const sanitizeName = (name: string) =>
  name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120) || 'artifact';

export const ensureTaskDir = async (taskId: string) => storage.ensureWorkspace(taskId);

export const loadArtifacts = async (taskId: string): Promise<ArtifactsFile> => {
  const list = await storage.readArtifacts(taskId);
  return { artifacts: toRecord(list) };
};

export const saveArtifacts = async (taskId: string, partial: Partial<ArtifactsFile>) => {
  const existing = await loadArtifacts(taskId);
  const merged: Record<string, ArtifactRecord> = {
    ...existing.artifacts,
    ...(partial.artifacts ?? {})
  };
  await storage.saveArtifacts(taskId, Object.values(merged));
  return { artifacts: merged };
};

export type InputSpec =
  | string
  | {
      from: string;
      artifact: string;
    };

export const resolveInput = async (spec: InputSpec) => {
  if (typeof spec === 'string') {
    if (isStorageUri(spec)) {
      return materializeStorageObject(spec);
    }
    return resolve(spec);
  }
  const { from, artifact } = spec;
  if (!from || !artifact) {
    throw new Error('Invalid artifact reference');
  }
  const upstream = await loadArtifacts(from);
  const record = upstream.artifacts?.[artifact];
  if (!record?.path) {
    throw new Error(`Artifact ${artifact} not found for ${from}`);
  }
  if (isStorageUri(record.path)) {
    return materializeStorageObject(record.path);
  }
  return resolve(record.path);
};
