import { metrics } from './index.js';

const sanitizePolicyLabel = (policy: string) => {
  if (!policy) return 'unknown';
  return policy.startsWith('force:') ? 'force' : policy;
};

export const recordGenerationCost = (provider: string, policy: string, cents?: number | null) => {
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
  outcome: 'success' | 'error'
) => {
  if (!provider) return;
  const safeAction = action || 'unknown';
  metrics.generationProviderRequests.labels(provider, safeAction, outcome).inc();
};

export const recordGenerationRouteDecision = (policy: string, from: string, to: string) => {
  metrics.generationRouteDecision.labels(policy || 'unknown', from || 'initial', to || 'unknown').inc();
};

export const recordGenerationFallback = (from: string, to: string, reason: string) => {
  metrics.generationFallback.labels(from || 'unknown', to || 'unknown', reason || 'GEN_PROVIDER_ERROR').inc();
};

export const recordLicenseBlock = (provider: string, reason: string) => {
  metrics.generationLicenseBlock.labels(provider || 'unknown', reason || 'unknown').inc();
};
