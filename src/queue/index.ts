import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import type { QueueDriver } from './types.js';
import { MemoryQueueDriver } from './memory.js';
import { RedisQueueDriver } from './redis.js';
import { prisma } from '../db/prisma.js';

let driver: QueueDriver | null = null;

const buildDriver = (): QueueDriver => {
  if (env.QUEUE_DRIVER === 'redis') {
    return new RedisQueueDriver(env.REDIS_URL);
  }
  return new MemoryQueueDriver();
};

const getDriver = () => {
  if (!driver) {
    driver = buildDriver();
  }
  return driver;
};

export const enqueueTask = async (taskId: string) => {
  await getDriver().enqueue(taskId);
};

export const dequeueTask = async () => getDriver().dequeue();

export const initializeQueue = async () => {
  const queued = await prisma.task.findMany({ where: { status: 'queued' }, select: { id: true } });
  if (queued.length && getDriver().init) {
    await getDriver().init!(queued.map((task) => task.id));
  }
  logger.info(`Queue initialized with ${queued.length} tasks`);
};
