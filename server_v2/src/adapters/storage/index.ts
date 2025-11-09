import { env } from '../../utils/env.js';
import type { StorageAdapter } from './types.js';
import { LocalStorageAdapter } from './local-storage.js';
import { S3StorageAdapter } from './s3-storage.js';

let adapter: StorageAdapter | null = null;

export const getStorageAdapter = (): StorageAdapter => {
  if (adapter) return adapter;
  if (env.BLOB_BACKEND === 's3') {
    adapter = new S3StorageAdapter({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY
    });
  } else {
    adapter = new LocalStorageAdapter();
  }
  return adapter;
};

export type { StorageAdapter } from './types.js';
