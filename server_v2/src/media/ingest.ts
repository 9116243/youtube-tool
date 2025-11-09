import type { ChildProcess } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import { spawn } from 'node:child_process';
import { env } from '../utils/env.js';
import { prisma } from '../db/prisma.js';
import { ffmpegPath } from '../utils/ffmpeg.js';
import { absoluteToStorageUri, isStorageUri } from '../storage/uri.js';
import { materializeStorageObject } from '../storage/object-store.js';
import { textToEmbedding } from './utils.js';

type LicensePayload = {
  provider: string;
  licenseType: string;
  validUntil?: string | null;
  details?: Record<string, unknown>;
};

export type MediaIngestOptions = {
  organizationId: string;
  filePath: string;
  kind: 'video' | 'subtitle' | 'metadata';
  metadata?: Record<string, unknown>;
  license?: LicensePayload;
  subtitles?: string;
};

const ensureDir = (dir: string) => mkdir(dir, { recursive: true });

const resolveMediaSource = async (input: string) => {
  if (isStorageUri(input)) {
    return materializeStorageObject(input);
  }
  return resolvePath(process.cwd(), input);
};

const ffmpegExtract = (source: string, destination: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-y',
      '-i',
      source,
      '-vf',
      'select=not(mod(n\\,20)),scale=320:-1',
      '-vsync',
      'vfr',
      '-frames:v',
      '6',
      '-q:v',
      '3',
      destination
    ];
    const child: ChildProcess = spawn(ffmpegPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });

const listFrames = async (folder: string) => {
  const items = await readdir(folder);
  return items
    .filter((name) => name.endsWith('.jpg') || name.endsWith('.png'))
    .map((name) => join(folder, name));
};

const createEmbeddingRecord = async (assetId: string, text: string) => {
  const vector = textToEmbedding(text);
  await prisma.mediaEmbedding.create({
    data: {
      assetId,
      vector: JSON.stringify(vector),
      model: env.EMBED_MODEL_NAME
    }
  });
};

export const ingestMedia = async (options: MediaIngestOptions) => {
  const resolvedPath = await resolveMediaSource(options.filePath);
  const metadataPayload = options.metadata ? JSON.stringify(options.metadata) : null;
  const asset = await prisma.mediaAsset.create({
    data: {
      organizationId: options.organizationId,
      kind: options.kind,
      path: resolvedPath,
      metadata: metadataPayload
    }
  });

  if (options.license) {
    await prisma.mediaLicense.create({
      data: {
        assetId: asset.id,
        provider: options.license.provider,
        licenseType: options.license.licenseType,
        validUntil: options.license.validUntil ? new Date(options.license.validUntil) : null,
        details: options.license.details ? JSON.stringify(options.license.details) : null
      }
    });
  }

  const combinedText = [
    options.metadata?.title,
    options.metadata?.description,
    options.subtitles
  ]
    .filter(Boolean)
    .join(' ');
  await createEmbeddingRecord(asset.id, combinedText || asset.id);

  const framesDir = join(process.cwd(), env.WORK_DIR, 'media', asset.id, 'frames');
  await ensureDir(framesDir);
  await ffmpegExtract(resolvedPath, join(framesDir, 'frame-%03d.jpg'));
  const frameFiles = await listFrames(framesDir);
  const frameAssets = [];
  for (const framePath of frameFiles) {
    const keyframe = await prisma.mediaAsset.create({
      data: {
        organizationId: options.organizationId,
        kind: 'keyframe',
        path: framePath,
        parentAssetId: asset.id
      }
    });
    frameAssets.push(keyframe);
  }

  return { asset, keyframes: frameAssets };
};
