import { randomUUID, createHash } from 'node:crypto';
import { basename } from 'node:path';
import { getStorageAdapter } from '';

const storage = getStorageAdapter();

const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file.bin';

const normalizePath = (absolute: string) => {
  const relative = absolute.replace(process.cwd(), '').replace(/^[/\\]/, '');
  return relative.split('\\').join('/');
};

export const saveUploadBuffer = async (buffer: Buffer, originalName?: string) => {
  const uuid = randomUUID();
  const fileName = sanitize(originalName ? basename(originalName) : 'upload.bin');
  const relative = `uploads/${uuid}/${fileName}`;
  const absolute = await storage.writeUpload(relative, buffer);
  const hash = createHash('sha256').update(buffer).digest('hex');
  return {
    path: normalizePath(absolute),
    size: buffer.length,
    hash
  };
};

