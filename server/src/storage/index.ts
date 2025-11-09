import { appEnv } from '../utils/env';
import { LocalStorageAdapter } from './local';
import { S3StorageAdapter } from './s3';

export interface SaveFileParams {
  tempFilePath: string;
  originalName: string;
  mimeType?: string;
}

export interface StoredFile {
  path: string;
  size: number;
  hash: string;
  mimeType?: string;
  originalName: string;
}

export interface StorageAdapter {
  saveFile(input: SaveFileParams): Promise<StoredFile>;
}

let adapter: StorageAdapter | null = null;

const createAdapter = (): StorageAdapter => {
  if (appEnv.STORAGE_DRIVER === 's3') {
    return new S3StorageAdapter();
  }
  return new LocalStorageAdapter();
};

export const getStorage = (): StorageAdapter => {
  if (!adapter) {
    adapter = createAdapter();
  }
  return adapter;
};
