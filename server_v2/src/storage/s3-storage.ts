import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import { env } from '../utils/env.js';

type ClientKey = {
  region: string;
  endpoint?: string | null;
  accessKey?: string | null;
  secretKey?: string | null;
  forcePathStyle: boolean;
};

const clients = new Map<string, S3Client>();

const buildKey = (key: ClientKey) =>
  [
    key.region,
    key.endpoint ?? '',
    key.accessKey ?? '',
    key.secretKey ?? '',
    key.forcePathStyle ? '1' : '0'
  ].join('|');

const resolveCredentials = () => {
  const accessKey = env.S3_ACCESS_KEY ?? env.S3_ACCESS_KEY_ID ?? null;
  const secretKey = env.S3_SECRET_KEY ?? env.S3_SECRET_ACCESS_KEY ?? null;
  if (accessKey && secretKey) {
    return {
      accessKeyId: accessKey,
      secretAccessKey: secretKey
    };
  }
  return undefined;
};

const getClient = (overrideRegion?: string) => {
  if (!env.S3_BUCKET) {
    throw new Error('S3_BUCKET is not configured');
  }
  const region = overrideRegion ?? env.S3_REGION;
  if (!region) {
    throw new Error('S3_REGION is not configured');
  }
  const key: ClientKey = {
    region,
    endpoint: env.S3_ENDPOINT ?? null,
    accessKey: env.S3_ACCESS_KEY ?? env.S3_ACCESS_KEY_ID ?? null,
    secretKey: env.S3_SECRET_KEY ?? env.S3_SECRET_ACCESS_KEY ?? null,
    forcePathStyle: env.S3_FORCE_PATH_STYLE
  };
  const cacheKey = buildKey(key);
  if (clients.has(cacheKey)) {
    return clients.get(cacheKey)!;
  }
  const client = new S3Client({
    region: key.region,
    endpoint: key.endpoint || undefined,
    forcePathStyle: key.forcePathStyle,
    credentials: resolveCredentials()
  });
  clients.set(cacheKey, client);
  return client;
};

export const putObject = async (
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
  options?: { region?: string }
) => {
  const client = getClient(options?.region);
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'private'
    })
  );
};

export const headObject = async (key: string, options?: { region?: string }) => {
  const client = getClient(options?.region);
  const response = await client.send(
    new HeadObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key
    })
  );
  return {
    size: response.ContentLength ?? 0
  };
};

export const getObjectStream = async (
  key: string,
  rangeStart?: number,
  rangeEnd?: number,
  options?: { region?: string }
) => {
  const client = getClient(options?.region);
  const range =
    typeof rangeStart === 'number' && typeof rangeEnd === 'number'
      ? `bytes=${rangeStart}-${rangeEnd}`
      : undefined;
  const response = await client.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Range: range
    })
  );
  return {
    stream: response.Body as Readable
  };
};

export const deleteObject = async (key: string, options?: { region?: string }) => {
  const client = getClient(options?.region);
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key
    })
  );
};

export const presignUploadUrl = async (
  key: string,
  contentType: string,
  size: number,
  options?: { region?: string; expiresIn?: number }
) => {
  const client = getClient(options?.region);
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
    ACL: 'private'
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: options?.expiresIn ?? 900 });
  return {
    uploadUrl,
    method: 'PUT' as const,
    headers: { 'x-amz-acl': 'private' }
  };
};

export const presignDownloadUrl = async (
  key: string,
  options?: { region?: string; expiresIn?: number }
) => {
  const client = getClient(options?.region);
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key
  });
  const downloadUrl = await getSignedUrl(client, command, { expiresIn: options?.expiresIn ?? 900 });
  return {
    downloadUrl
  };
};

export const pingBucket = async (options?: { region?: string }) => {
  const client = getClient(options?.region);
  await client.send(
    new HeadBucketCommand({
      Bucket: env.S3_BUCKET
    })
  );
};
