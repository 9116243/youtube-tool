import { transcribeAudio } from '../../../features/asr.js';
import { logger } from '../../../utils/logger.js';
import { resolveSourcePath, loadStageMetadata, saveStageMetadata } from '../helpers.js';
import type { AsrResult, ShotActivityInput } from '../types.js';

export const asrShot = async (input: ShotActivityInput & { audioSource?: string }): Promise<AsrResult> => {
  const existing = await loadStageMetadata<AsrResult>(input.workspace, 'asr');
  if (existing) {
    logger.debug({ shotId: input.shot.id }, 'Reusing cached ASR output');
    return existing;
  }
  const sourcePath = await resolveSourcePath(input.audioSource ?? input.shot.inputAudio ?? input.shot.inputVideo);
  const result = await transcribeAudio({
    taskId: input.taskId,
    workspace: input.workspace,
    inputAudio: sourcePath,
    language: input.shot.language
  });
  await saveStageMetadata(input.workspace, 'asr', result);
  return result;
};
