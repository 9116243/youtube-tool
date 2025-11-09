import { HttpError } from '../utils/http-error';
import { VIDEO_GEN_PROVIDER_NAMES, type VideoGenProviderName } from './types';

const HISTORY_WINDOW_MS = 60 * 60 * 1000;

type ProviderEvent = {
  provider: VideoGenProviderName;
  success: boolean;
  timestamp: number;
  durationMs: number;
  costCents?: number;
};

const providerHistory: ProviderEvent[] = [];

const recordEvent = (event: ProviderEvent) => {
  providerHistory.push(event);
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  while (providerHistory.length && providerHistory[0].timestamp < cutoff) {
    providerHistory.shift();
  }
};

const getSummary = (provider: VideoGenProviderName) => {
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  const events = providerHistory.filter(
    (entry) => entry.provider === provider && entry.timestamp >= cutoff,
  );
  const successes = events.filter((entry) => entry.success);
  const successCount = successes.length;
  const totalCount = events.length;
  const avgDuration =
    successCount > 0 ? successes.reduce((sum, entry) => sum + entry.durationMs, 0) / successCount : 0;
  const avgCost =
    successCount > 0
      ? successes.reduce((sum, entry) => sum + (entry.costCents ?? 0), 0) / successCount
      : 0;
  return { successCount, totalCount, avgDuration, avgCost };
};

const computeScore = (provider: VideoGenProviderName) => {
  const { successCount, totalCount, avgDuration, avgCost } = getSummary(provider);
  const successRate = totalCount > 0 ? successCount / totalCount : 0.75;
  const durationFactor = 1 / (1 + avgDuration / 1000);
  const costFactor = 1 / (1 + avgCost / 100);
  return successRate * 0.6 + durationFactor * 0.25 + costFactor * 0.15;
};

const policyMap: Record<string, VideoGenProviderName[]> = {
  best_quality: ['kling', 'luma', 'runway'],
  lowest_cost: ['haiper', 'runway'],
};

const normalizeProviderName = (value: string): VideoGenProviderName | undefined => {
  const lower = value.toLowerCase();
  return VIDEO_GEN_PROVIDER_NAMES.find((name) => name === lower);
};

const chooseBalancedOrder = (): VideoGenProviderName[] => {
  const candidates: VideoGenProviderName[] = ['runway', 'haiper'];
  return [...candidates].sort((a, b) => computeScore(b) - computeScore(a));
};

export const getRouteCandidates = (policy?: string): VideoGenProviderName[] => {
  const normalized = (policy ?? 'balanced').toLowerCase().trim();
  if (normalized.startsWith('force:')) {
    const remainder = normalized.slice('force:'.length);
    if (!remainder) {
      throw new HttpError(400, 'GEN_UNSUPPORTED', 'Invalid force policy');
    }
    const [forcedName] = remainder.split(':');
    const provider = normalizeProviderName(forcedName);
    if (!provider) {
      throw new HttpError(400, 'GEN_UNSUPPORTED', `Provider "${forcedName}" is not registered`);
    }
    return [provider];
  }
  if (normalized === 'balanced') {
    return chooseBalancedOrder();
  }
  if (policyMap[normalized]) {
    return [...policyMap[normalized]];
  }
  return ['luma', 'runway', 'haiper'];
};

export const registerProviderOutcome = (
  provider: VideoGenProviderName,
  success: boolean,
  durationMs: number,
  costCents?: number,
) => {
  recordEvent({
    provider,
    success,
    durationMs,
    costCents,
    timestamp: Date.now(),
  });
};

export const normalizePolicyProvider = (value: string): VideoGenProviderName => {
  const provider = normalizeProviderName(value);
  if (!provider) {
    throw new Error(`Provider "${value}" is not registered`);
  }
  return provider;
};
