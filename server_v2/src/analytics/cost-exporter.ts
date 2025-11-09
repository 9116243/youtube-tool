import { Gauge } from 'prom-client';
import { register } from '../metrics/index.js';

type CostMetricPayload = {
  totalCostCents: number;
  totalMinutes: number;
  totalTasks: number;
  successRate: number;
  averageUnitCostCents: number;
  sigma: number;
  windowStart: Date;
  windowEnd: Date;
  providerSigma: Array<{ provider: string; sigma: number }>;
};

type SlaMetricPayload = {
  apiSuccessRate: number;
  generationSuccessRate: number;
  windowStart: Date;
  windowEnd: Date;
};

const costRollupTotal = new Gauge({
  name: 'cost_rollup_total_cents',
  help: 'Total cents rolled up during the latest cost cron window',
  registers: [register]
});

const costRollupMinutes = new Gauge({
  name: 'cost_rollup_minutes_total',
  help: 'Total billed minutes in the latest cost rollup window',
  registers: [register]
});

const costRollupTasks = new Gauge({
  name: 'cost_rollup_tasks_total',
  help: 'Total render generations counted during the latest cost window',
  registers: [register]
});

const costRollupSuccess = new Gauge({
  name: 'cost_rollup_success_rate',
  help: 'Success rate of generations in the latest cost window',
  registers: [register]
});

const costRollupUnitCost = new Gauge({
  name: 'cost_rollup_average_unit_cost_cents',
  help: 'Average cents per minute calculated in the latest cost window',
  registers: [register]
});

const costRollupUnitCostSigma = new Gauge({
  name: 'cost_rollup_unit_cost_sigma',
  help: 'Normalized deviation of the latest unit cost against configured pricing sigmas',
  registers: [register]
});

const costRollupProviderSigma = new Gauge({
  name: 'cost_rollup_provider_unit_cost_sigma',
  help: 'Per-provider sigma for the latest unit cost vs pricing target',
  labelNames: ['provider'],
  registers: [register]
});

const slaApi = new Gauge({
  name: 'analytics_sla_api_success_rate',
  help: 'API success rate calculated from the latest SLA window',
  registers: [register]
});

const slaGeneration = new Gauge({
  name: 'analytics_sla_generation_success_rate',
  help: 'Generation success rate calculated from the latest SLA window',
  registers: [register]
});

export const updateCostMetrics = (payload: CostMetricPayload) => {
  costRollupTotal.set(payload.totalCostCents);
  costRollupMinutes.set(payload.totalMinutes);
  costRollupTasks.set(payload.totalTasks);
  costRollupSuccess.set(payload.successRate);
  costRollupUnitCost.set(payload.averageUnitCostCents);
  costRollupUnitCostSigma.set(payload.sigma);
  costRollupProviderSigma.reset();
  payload.providerSigma.forEach((source) => {
    costRollupProviderSigma.labels(source.provider).set(source.sigma);
  });
};

export const updateSlaMetrics = (payload: SlaMetricPayload) => {
  slaApi.set(payload.apiSuccessRate);
  slaGeneration.set(payload.generationSuccessRate);
};
