import { appEnv } from '../../utils/env';

const dollarsToCents = (value: number) => Math.round(value * 100);

const RATE_1080 = dollarsToCents(appEnv.HAIPER_PRICE_PER_MIN_1080 ?? 0);

export const getHaiperRateCents = () => RATE_1080;

export const estimateHaiperCostCents = (durationSeconds: number) => {
  const rate = getHaiperRateCents();
  if (!rate || rate <= 0) {
    return 0;
  }
  const minutes = Math.max(0, durationSeconds) / 60;
  return Math.round(minutes * rate);
};
