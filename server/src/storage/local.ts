import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { appEnv } from '../utils/env';
import type { SaveFileParams, StorageAdapter, StoredFile } from './index';

const sanitizeFileName = (value: string) => {
  const base = path.basename(value);
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return sanitized.length ? sanitized : 'upload.bin';
};

export class LocalStorageAdapter implements StorageAdapter {
  private readonly workspaceRoot: string;

  private readonly uploadsRoot: string;

  constructor() {
    this.workspaceRoot = path.resolve(appEnv.WORKSPACE_DIR);
    this.uploadsRoot = path.join(this.workspaceRoot, 'uploads');
  }

  private async ensureBaseDir() {
    await fs.mkdir(this.uploadsRoot, { recursive: true });
  }

  private buildResponsePath(relativePath: string) {
    const normalizedWorkspace = appEnv.WORKSPACE_DIR.replace(/\\/g, '/').replace(/^\.\//, '');
    const normalizedRelative = relativePath.split(path.sep).join('/');
    if (!normalizedWorkspace || normalizedWorkspace === '.') {
      return normalizedRelative;
    }
    return `${normalizedWorkspace}/${normalizedRelative}`.replace(/\/{2,}/g, '/');
  }

  async saveFile(input: SaveFileParams): Promise<StoredFile> {
    await this.ensureBaseDir();
    const uploadId = randomUUID();
    const targetDir = path.join(this.uploadsRoot, uploadId);
    await fs.mkdir(targetDir, { recursive: true });

    const fileName = sanitizeFileName(input.originalName);
    const targetPath = path.join(targetDir, fileName);
    const hash = createHash('sha256');

    const hashingStream = new Transform({
      transform(chunk, _enc, callback) {
        hash.update(chunk as Buffer);
        callback(null, chunk);
      },
    });

    await pipeline(createReadStream(input.tempFilePath), hashingStream, createWriteStream(targetPath));
    await fs.unlink(input.tempFilePath).catch(() => undefined);

    const stats = await fs.stat(targetPath);
    const relativePath = path.relative(this.workspaceRoot, targetPath);

    return {
      path: this.buildResponsePath(relativePath),
      size: stats.size,
      hash: hash.digest('hex'),
      mimeType: input.mimeType,
      originalName: fileName,
    };
  }
}
