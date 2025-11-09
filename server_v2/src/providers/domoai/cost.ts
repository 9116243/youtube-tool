import { env } from '../../utils/env.js';

const dollarsToCents = (value: number) => Math.round(value * 100);
const EFFECT_RATE_CENTS = dollarsToCents(env.DOMOAI_PRICE_PER_MIN_EFFECT ?? 0);

export const estimateDomoAiEffectCostCents = (durationSeconds: number) => {
  if (!EFFECT_RATE_CENTS || EFFECT_RATE_CENTS <= 0) {
    return 0;
  }
  const minutes = Math.max(0, durationSeconds) / 60;
  return Math.round(minutes * EFFECT_RATE_CENTS);
};
