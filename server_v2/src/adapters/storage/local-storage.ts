import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ArtifactRecord } from '../../tasks/models.js';
import { env } from '../../utils/env.js';
import type { StorageAdapter } from './types.js';

const safeJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const baseDir = resolve(process.cwd(), env.WORK_DIR ?? './workspace');

export class LocalStorageAdapter implements StorageAdapter {
  private workspacePath(taskId: string) {
    return join(baseDir, taskId);
  }

  private artifactsFile(taskId: string) {
    return join(this.workspacePath(taskId), 'artifacts.json');
  }

  async ensureWorkspace(taskId: string): Promise<string> {
    const dir = this.workspacePath(taskId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async writeFile(taskId: string, relativePath: string, contents: string | Buffer): Promise<string> {
    const dir = await this.ensureWorkspace(taskId);
    const filePath = join(dir, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
    return filePath;
  }

  async readArtifacts(taskId: string): Promise<ArtifactRecord[]> {
    const filePath = this.artifactsFile(taskId);
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = safeJson<{ artifacts?: ArtifactRecord[] }>(raw, {});
      return Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
    } catch {
      return [];
    }
  }

  async saveArtifacts(taskId: string, artifacts: ArtifactRecord[]): Promise<ArtifactRecord[]> {
    const filePath = this.artifactsFile(taskId);
    await this.ensureWorkspace(taskId);
    await writeFile(filePath, JSON.stringify({ artifacts }, null, 2), 'utf8');
    return artifacts;
  }

  async writeUpload(relativePath: string, contents: string | Buffer): Promise<string> {
    const filePath = join(baseDir, 'uploads', relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
    return filePath;
  }
}
