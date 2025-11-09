import { prisma } from '../db/prisma.js';
import { env } from '../utils/env.js';

type CreateExperimentInput = {
  organizationId: string;
  name: string;
  variants: Array<{ name: string; description?: string }>;
};

type VariantMetrics = {
  id: string;
  name: string;
  description: string | null;
  impressions: number;
  conversions: number;
  conversionRate: number;
};

export type ExperimentStatus = {
  experimentId: string;
  name: string;
  status: string;
  bestVariant: VariantMetrics | null;
  variants: VariantMetrics[];
  converged: boolean;
  lastCheckedAt: string | null;
  winnerId: string | null;
};

const alphaBetaSample = (alpha: number, beta: number) => {
  const alphaSample = gammaSample(alpha);
  const betaSample = gammaSample(beta);
  if (!alphaSample || !betaSample) return 0;
  return alphaSample / (alphaSample + betaSample);
};

const gammaSample = (shape: number): number => {
  if (shape <= 0) return 0;
  if (shape < 1) {
    const u = Math.random();
    return gammaSample(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x = 0;
    let v = 0;
    do {
      const u = Math.random();
      const z = normalSample();
      x = z;
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v;
    }
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
};

const normalSample = (): number => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const buildMetrics = (variant: { id: string; name: string; description: string | null; impressions: number; conversions: number }): VariantMetrics => ({
  id: variant.id,
  name: variant.name,
  description: variant.description,
  impressions: variant.impressions,
  conversions: variant.conversions,
  conversionRate: variant.impressions ? variant.conversions / variant.impressions : 0
});

export const createExperiment = async (input: CreateExperimentInput) => {
  const experiment = await prisma.experiment.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      metricPrimary: env.AB_METRIC_PRIMARY,
      explorationRate: env.AB_EXPLORATION_RATE,
      minImpressions: env.AB_MIN_IMPRESSIONS,
      cooldownMin: env.AB_COOLDOWN_MIN
    }
  });
  const variants = await prisma.$transaction(
    input.variants.map((variant) =>
      prisma.variant.create({
        data: {
          experimentId: experiment.id,
          name: variant.name,
          description: variant.description ?? null
        }
      })
    )
  );
  return { experiment, variants };
};

export const selectVariant = async (experimentId: string) => {
  const variants = await prisma.variant.findMany({ where: { experimentId } });
  if (!variants.length) {
    throw new Error('Experiment has no variants');
  }
  const scores = variants.map((variant) => {
    const alpha = 1 + variant.conversions;
    const beta = 1 + variant.impressions - variant.conversions;
    return {
      variant,
      score: alphaBetaSample(alpha, beta)
    };
  });
  const best = scores.reduce((prev, current) => (current.score > prev.score ? current : prev), scores[0]);
  await prisma.variant.update({
    where: { id: best.variant.id },
    data: { impressions: { increment: 1 } }
  });
  return best.variant;
};

export const updateMetrics = async ({
  variantId,
  impressions = 0,
  conversions = 0
}: {
  variantId: string;
  impressions?: number;
  conversions?: number;
}) => {
  await prisma.variant.update({
    where: { id: variantId },
    data: {
      impressions: { increment: impressions },
      conversions: { increment: conversions }
    }
  });
};

const getVariantMetrics = async (experimentId: string) => {
  const variants = await prisma.variant.findMany({ where: { experimentId } });
  return variants.map(buildMetrics);
};

export const getExperimentStatus = async (experimentId: string): Promise<ExperimentStatus | null> => {
  const experiment = await prisma.experiment.findUnique({
    where: { id: experimentId },
    include: { bandit: true }
  });
  if (!experiment) return null;
  const variants = await getVariantMetrics(experimentId);
  const sorted = [...variants].sort((a, b) => b.conversionRate - a.conversionRate);
  const best = sorted[0] ?? null;
  const second = sorted[1] ?? null;
  const converged =
    Boolean(best && best.impressions >= experiment.minImpressions) &&
    (!second || best.conversionRate - second.conversionRate >= 0.01);
  if (best && experiment.bandit) {
    await prisma.banditState.upsert({
      where: { experimentId },
      update: {
        lastWinnerId: best.id,
        lastCheckedAt: new Date()
      },
      create: {
        experimentId,
        lastWinnerId: best.id,
        lastCheckedAt: new Date()
      }
    });
  }
  return {
    experimentId: experiment.id,
    name: experiment.name,
    status: experiment.status,
    bestVariant: best,
    variants,
    converged,
    lastCheckedAt: experiment.bandit?.lastCheckedAt?.toISOString() ?? null,
    winnerId: experiment.bandit?.lastWinnerId ?? null
  };
};
