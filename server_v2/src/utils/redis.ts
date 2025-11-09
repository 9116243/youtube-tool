import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

let client: Redis | null = null;

const memoryStore = new Map<string, NodeJS.Timeout>();

const createClient = (): Redis | null => {
  if (!env.REDIS_URL) {
    logger.warn('REDIS_URL not configured; falling back to in-memory idempotency store');
    return null;
  }
  const instance = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2
  });
  instance.on('error', (error: unknown) => logger.error({ err: error }, 'Redis error'));
  instance.on('connect', () => logger.info('Redis connection established'));
  return instance;
};

export const getRedisClient = () => {
  if (client) return client;
  client = createClient();
  return client;
};

export const setWithTtl = async (key: string, ttlSeconds: number) => {
  const redis = getRedisClient();
  if (redis) {
    try {
      const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      logger.error({ err: error }, 'Redis SET failed, falling back to memory');
    }
  }
  if (memoryStore.has(key)) {
    return false;
  }
  const timer = setTimeout(() => {
    memoryStore.delete(key);
  }, ttlSeconds * 1000);
  memoryStore.set(key, timer);
  return true;
};

export const deleteKey = async (key: string) => {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(key);
    } catch (error) {
      logger.error({ err: error }, 'Redis DEL failed');
    }
  }
  const timer = memoryStore.get(key);
  if (timer) {
    clearTimeout(timer);
    memoryStore.delete(key);
  }
};
