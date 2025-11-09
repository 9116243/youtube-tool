import { appEnv } from '../../utils/env';
import type { RunwayModel } from './mapping';

const dollarsToCents = (value: number) => Math.round(value * 100);

const FLASH_RATE_CENTS = dollarsToCents(appEnv.RUNWAY_PRICE_PER_MIN_FLASH ?? 0);
const ALPHA_RATE_CENTS = dollarsToCents(appEnv.RUNWAY_PRICE_PER_MIN_ALPHA ?? 0);

export const getRunwayRateCents = (model: RunwayModel) =>
  model === 'gen3-alpha' ? ALPHA_RATE_CENTS : FLASH_RATE_CENTS;

export const estimateRunwayCostCents = (durationSeconds: number, model: RunwayModel) => {
  const rate = getRunwayRateCents(model);
  if (!rate || rate <= 0) {
    return 0;
  }
  const minutes = Math.max(0, durationSeconds) / 60;
  return Math.round(minutes * rate);
};
