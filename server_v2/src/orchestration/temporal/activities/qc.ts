import { applyQcFixes, isFixableResult, runVideoQc } from '../../../qc/video.js';
import { logger } from '../../../utils/logger.js';
import { loadStageMetadata, saveStageMetadata } from '../helpers.js';
import type { QcActivityInput, QcStageResult } from '../types.js';

export const qcShot = async (input: QcActivityInput): Promise<QcStageResult> => {
  const existing = await loadStageMetadata<QcStageResult>(input.workspace, 'qc');
  if (existing) {
    logger.debug({ shotId: input.shot.id }, 'Reusing cached QC output');
    return existing;
  }
  const qcResult = await runVideoQc(input.burnedVideo);
  let appliedFixes = false;
  if (!qcResult.passed && isFixableResult(qcResult)) {
    appliedFixes = await applyQcFixes(input.burnedVideo, qcResult);
  }
  const payload: QcStageResult = { ...qcResult, appliedFixes };
  await saveStageMetadata(input.workspace, 'qc', payload);
  return payload;
};
