import { prisma } from '../db/prisma.js';
import { env } from '../utils/env.js';
import { notifyThresholdAlert } from '../notify/index.js';
import { logger } from '../utils/logger.js';

const INTERVAL_MS = 60_000;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const lastAlert = new Map<string, number>();
let timer: NodeJS.Timeout | null = null;

const shouldAlert = (key: string) => {
  const now = Date.now();
  const previous = lastAlert.get(key) ?? 0;
  if (now - previous < ALERT_COOLDOWN_MS) {
    return false;
  }
  lastAlert.set(key, now);
  return true;
};

const checkFailRates = async () => {
  const windowStart = new Date(Date.now() - 5 * 60 * 1000);
  const failures = await prisma.task.groupBy({
    by: ['organizationId'],
    where: { status: 'failed', updatedAt: { gte: windowStart } },
    _count: { _all: true }
  });
  if (!failures.length) return;
  const totals = await prisma.task.groupBy({
    by: ['organizationId'],
    where: { createdAt: { gte: windowStart } },
    _count: { _all: true }
  });
  const totalMap = new Map(totals.map((entry) => [entry.organizationId, entry._count._all]));
  await Promise.all(
    failures.map(async (entry) => {
      const total = totalMap.get(entry.organizationId) ?? 0;
      if (!total) return;
      const rate = entry._count._all / total;
      if (rate >= env.ALERT_FAILRATE_THRESHOLD && shouldAlert(`failrate:${entry.organizationId}`)) {
        await notifyThresholdAlert({
          orgId: entry.organizationId,
          kind: 'failrate',
          value: rate,
          threshold: env.ALERT_FAILRATE_THRESHOLD,
          windowMinutes: 5
        });
      }
    })
  );
};

const checkQueueDepth = async () => {
  const queued = await prisma.task.groupBy({
    by: ['organizationId'],
    where: { status: 'queued' },
    _count: { _all: true }
  });
  await Promise.all(
    queued.map(async (entry) => {
      if (entry._count._all >= env.ALERT_QUEUE_DEPTH && shouldAlert(`queue:${entry.organizationId}`)) {
        await notifyThresholdAlert({
          orgId: entry.organizationId,
          kind: 'queue',
          value: entry._count._all,
          threshold: env.ALERT_QUEUE_DEPTH
        });
      }
    })
  );
};

const tick = async () => {
  try {
    await Promise.all([checkFailRates(), checkQueueDepth()]);
  } catch (error) {
    logger.warn({ err: error }, 'Alert worker tick failed');
  }
};

export const startAlertWorker = () => {
  if (timer) return;
  timer = setInterval(tick, INTERVAL_MS);
  void tick();
  logger.info('Alert worker started');
};
