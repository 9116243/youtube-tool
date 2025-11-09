import { metrics } from './index';

const sanitizePolicyLabel = (policy: string | undefined) => {
  if (!policy) return 'unknown';
  return policy.startsWith('force:') ? 'force' : policy;
};

export const recordGenerationCost = (provider: string, policy: string | undefined, cents?: number | null) => {
  if (!provider || cents === null || cents === undefined) {
    return;
  }
  if (!Number.isFinite(cents) || cents <= 0) {
    return;
  }
  metrics.generationCost.labels(provider, sanitizePolicyLabel(policy)).inc(cents);
};

export const recordGenerationProviderRequest = (
  provider: string,
  action: string,
  outcome: 'success' | 'error',
) => {
  if (!provider) return;
  const safeAction = action || 'unknown';
  metrics.generationProviderRequests.labels(provider, safeAction, outcome).inc();
};

export const recordGenerationRouteDecision = (policy: string | undefined, from: string, to: string) => {
  metrics.generationRouteDecision.labels(policy ?? 'unknown', from || 'initial', to || 'unknown').inc();
};

export const recordGenerationFallback = (from: string, to: string, reason: string) => {
  metrics.generationFallback.labels(from || 'unknown', to || 'unknown', reason || 'GEN_PROVIDER_ERROR').inc();
};
