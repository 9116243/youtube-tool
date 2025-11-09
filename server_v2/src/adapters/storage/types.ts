import type { ArtifactRecord } from '../../tasks/models.js';

export interface StorageAdapter {
  ensureWorkspace(taskId: string): Promise<string>;
  writeFile(taskId: string, relativePath: string, contents: string | Buffer): Promise<string>;
  readArtifacts(taskId: string): Promise<ArtifactRecord[]>;
  saveArtifacts(taskId: string, artifacts: ArtifactRecord[]): Promise<ArtifactRecord[]>;
  writeUpload(relativePath: string, contents: string | Buffer): Promise<string>;
}
