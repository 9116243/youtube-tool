import type { VideoGenProviderName } from './registry.js';
import { metrics } from '../metrics/index.js';

const WINDOW_MS = 60 * 60 * 1000;
const MAX_HISTORY = 200;

type RouteCandidate = {
  providerId: string;
  adapterKey: VideoGenProviderName | string;
  policyOverride: string;
};

type RouteHistoryEntry = {
  ts: number;
  success: boolean;
  latencyMs: number;
  costCents?: number;
};

const providerHistory = new Map<string, RouteHistoryEntry[]>();

const ROUTES_BEST_QUALITY: RouteCandidate[] = [
  { providerId: 'kling', adapterKey: 'kling', policyOverride: 'force:kling' },
  { providerId: 'luma', adapterKey: 'luma', policyOverride: 'force:luma' },
  { providerId: 'runway_alpha', adapterKey: 'runway', policyOverride: 'force:runway:gen3-alpha' }
];

const ROUTES_LOWEST_COST: RouteCandidate[] = [
  { providerId: 'haiper', adapterKey: 'haiper', policyOverride: 'force:haiper' },
  { providerId: 'runway_flash', adapterKey: 'runway', policyOverride: 'force:runway:gen3-flash' }
];

const BALANCED_OPTIONS: RouteCandidate[] = [
  { providerId: 'runway_flash', adapterKey: 'runway', policyOverride: 'force:runway:gen3-flash' },
  { providerId: 'haiper', adapterKey: 'haiper', policyOverride: 'force:haiper' }
];

const DEFAULT_FALLBACK: RouteCandidate = {
  providerId: 'mock',
  adapterKey: 'mock',
  policyOverride: 'force:mock'
};

const cleanupHistory = (providerId: string) => {
  const entries = providerHistory.get(providerId);
  if (!entries) return;
  const cutoff = Date.now() - WINDOW_MS;
  while (entries.length && entries[0].ts < cutoff) {
    entries.shift();
  }
  if (entries.length > MAX_HISTORY) {
    entries.splice(0, entries.length - MAX_HISTORY);
  }
};

const recordHistory = (providerId: string, success: boolean, latencyMs: number, costCents?: number) => {
  const entries = providerHistory.get(providerId) ?? [];
  entries.push({ ts: Date.now(), success, latencyMs, costCents });
  providerHistory.set(providerId, entries);
  cleanupHistory(providerId);
};

const scoreBalancedProvider = (providerId: string) => {
  cleanupHistory(providerId);
  const entries = providerHistory.get(providerId) ?? [];
  if (!entries.length) {
    return providerId === 'runway_flash' ? 0.6 : 0.5;
  }
  const recent = entries.filter((entry) => Date.now() - entry.ts <= WINDOW_MS);
  if (!recent.length) return 0.5;
  const successCount = recent.filter((entry) => entry.success).length;
  const successRate = successCount / recent.length;
  const avgLatency =
    recent.reduce((sum, entry) => sum + (entry.latencyMs || 0), 0) / Math.max(1, recent.length);
  const latencyScore = 1 - Math.min(1, Math.max(0, avgLatency / 4000));
  const costEntries = recent.filter((entry) => typeof entry.costCents === 'number');
  const avgCost =
    costEntries.reduce((sum, entry) => sum + (entry.costCents ?? 0), 0) /
    Math.max(1, costEntries.length || 1);
  const costScore = costEntries.length ? 1 - Math.min(1, Math.max(0, (avgCost || 0) / 1500)) : 0.5;
  return successRate * 0.6 + latencyScore * 0.25 + costScore * 0.15;
};

const buildBalancedRoutes = (): RouteCandidate[] => {
  const sorted = [...BALANCED_OPTIONS].sort((a, b) => scoreBalancedProvider(b.providerId) - scoreBalancedProvider(a.providerId));
  const primary = sorted[0];
  const secondary = sorted[1] ?? DEFAULT_FALLBACK;
  return [primary, secondary];
};

const buildForceRoute = (policy: string): RouteCandidate[] => {
  const remainder = policy.slice('force:'.length);
  if (!remainder) {
    return [DEFAULT_FALLBACK];
  }
  const [providerPart] = remainder.split(':');
  return [
    {
      providerId: providerPart,
      adapterKey: providerPart,
      policyOverride: policy
    }
  ];
};

export const buildGenerationRoutes = (policy: string): RouteCandidate[] => {
  if (!policy) {
    return [DEFAULT_FALLBACK];
  }
  const normalized = policy.trim().toLowerCase();
  if (normalized.startsWith('force:')) {
    return buildForceRoute(policy);
  }
  if (normalized === 'best_quality') {
    return [...ROUTES_BEST_QUALITY, DEFAULT_FALLBACK];
  }
  if (normalized === 'lowest_cost') {
    return [...ROUTES_LOWEST_COST, DEFAULT_FALLBACK];
  }
  if (normalized === 'balanced') {
    return [...buildBalancedRoutes(), DEFAULT_FALLBACK];
  }
  return [...buildBalancedRoutes(), DEFAULT_FALLBACK];
};

export const recordRouteDecisionMetric = (policy: string, from: string, to: string) => {
  metrics.generationRouteDecision
    .labels(policy || 'unknown', from || 'initial', to || 'unknown')
    .inc();
};

export const recordFallbackMetric = (from: string, to: string, reason: string) => {
  metrics.generationFallback
    .labels(from || 'unknown', to || 'unknown', reason || 'GEN_PROVIDER_ERROR')
    .inc();
};

export const recordRouteOutcomeStats = (
  providerId: string,
  success: boolean,
  latencyMs: number,
  costCents?: number
) => {
  recordHistory(providerId, success, latencyMs, costCents);
};

export type { RouteCandidate };
