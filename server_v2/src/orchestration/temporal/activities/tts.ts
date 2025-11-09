import { synthesizeSpeech } from '../../../features/tts.js';
import { logger } from '../../../utils/logger.js';
import { loadStageMetadata, saveStageMetadata } from '../helpers.js';
import type { ShotActivityInput, TtsResult } from '../types.js';

export const ttsShot = async (
  input: ShotActivityInput & { srtPath: string }
): Promise<TtsResult> => {
  const existing = await loadStageMetadata<TtsResult>(input.workspace, 'tts');
  if (existing) {
    logger.debug({ shotId: input.shot.id }, 'Reusing cached TTS output');
    return existing;
  }
  const result = await synthesizeSpeech({
    taskId: input.taskId,
    workspace: input.workspace,
    srtPath: input.srtPath,
    language: input.shot.language,
    voiceId: input.shot.voiceId,
    provider: input.shot.provider
  });
  await saveStageMetadata(input.workspace, 'tts', result);
  return result;
};
