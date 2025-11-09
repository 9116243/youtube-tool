import { createWriteStream, promises as fs, createReadStream } from 'node:fs';
import { mkdir, stat, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { env } from '../utils/env.js';
import { buildStorageUri, parseStorageUri, storageUriToAbsolutePath, isStorageUri } from './uri.js';
import {
  putObject,
  getObjectStream,
  headObject,
  deleteObject,
  presignUploadUrl,
  presignDownloadUrl
} from './s3-storage.js';
import { HttpError } from '../utils/http-error.js';

const isS3 = env.BLOB_BACKEND === 's3';
const workspaceRoot = join(process.cwd(), env.WORK_DIR);
const cacheRoot = join(workspaceRoot, '.cache');

const ensureDir = async (path: string) => {
  await mkdir(path, { recursive: true });
};

export const saveBufferToStorage = async (
  relativePath: string,
  buffer: Buffer,
  contentType?: string
) => {
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (isS3) {
    await putObject(relativePath, buffer, contentType);
  } else {
    const absolutePath = join(workspaceRoot, relativePath);
    await ensureDir(dirname(absolutePath));
    await fs.writeFile(absolutePath, buffer);
  }
  return {
    storagePath: buildStorageUri(relativePath),
    size: buffer.length,
    hash
  };
};

export const createPresignedUpload = async (relativePath: string, contentType: string, size: number) => {
  if (!isS3) {
    throw new HttpError(400, 'PRESIGN_UNAVAILABLE', 'Presigned uploads require S3 storage backend');
  }
  return presignUploadUrl(relativePath, contentType, size);
};

export const createPresignedDownload = async (storageUri: string, expiresIn = 900) => {
  if (!isS3) {
    throw new HttpError(400, 'PRESIGN_UNAVAILABLE', 'Download presign requires S3 storage backend');
  }
  const key = parseStorageUri(storageUri);
  return presignDownloadUrl(key, { expiresIn });
};

type RangeRequest = { start?: number; end?: number } | null;

const normalizeRange = (range: RangeRequest, size: number): [number, number] => {
  if (!range || (range.start === undefined && range.end === undefined)) {
    return [0, Math.max(0, size - 1)];
  }
  let start = range.start ?? 0;
  let end = range.end ?? size - 1;
  if (start < 0 || end < 0 || start > end || end >= size) {
    throw new HttpError(416, 'INVALID_RANGE', 'Requested range not satisfiable');
  }
  return [start, end];
};

export const openStorageStream = async (storageUri: string, range: RangeRequest) => {
  if (!isS3) {
    const absolute = isStorageUri(storageUri) ? storageUriToAbsolutePath(storageUri) : storageUri;
    const stats = await stat(absolute);
    const [start, end] = normalizeRange(range, stats.size);
    const stream = createReadStream(absolute, { start, end });
    return {
      stream,
      start,
      end,
      size: stats.size
    };
  }
  const relative = parseStorageUri(storageUri);
  const head = await headObject(relative);
  const [start, end] = normalizeRange(range, head.size);
  const { stream } = await getObjectStream(relative, start, end);
  return {
    stream,
    start,
    end,
    size: head.size
  };
};

export const deleteStorageObject = async (storageUri: string) => {
  if (!isStorageUri(storageUri)) {
    return;
  }
  if (isS3) {
    await deleteObject(parseStorageUri(storageUri));
    return;
  }
  const absolute = storageUriToAbsolutePath(storageUri);
  await rm(absolute, { force: true });
};

export const materializeStorageObject = async (storageUri: string) => {
  if (!isS3) {
    return isStorageUri(storageUri) ? storageUriToAbsolutePath(storageUri) : storageUri;
  }
  const relative = parseStorageUri(storageUri);
  const destination = join(cacheRoot, relative);
  await ensureDir(dirname(destination));
  const { stream } = await getObjectStream(relative);
  await pipeline(stream as Readable, createWriteStream(destination));
  return destination;
};
