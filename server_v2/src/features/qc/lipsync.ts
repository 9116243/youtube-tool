import { env } from '../../utils/env.js';

export type LipSyncResult = {
  offsetMs: number;
  threshold: number;
  withinThreshold: boolean;
  adjustmentMs: number;
};

export const evaluateLipSync = (offsetMs: number): LipSyncResult => {
  const threshold = env.LIPSYNC_MAX_OFFSET_MS;
  const withinThreshold = Math.abs(offsetMs) <= threshold;
  const adjustmentMs = withinThreshold ? 0 : offsetMs > 0 ? offsetMs - threshold : offsetMs + threshold;
  return {
    offsetMs,
    threshold,
    withinThreshold,
    adjustmentMs
  };
};

export const applyLipSyncFix = (offsetMs: number): number => {
  const { adjustmentMs } = evaluateLipSync(offsetMs);
  return offsetMs - adjustmentMs;
};
