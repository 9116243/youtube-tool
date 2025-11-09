import crypto from 'node:crypto';
import { env } from '../utils/env.js';
import { deleteKey, setWithTtl } from '../utils/redis.js';

const prefix = 'ytb:idempotency';

const buildRedisKey = (key: string) => `${prefix}:${key}`;

export const hashFingerprint = (input: Record<string, unknown>) => {
  const json = JSON.stringify(input, Object.keys(input).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
};

export const acquireIdempotencyLock = async (key: string) => {
  const namespaced = buildRedisKey(key);
  return setWithTtl(namespaced, env.IDEMPOTENCY_TTL_SECONDS);
};

export const releaseIdempotencyLock = async (key: string) => {
  const namespaced = buildRedisKey(key);
  await deleteKey(namespaced);
};
