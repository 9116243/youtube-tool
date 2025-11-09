import { prisma } from '../db/prisma.js';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import type { EnqueueOptions, FailOptions, QueueDriver, QueueJob } from './driver.js';
import { MemoryQueueDriver } from './memory.js';
import { RedisQueueDriver } from './redis-driver.js';
import { recordQueueEnqueued } from '../metrics/queue.js';

let driver: QueueDriver | null = null;
const queueDriverLabel = env.QUEUE_DRIVER ?? 'memory';

const DEFAULT_MAX_ATTEMPTS = Math.max(1, env.QUEUE_MAX_RETRIES);

const resolveDriver = (): QueueDriver => {
  if (driver) return driver;
  driver = env.QUEUE_DRIVER === 'redis' ? new RedisQueueDriver(env.REDIS_URL) : new MemoryQueueDriver();
  return driver;
};

const getMaxAttempts = async (taskId: string) => {
  const record = await prisma.task.findUnique({
    where: { id: taskId },
    select: { maxRetries: true }
  });
  const attempts = record?.maxRetries ?? DEFAULT_MAX_ATTEMPTS;
  return Math.max(1, attempts);
};

export const initializeQueue = async () => {
  const queued = await prisma.task.findMany({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, maxRetries: true }
  });
  const seed = queued.map((task) => ({
    taskId: task.id,
    maxAttempts: Math.max(1, task.maxRetries ?? DEFAULT_MAX_ATTEMPTS)
  }));
  await resolveDriver().init(seed);
  logger.info(`Queue initialized with ${seed.length} task(s) using ${env.QUEUE_DRIVER} driver`);
};

export const enqueueTask = async (taskId: string, options?: { delayMs?: number }) => {
  const maxAttempts = await getMaxAttempts(taskId);
  const payload: EnqueueOptions = { maxAttempts, delayMs: options?.delayMs };
  await resolveDriver().enqueue(taskId, payload);
  recordQueueEnqueued(queueDriverLabel);
};

export const dequeueJob = async (): Promise<QueueJob | null> => resolveDriver().dequeue();

export const acknowledgeJob = async (jobId: string) => resolveDriver().ack(jobId);

export const failJob = async (jobId: string, reason: string, options: FailOptions) =>
  resolveDriver().fail(jobId, reason, options);

export const releaseJob = async (jobId: string, options?: { delayMs?: number }) =>
  resolveDriver().release(jobId, options);

export const reportJobProgress = async (jobId: string, progress: number) =>
  resolveDriver().progress(jobId, progress);

export const pollDeadLetters = async (limit: number) => resolveDriver().pollDeadLetter(limit);

export const getQueueCounts = async () => resolveDriver().counts();
