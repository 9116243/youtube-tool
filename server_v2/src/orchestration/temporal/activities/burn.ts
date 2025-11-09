import { runBurnPipeline } from '../../../pipeline/burn.js';
import { logger } from '../../../utils/logger.js';
import {
  loadStageMetadata,
  resolveSourcePath,
  resolveWatermarkPath,
  saveStageMetadata
} from '../helpers.js';
import type { BurnActivityInput } from '../types.js';

export const burnShot = async (input: BurnActivityInput) => {
  const existing = await loadStageMetadata(input.workspace, 'burn');
  if (existing) {
    logger.debug({ shotId: input.shot.id }, 'Reusing cached burn output');
    return existing;
  }
  const watermark = await resolveWatermarkPath(input.watermark);
  const resolution = (input.resolution ?? '1080p') as Parameters<typeof runBurnPipeline>[0]['resolution'];
  const options: Parameters<typeof runBurnPipeline>[0] = {
    taskId: input.taskId,
    workspace: input.workspace,
    inputVideo: await resolveSourcePath(input.shot.inputVideo),
    inputSubtitle: input.subtitlePath,
    inputAudio: input.audioPath,
    resolution,
    hwaccel: input.hwaccel ?? 'auto',
    watermark
  };
  if (typeof input.bitrate === 'number') {
    options.bitrateKbps = input.bitrate;
  }
  const result = await runBurnPipeline(options);
  await saveStageMetadata(input.workspace, 'burn', result);
  return result;
};
