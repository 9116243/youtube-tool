import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import type { GenerationCost } from '@prisma/client';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { updateCostMetrics, updateSlaMetrics } from './cost-exporter.js';

type ProviderPricing = {
  pricePerMinuteCents: number;
  sigmaThreshold: number;
};

type ProviderPricingFile = {
  metadata?: Record<string, unknown>;
  providers?: Record<string, ProviderPricing>;
  defaults?: ProviderPricing;
};

const defaultPricing: ProviderPricing = {
  pricePerMinuteCents: 60,
  sigmaThreshold: 2
};

let pricingConfigPromise: Promise<ProviderPricingFile> | null = null;
const pricingCache = new Map<string, ProviderPricing>();

const loadPricingConfig = async (): Promise<ProviderPricingFile> => {
  if (pricingConfigPromise) {
    return pricingConfigPromise;
  }
  pricingConfigPromise = (async () => {
    try {
      const candidate = isAbsolute(env.PROVIDER_PRICING_FILE)
        ? env.PROVIDER_PRICING_FILE
        : join(process.cwd(), env.PROVIDER_PRICING_FILE);
      const content = await readFile(candidate, 'utf8');
      const parsed = JSON.parse(content) as ProviderPricingFile;
      return {
        providers: parsed.providers ?? {},
        defaults: parsed.defaults ?? defaultPricing,
        metadata: parsed.metadata
      };
    } catch (error) {
      logger.warn({ err: error, path: env.PROVIDER_PRICING_FILE }, 'Unable to load provider pricing file, falling back to defaults');
      return { providers: {}, defaults: defaultPricing };
    }
  })();
  return pricingConfigPromise;
};

const getProviderPricing = async (providerId: string): Promise<ProviderPricing> => {
  if (pricingCache.has(providerId)) {
    return pricingCache.get(providerId)!;
  }
  const config = await loadPricingConfig();
  const pricing = config.providers?.[providerId] ?? config.defaults ?? defaultPricing;
  pricingCache.set(providerId, pricing);
  return pricing;
};

type CostGroupRow = {
  provider: string;
  policy: string;
  tasks: number;
  billedMinutes: number;
  costCents: number;
  successRate: number;
};

export type CostSummary = {
  window: { start: Date; end: Date };
  totalCostCents: number;
  totalMinutes: number;
  totalTasks: number;
  successRate: number;
  perProvider: Array<{
    provider: string;
    policy: string;
    tasks: number;
    billedMinutes: number;
    costCents: number;
    successRate: number;
    unitCostCents: number;
  }>;
};

export type ProviderEconomicsSignal = {
  provider: string;
  policy: string;
  unitCostCents: number;
  expectedUnitCostCents: number;
  sigma: number;
  deviationPercent: number;
  tasks: number;
  billedMinutes: number;
  costCents: number;
  successRate: number;
};

export type UnitEconomicsSummary = {
  window: { start: Date; end: Date };
  averageUnitCostCents: number;
  sigma: number;
  thresholdSigma: number;
  providerSignals: ProviderEconomicsSignal[];
};

export type SlaSummary = {
  window: { start: Date; end: Date };
  api: {
    successRate: number;
    target: number;
    total: number;
  };
  generation: {
    successRate: number;
    target: number;
    total: number;
  };
};

const buildSummary = (rows: CostGroupRow[], start: Date, end: Date): CostSummary => {
  const providerMap = new Map<string, { cost: number; minutes: number; tasks: number; success: number; provider: string; policy: string }>();
  const aggregate = { cost: 0, minutes: 0, tasks: 0, success: 0 };
  for (const row of rows) {
    const safeTasks = Number(row.tasks ?? 0);
    const safeMinutes = Number(row.billedMinutes ?? 0);
    const safeCost = Number(row.costCents ?? 0);
    const safeSuccess = Number(row.successRate ?? 0) * safeTasks;
    aggregate.cost += safeCost;
    aggregate.minutes += safeMinutes;
    aggregate.tasks += safeTasks;
    aggregate.success += safeSuccess;
    const key = `${row.provider}:${row.policy}`;
    const existing = providerMap.get(key);
    if (existing) {
      existing.cost += safeCost;
      existing.minutes += safeMinutes;
      existing.tasks += safeTasks;
      existing.success += safeSuccess;
    } else {
      providerMap.set(key, {
        provider: row.provider,
        policy: row.policy,
        cost: safeCost,
        minutes: safeMinutes,
        tasks: safeTasks,
        success: safeSuccess
      });
    }
  }
  const perProvider = Array.from(providerMap.values()).map((entry) => ({
    provider: entry.provider,
    policy: entry.policy,
    costCents: entry.cost,
    billedMinutes: entry.minutes,
    tasks: entry.tasks,
    successRate: entry.tasks ? entry.success / entry.tasks : 0,
    unitCostCents: entry.minutes ? entry.cost / entry.minutes : 0
  }));
  return {
    window: { start, end },
    totalCostCents: aggregate.cost,
    totalMinutes: aggregate.minutes,
    totalTasks: aggregate.tasks,
    successRate: aggregate.tasks ? aggregate.success / aggregate.tasks : 0,
    perProvider
  };
};

const deriveUnitEconomicsFromSummary = async (summary: CostSummary): Promise<UnitEconomicsSummary> => {
  const providerSignals: ProviderEconomicsSignal[] = [];
  for (const entry of summary.perProvider) {
    const pricing = await getProviderPricing(entry.provider);
    const expected = pricing.pricePerMinuteCents;
    const sigmaBase = Math.max(0.01, pricing.sigmaThreshold ?? 1);
    const delta = entry.unitCostCents - expected;
    const sigma = expected ? delta / (expected * sigmaBase) : 0;
    const deviationPercent = expected ? (delta / expected) * 100 : 0;
    providerSignals.push({
      provider: entry.provider,
      policy: entry.policy,
      unitCostCents: entry.unitCostCents,
      expectedUnitCostCents: expected,
      sigma,
      deviationPercent,
      tasks: entry.tasks,
      billedMinutes: entry.billedMinutes,
      costCents: entry.costCents,
      successRate: entry.successRate
    });
  }
  const averageUnitCost = summary.totalMinutes ? summary.totalCostCents / summary.totalMinutes : 0;
  const averageSigma =
    providerSignals.length > 0
      ? providerSignals.reduce((sum, signal) => sum + signal.sigma, 0) / providerSignals.length
      : 0;
  return {
    window: summary.window,
    averageUnitCostCents: averageUnitCost,
    sigma: averageSigma,
    thresholdSigma: env.COST_ALERT_UNIT_COST_SIGMA,
    providerSignals
  };
};

type CostSummaryOptions = {
  windowHours?: number;
  organizationId?: string;
};

const clampWindowHours = (value?: number) => {
  const candidate = Number.isFinite(value ?? NaN) ? Number(value) : 24;
  return Math.min(168, Math.max(1, Math.floor(candidate)));
};

export const getCostSummary = async ({ windowHours, organizationId }: CostSummaryOptions = {}) => {
  const hours = clampWindowHours(windowHours);
  const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows: GenerationCost[] = await prisma.generationCost.findMany({
    where: {
      periodStart: { gte: windowStart },
      ...(organizationId ? { organizationId } : {})
    }
  });
  const summary = buildSummary(
    rows.map((row) => ({
      provider: row.provider,
      policy: row.policy,
      tasks: row.tasks ?? 0,
      billedMinutes: row.billedMinutes ?? 0,
      costCents: row.costCents ?? 0,
      successRate: Number(row.successRate ?? 0)
    })),
    windowStart,
    new Date()
  );
  return summary;
};

export const getUnitEconomics = async (options: CostSummaryOptions = {}) => {
  const summary = await getCostSummary(options);
  return deriveUnitEconomicsFromSummary(summary);
};

type SlaOptions = {
  windowHours?: number;
  organizationId?: string;
};

export const getSlaStatus = async ({ windowHours, organizationId }: SlaOptions = {}) => {
  const hours = clampWindowHours(windowHours);
  const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000);
  const taskWhereBase = {
    createdAt: { gte: windowStart },
    ...(organizationId ? { organizationId } : {})
  };
  const generationWhereBase = {
    createdAt: { gte: windowStart },
    ...(organizationId ? { organizationId } : {})
  };
  const [taskTotal, taskSuccess, generationTotal, generationSuccess] = await prisma.$transaction([
    prisma.task.count({
      where: {
        ...taskWhereBase,
        status: { in: ['success', 'failed', 'cancelled'] }
      }
    }),
    prisma.task.count({
      where: {
        ...taskWhereBase,
        status: 'success'
      }
    }),
    prisma.generation.count({
      where: {
        ...generationWhereBase,
        status: { in: ['success', 'failed'] }
      }
    }),
    prisma.generation.count({
      where: {
        ...generationWhereBase,
        status: 'success'
      }
    })
  ]);
  const apiSuccessRate = taskTotal ? taskSuccess / taskTotal : 1;
  const generationSuccessRate = generationTotal ? generationSuccess / generationTotal : 1;
  return {
    window: { start: windowStart, end: new Date() },
    api: {
      successRate: apiSuccessRate,
      target: env.SLO_TARGET_API,
      total: taskTotal
    },
    generation: {
      successRate: generationSuccessRate,
      target: env.SLO_TARGET_GEN,
      total: generationTotal
    }
  };
};

type RunCostRollupResult = {
  summary: CostSummary;
  unitEconomics: UnitEconomicsSummary;
};

export const runCostRollup = async (start: Date, end: Date): Promise<RunCostRollupResult | null> => {
  if (end <= start) {
    return null;
  }
  const rows = await prisma.generation.findMany({
    where: {
      createdAt: { gte: start, lt: end }
    },
    select: {
      organizationId: true,
      provider: true,
      policy: true,
      status: true,
      billedMinutes: true,
      billedCents: true
    }
  });
  const groupMap = new Map<string, { organizationId: string; provider: string; policy: string; tasks: number; minutes: number; cost: number; success: number }>();
  for (const entry of rows) {
    const key = `${entry.organizationId}:${entry.provider}:${entry.policy}`;
    const target = groupMap.get(key) ?? {
      organizationId: entry.organizationId,
      provider: entry.provider,
      policy: entry.policy,
      tasks: 0,
      minutes: 0,
      cost: 0,
      success: 0
    };
    target.tasks += 1;
    target.minutes += Number(entry.billedMinutes ?? 0);
    target.cost += Number(entry.billedCents ?? 0);
    if (entry.status === 'success') {
      target.success += 1;
    }
    groupMap.set(key, target);
  }
  const insertRows = Array.from(groupMap.values()).map((entry) => ({
    organizationId: entry.organizationId,
    provider: entry.provider,
    policy: entry.policy,
    periodStart: start,
    periodEnd: end,
    tasks: entry.tasks,
    billedMinutes: entry.minutes,
    costCents: entry.cost,
    successRate: entry.tasks ? entry.success / entry.tasks : 0
  }));
  if (insertRows.length) {
    try {
      await prisma.generationCost.createMany({
        data: insertRows
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }
  }
  const summary = buildSummary(
    insertRows.length
      ? insertRows
      : [],
    start,
    end
  );
  const unitEconomics = await deriveUnitEconomicsFromSummary(summary);
  updateCostMetrics({
    totalCostCents: summary.totalCostCents,
    totalMinutes: summary.totalMinutes,
    totalTasks: summary.totalTasks,
    successRate: summary.successRate,
    averageUnitCostCents: unitEconomics.averageUnitCostCents,
    sigma: unitEconomics.sigma,
    windowStart: summary.window.start,
    windowEnd: summary.window.end,
    providerSigma: unitEconomics.providerSignals.map((signal) => ({
      provider: signal.provider,
      sigma: signal.sigma
    }))
  });
  const slaSummary = await getSlaStatus();
  updateSlaMetrics({
    apiSuccessRate: slaSummary.api.successRate,
    generationSuccessRate: slaSummary.generation.successRate,
    windowStart: slaSummary.window.start,
    windowEnd: slaSummary.window.end
  });
  return { summary, unitEconomics };
};
