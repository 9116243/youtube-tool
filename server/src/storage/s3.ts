import { HttpError } from '../utils/http-error';
import type { SaveFileParams, StorageAdapter, StoredFile } from './index';

export class S3StorageAdapter implements StorageAdapter {
  async saveFile(_input: SaveFileParams): Promise<StoredFile> {
    throw new HttpError(501, 'S3 storage driver is not implemented yet', 'S3_DRIVER_NOT_AVAILABLE');
  }
}
