import { env } from '../../utils/env.js';

const dollarsToCents = (value: number) => Math.round(value * 100);

const RATE_1080 = dollarsToCents(env.LUMA_PRICE_PER_MIN_1080 ?? 0);
const RATE_2K = dollarsToCents(env.LUMA_PRICE_PER_MIN_2K ?? 0);
const RATE_4K = dollarsToCents(env.LUMA_PRICE_PER_MIN_4K ?? 0);

const tierRate = (resolution: '1080p' | '2k' | '4k') => {
  if (resolution === '4k') return RATE_4K;
  if (resolution === '2k') return RATE_2K;
  return RATE_1080;
};

export const getLumaRateCents = (resolution: '1080p' | '2k' | '4k') => tierRate(resolution);

export const estimateLumaCostCents = (durationSeconds: number, resolution: '1080p' | '2k' | '4k') => {
  const rate = getLumaRateCents(resolution);
  if (!rate || rate <= 0) return 0;
  const minutes = Math.max(0, durationSeconds) / 60;
  return Math.round(minutes * rate);
};
