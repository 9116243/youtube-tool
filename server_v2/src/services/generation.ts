import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { env } from '../utils/env.js';
import { startOfUtcDay } from '../utils/datetime.js';
import { logger } from '../utils/logger.js';

const CONCURRENCY_STATUSES = ['pending', 'running'];
const QUOTA_EXCLUDED_STATUSES = ['rejected_quota'];

type AuditParams = {
  generationId: string;
  organizationId: string;
  event: string;
  details?: Record<string, unknown>;
};

type QuotaParams = {
  generationId: string;
  organizationId: string;
  tenantId: string;
  estimatedMinutes: number;
};

export const calculateRequestedMinutes = (durationSeconds?: number | null) => {
  if (!Number.isFinite(durationSeconds)) {
    return 1;
  }
  const safeSeconds = Math.max(0, Number(durationSeconds));
  return Math.max(1, Math.ceil(safeSeconds / 60));
};

export const recordGenerationAudit = async ({ generationId, organizationId, event, details }: AuditParams) => {
  try {
    await prisma.generationAudit.create({
      data: {
        generationId,
        organizationId,
        event,
        details: details ? JSON.stringify(details) : null
      }
    });
  } catch (error) {
    logger.warn({ err: error, generationId, event }, 'Failed to record generation audit');
  }
};

export const enforceGenerationQuotas = async ({
  generationId,
  organizationId,
  tenantId,
  estimatedMinutes
}: QuotaParams) => {
  const start = startOfUtcDay();
  const [usage, concurrency] = await prisma.$transaction([
    prisma.generation.aggregate({
      where: {
        organizationId,
        createdAt: { gte: start },
        status: { notIn: QUOTA_EXCLUDED_STATUSES }
      },
      _sum: { estimatedMinutes: true }
    }),
    prisma.generation.count({
      where: {
        tenantId,
        status: { in: CONCURRENCY_STATUSES }
      }
    })
  ]);

  const overConcurrency = concurrency > env.GEN_QUOTA_CONCURRENCY;
  const usedMinutes = usage._sum.estimatedMinutes ?? 0;
  const overMinutes = usedMinutes > env.GEN_QUOTA_MIN_PER_DAY;

  if (!overConcurrency && !overMinutes) {
    return;
  }

  const reason = overConcurrency ? 'concurrency' : 'minutes';
  try {
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: 'rejected_quota',
        metadata: JSON.stringify({
          quotaReason: reason,
          limit:
            reason === 'concurrency' ? env.GEN_QUOTA_CONCURRENCY : env.GEN_QUOTA_MIN_PER_DAY,
          estimatedMinutes,
          timestamp: new Date().toISOString()
        })
      }
    });
  } catch (error) {
    logger.warn({ err: error, generationId, reason }, 'Failed to flag generation quota rejection');
  }

  await recordGenerationAudit({
    generationId,
    organizationId,
    event: reason === 'concurrency' ? 'quota.concurrency' : 'quota.minutes',
    details: {
      limit:
        reason === 'concurrency' ? env.GEN_QUOTA_CONCURRENCY : env.GEN_QUOTA_MIN_PER_DAY,
      estimatedMinutes
    }
  });

  throw new HttpError(
    429,
    'QUOTA_EXCEEDED',
    reason === 'concurrency'
      ? 'Generation concurrency quota exceeded'
      : 'Generation minute quota exceeded',
    { reason }
  );
};

export const getDailyGenerationUsage = async (organizationId: string) => {
  const start = startOfUtcDay();
  const aggregate = await prisma.generation.aggregate({
    where: {
      organizationId,
      createdAt: { gte: start },
      status: { notIn: QUOTA_EXCLUDED_STATUSES }
    },
    _sum: {
      billedMinutes: true,
      billedCents: true
    }
  });
  return {
    minutes: aggregate._sum.billedMinutes ?? 0,
    costCents: aggregate._sum.billedCents ?? 0
  };
};
