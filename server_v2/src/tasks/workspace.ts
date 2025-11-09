import type { ArtifactRecord } from './models.js';
import { getStorageAdapter } from '../adapters/storage/index.js';

const storage = getStorageAdapter();

export const ensureWorkspace = async (taskId: string) => storage.ensureWorkspace(taskId);

export const writeWorkspaceFile = async (
  taskId: string,
  relativePath: string,
  contents: string | Buffer
) => storage.writeFile(taskId, relativePath, contents);

export const readArtifacts = async (taskId: string): Promise<ArtifactRecord[]> =>
  storage.readArtifacts(taskId);

export const recordArtifacts = async (taskId: string, artifacts: ArtifactRecord[]) =>
  storage.saveArtifacts(taskId, artifacts);

export const upsertArtifact = async (taskId: string, artifact: ArtifactRecord) => {
  const existing = await readArtifacts(taskId);
  const filtered = existing.filter((item) => item.name !== artifact.name);
  filtered.push(artifact);
  return recordArtifacts(taskId, filtered);
};