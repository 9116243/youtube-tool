import type { StorageAdapter } from './types.js';
import type { ArtifactRecord } from '../../tasks/models.js';

export class S3StorageAdapter implements StorageAdapter {
  constructor(_config: {
    bucket?: string;
    region?: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  }) {}

  private notImplemented(): never {
    throw new Error('S3 storage adapter is not implemented yet.');
  }

  async ensureWorkspace(_taskId: string): Promise<string> {
    return this.notImplemented();
  }

  async writeFile(_taskId: string, _relativePath: string, _contents: string | Buffer): Promise<string> {
    return this.notImplemented();
  }

  async readArtifacts(_taskId: string): Promise<ArtifactRecord[]> {
    return this.notImplemented();
  }

  async saveArtifacts(_taskId: string, _artifacts: ArtifactRecord[]): Promise<ArtifactRecord[]> {
    return this.notImplemented();
  }

  async writeUpload(_relativePath: string, _contents: string | Buffer): Promise<string> {
    return this.notImplemented();
  }
}
