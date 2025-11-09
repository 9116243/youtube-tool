import type { QueueDriver } from './types.js';
import { logger } from '../utils/logger.js';

export class RedisQueueDriver implements QueueDriver {
  constructor(private url?: string) {
    logger.warn('Redis queue driver not implemented; using memory driver instead');
  }

  async enqueue(_taskId: string) {
    logger.warn('Redis enqueue not implemented');
  }

  async dequeue() {
    logger.warn('Redis dequeue not implemented');
    return null;
  }

  async init(_taskIds: string[]) {
    logger.warn('Redis init not implemented');
  }
}
