import { env } from '../../utils/env.js';
import type { QueueAdapter } from './types.js';
import { LocalQueueAdapter } from './local-queue.js';
import { RedisQueueAdapter } from './redis-queue.js';

let adapter: QueueAdapter | null = null;

export const getQueueAdapter = (): QueueAdapter => {
  if (adapter) return adapter;
  if (env.QUEUE_DRIVER === 'redis') {
    adapter = new RedisQueueAdapter(env.REDIS_URL);
  } else {
    adapter = new LocalQueueAdapter();
  }
  return adapter;
};

export type { QueueAdapter } from './types.js';
