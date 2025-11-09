import { prisma } from '../db/prisma.js';
import { env } from '../utils/env.js';
import { metrics } from '../metrics/index.js';
import { HttpError } from '../utils/http-error.js';
import { startOfUtcDay } from '../utils/datetime.js';
import { getDailyGenerationUsage } from './generation.js';

const BYTES_PER_GB = 1024 * 1024 * 1024;

const quotaError = (message: string) => new HttpError(429, 'ERR_QUOTA', message);

const bumpUsageRecord = async (
  organizationId: string,
  delta: Partial<{ tasksCount: number; renderSeconds: number }>
) => {
  const date = startOfUtcDay();
  await prisma.usageRecord.upsert({
    where: { organizationId_date: { organizationId, date } },
    update: {
      ...(delta.tasksCount
        ? { tasksCount: { increment: delta.tasksCount } }
        : undefined),
      ...(delta.renderSeconds
        ? { renderSeconds: { increment: delta.renderSeconds } }
        : undefined)
    },
    create: {
      organizationId,
      date,
      tasksCount: delta.tasksCount ?? 0,
      renderSeconds: delta.renderSeconds ?? 0
    }
  });
};

const getDailyUsage = async (organizationId: string) => {
  const date = startOfUtcDay();
  const record = await prisma.usageRecord.findUnique({
    where: { organizationId_date: { organizationId, date } }
  });
  return {
    tasksCount: record?.tasksCount ?? 0,
    renderSeconds: record?.renderSeconds ?? 0
  };
};

const getStorageUsage = async (organizationId: string) => {
  const aggregate = await prisma.upload.aggregate({
    where: { organizationId },
    _sum: { size: true }
  });
  return aggregate._sum.size ?? 0;
};

export const recordTaskUsage = async (organizationId: string, amount = 1) => {
  if (amount <= 0) return;
  await bumpUsageRecord(organizationId, { tasksCount: amount });
  metrics.usageTasks.labels(organizationId).inc(amount);
};

export const recordRenderUsage = async (organizationId: string, seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return;
  }
  await bumpUsageRecord(organizationId, { renderSeconds: seconds });
  metrics.usageMinutes.labels(organizationId).inc(seconds / 60);
};

export const assertTaskQuota = async (organizationId: string, incoming = 1) => {
  if (incoming <= 0) return;
  const usage = await getDailyUsage(organizationId);
  if (usage.tasksCount + incoming > env.QUOTA_TASKS_PER_DAY) {
    throw quotaError('Daily task quota exceeded');
  }
};

export const assertRenderQuota = async (organizationId: string) => {
  const usage = await getDailyUsage(organizationId);
  const usedMinutes = usage.renderSeconds / 60;
  if (usedMinutes >= env.QUOTA_RENDER_MIN_PER_DAY) {
    throw quotaError('Render minutes quota exceeded');
  }
};

export const assertStorageQuota = async (organizationId: string, incomingBytes: number) => {
  const limitBytes = env.QUOTA_STORAGE_GB * BYTES_PER_GB;
  const used = await getStorageUsage(organizationId);
  if (used + incomingBytes > limitBytes) {
    throw quotaError('Storage quota exceeded');
  }
  return { used, limitBytes };
};

export const refreshStorageUsage = async (organizationId: string) => {
  const used = await getStorageUsage(organizationId);
  metrics.usageStorage.labels(organizationId).set(used);
  return used;
};

export const getUsageSnapshot = async (organizationId: string) => {
  const usage = await getDailyUsage(organizationId);
  const storageBytes = await refreshStorageUsage(organizationId);
  const renderMinutes = usage.renderSeconds / 60;
  const generationUsage = await getDailyGenerationUsage(organizationId);
  return {
    tasks: {
      used: usage.tasksCount,
      limit: env.QUOTA_TASKS_PER_DAY
    },
    renderMinutes: {
      used: Number(renderMinutes.toFixed(2)),
      limit: env.QUOTA_RENDER_MIN_PER_DAY
    },
    storage: {
      usedBytes: storageBytes,
      limitBytes: env.QUOTA_STORAGE_GB * BYTES_PER_GB
    },
    generations: {
      minutesUsed: generationUsage.minutes,
      limit: env.GEN_QUOTA_MIN_PER_DAY,
      concurrencyLimit: env.GEN_QUOTA_CONCURRENCY,
      costCents: generationUsage.costCents
    }
  };
};
