import { nanoid } from 'nanoid';
import { sanitizeName } from '../tasks/artifacts.js';
import { saveBufferToStorage } from './object-store.js';

export type UploadResult = {
  id: string;
  path: string;
  relativePath: string;
  size: number;
  hash: string;
  originalName: string;
};

export const saveUploadBuffer = async (buffer: Buffer, originalName: string): Promise<UploadResult> => {
  const id = nanoid();
  const safeName = sanitizeName(originalName || 'upload.bin');
  const relativePath = `uploads/${id}/${safeName}`;
  const { storagePath, size, hash } = await saveBufferToStorage(relativePath, buffer);
  return {
    id,
    path: storagePath,
    relativePath,
    size,
    hash,
    originalName: safeName
  };
};
