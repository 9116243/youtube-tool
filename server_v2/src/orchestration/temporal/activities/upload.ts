import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from '../../../utils/env.js';
import { absoluteToStorageUri } from '../../../storage/uri.js';
import { logger } from '../../../utils/logger.js';
import { loadStageMetadata, saveStageMetadata } from '../helpers.js';
import type { UploadActivityInput, UploadResult } from '../types.js';

export const uploadShot = async (input: UploadActivityInput): Promise<UploadResult> => {
  const existing = await loadStageMetadata<UploadResult>(input.workspace, 'upload');
  if (existing) {
    logger.debug({ shotId: input.shot.id }, 'Reusing cached upload output');
    return existing;
  }
  const relativeDir = join('uploads', 'temporal', input.taskId);
  const destination = join(env.WORK_DIR, relativeDir, `${input.shot.id}.mp4`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(input.burnedVideo, destination);
  const stats = await stat(destination);
  const payload: UploadResult = {
    storagePath: absoluteToStorageUri(destination),
    sizeBytes: stats.size
  };
  await saveStageMetadata(input.workspace, 'upload', payload);
  return payload;
};
