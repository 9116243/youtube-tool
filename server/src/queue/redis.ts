import { logger } from '../utils/logger';
import { MemoryQueueDriver } from './memory';

export class RedisQueueDriver extends MemoryQueueDriver {
  constructor(private readonly url?: string) {
    super();
    const suffix = url ? ` (${url})` : '';
    logger.warn('Redis queue driver not implemented yet, falling back to in-memory queue%s', suffix);
  }
}
