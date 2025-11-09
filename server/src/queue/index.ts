import { appEnv } from '../utils/env';
import { logger } from '../utils/logger';
import { MemoryQueueDriver } from './memory';
import { RedisQueueDriver } from './redis';
import type { TaskQueueDriver } from './types';

let driver: TaskQueueDriver | null = null;

const createDriver = (): TaskQueueDriver => {
  if (appEnv.QUEUE_DRIVER === 'redis') {
    return new RedisQueueDriver(appEnv.REDIS_URL);
  }
  return new MemoryQueueDriver();
};

const getDriver = (): TaskQueueDriver => {
  if (!driver) {
    driver = createDriver();
    logger.info('Queue driver initialized: %s', appEnv.QUEUE_DRIVER);
  }
  return driver;
};

export const enqueueTask = async (taskId: string) => {
  await getDriver().enqueue(taskId);
};

export const requeueTask = async (taskId: string) => {
  await getDriver().requeue(taskId);
};

export const dequeueTask = async (): Promise<string> => getDriver().dequeue();

export const queueSize = () => getDriver().size();
