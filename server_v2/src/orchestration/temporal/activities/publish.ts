import { logger } from '../../../utils/logger.js';
import { loadStageMetadata, saveStageMetadata } from '../helpers.js';
import type { PublishActivityInput, PublishResult } from '../types.js';

export const publishShot = async (input: PublishActivityInput): Promise<PublishResult> => {
  const existing = await loadStageMetadata<PublishResult>(input.workspace, 'publish');
  if (existing) {
    logger.debug({ shotId: input.shot.id }, 'Reusing cached publish output');
    return existing;
  }
  const payload: PublishResult = {
    externalUrl: input.storagePath,
    publishedAt: new Date().toISOString()
  };
  await saveStageMetadata(input.workspace, 'publish', payload);
  return payload;
};
