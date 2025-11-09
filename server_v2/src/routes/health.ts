import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { getQueueCounts } from '../tasks/store.js';
import { getRedisClient } from '../utils/redis.js';
import { env } from '../utils/env.js';
import { pingBucket } from '../storage/s3-storage.js';
import { getWorkerHealth } from '../worker/state.js';
import { isDraining } from '../state/shutdown.js';

const HEARTBEAT_TIMEOUT_MS = 30_000;

const checkDatabase = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
};

const checkRedis = async () => {
  if (!env.REDIS_URL) {
    return { ok: true, skipped: true };
  }
  try {
    const client = getRedisClient();
    if (!client) {
      return { ok: false, error: 'client_unavailable' };
    }
    await client.ping();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
};

const checkS3 = async () => {
  if (env.BLOB_BACKEND !== 's3') {
    return { ok: true, skipped: true };
  }
  try {
    await pingBucket();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
};

const computeHeartbeat = () => {
  const worker = getWorkerHealth();
  const now = Date.now();
  const forkBeat = worker.forkWorkers.reduce((max, entry) => Math.max(max, entry.heartbeat ?? 0), 0);
  const inlineBeat = worker.inlineHeartbeat ?? 0;
  const heartbeat = worker.forkWorkers.length ? forkBeat : inlineBeat;
  const heartbeatOk = heartbeat > 0 && now - heartbeat < HEARTBEAT_TIMEOUT_MS;
  return { worker, heartbeatOk };
};

export const healthRouter = Router();

healthRouter.get('/healthz', async (_req, res) => {
  const [db, redis, s3] = await Promise.all([checkDatabase(), checkRedis(), checkS3()]);
  const ok = db.ok && redis.ok && s3.ok;
  res.status(ok ? 200 : 503).json({
    ok,
    components: {
      db,
      redis,
      s3
    },
    time: new Date().toISOString()
  });
});

healthRouter.get('/readyz', async (_req, res) => {
  let queue = { queued: -1, running: -1 };
  try {
    queue = await getQueueCounts();
  } catch {
    // ignore
  }
  const { worker, heartbeatOk } = computeHeartbeat();
  const draining = isDraining();
  const ready = heartbeatOk && !draining && queue.running >= 0;
  res.status(ready ? 200 : 503).json({
    ok: ready,
    draining,
    heartbeatOk,
    queue,
    worker
  });
});
