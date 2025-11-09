import { Redis } from 'ioredis';
import type { EnqueueOptions, FailOptions, QueueDriver, QueueJob } from './driver.js';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

const PENDING_KEY = 'queue:pending';
const PROCESSING_LIST = 'queue:processing:list';
const PROCESSING_ZSET = 'queue:processing:zset';
const DELAYED_KEY = 'queue:delayed';
const JOB_KEY = (id: string) => `queue:job:${id}`;
const DEAD_KEY = 'queue:dead';

const VISIBILITY_MS = 60_000;
const DRAIN_BATCH = 50;

const serialize = (job: QueueJob) => JSON.stringify(job);
const deserialize = (payload: string | null): QueueJob | null =>
  payload ? (JSON.parse(payload) as QueueJob) : null;

export class RedisQueueDriver implements QueueDriver {
  private client: Redis;

  constructor(url?: string) {
    const redisUrl = url ?? env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is required for RedisQueueDriver');
    }
    this.client = new Redis(redisUrl, {
      lazyConnect: false
    });
    this.client.on('error', (error) => logger.error({ err: error }, 'Redis queue error'));
    this.client.on('connect', () => logger.info('Redis queue connected'));
  }

  private async getJob(jobId: string) {
    const payload = await this.client.get(JOB_KEY(jobId));
    return deserialize(payload);
  }

  private async saveJob(job: QueueJob) {
    await this.client.set(JOB_KEY(job.id), serialize(job));
  }

  private async cleanupProcessing(jobId: string) {
    await this.client
      .multi()
      .lrem(PROCESSING_LIST, 0, jobId)
      .zrem(PROCESSING_ZSET, jobId)
      .exec();
  }

  private async moveDelayed() {
    const now = Date.now();
    const ids = await this.client.zrangebyscore(DELAYED_KEY, 0, now, 'LIMIT', 0, DRAIN_BATCH);
    if (!ids.length) return;
    const multi = this.client.multi();
    ids.forEach((id) => {
      multi.zrem(DELAYED_KEY, id);
      multi.lpush(PENDING_KEY, id);
    });
    await multi.exec();
  }

  private async reclaimStalled() {
    const threshold = Date.now() - VISIBILITY_MS;
    const stalled = await this.client.zrangebyscore(PROCESSING_ZSET, 0, threshold, 'LIMIT', 0, DRAIN_BATCH);
    if (!stalled.length) return;
    const multi = this.client.multi();
    stalled.forEach((id) => {
      multi.zrem(PROCESSING_ZSET, id);
      multi.lrem(PROCESSING_LIST, 0, id);
      multi.lpush(PENDING_KEY, id);
    });
    await multi.exec();
  }

  async init(seed: Array<{ taskId: string; maxAttempts: number }> = []) {
    if (seed.length === 0) return;
    const multi = this.client.multi();
    seed.forEach((entry) => {
      const job: QueueJob = {
        id: entry.taskId,
        taskId: entry.taskId,
        attempts: 0,
        maxAttempts: entry.maxAttempts,
        lastError: null,
        progress: 0
      };
      multi.set(JOB_KEY(job.id), serialize(job));
      multi.lpush(PENDING_KEY, job.id);
    });
    await multi.exec();
  }

  async enqueue(taskId: string, options: EnqueueOptions) {
    const jobId = taskId;
    const existing = await this.getJob(jobId);
    const job: QueueJob = existing
      ? { ...existing, maxAttempts: options.maxAttempts, lastError: null }
      : {
          id: jobId,
          taskId,
          attempts: 0,
          maxAttempts: options.maxAttempts,
          lastError: null,
          progress: 0
        };
    await this.saveJob(job);
    const multi = this.client.multi();
    multi.lrem(PENDING_KEY, 0, jobId);
    multi.zrem(DELAYED_KEY, jobId);
    multi.lrem(PROCESSING_LIST, 0, jobId);
    multi.zrem(PROCESSING_ZSET, jobId);
    if (options.delayMs && options.delayMs > 0) {
      multi.zadd(DELAYED_KEY, Date.now() + options.delayMs, jobId);
    } else {
      multi.lpush(PENDING_KEY, jobId);
    }
    await multi.exec();
  }

  async dequeue(): Promise<QueueJob | null> {
    await this.moveDelayed();
    await this.reclaimStalled();
    const jobId = await this.client.rpoplpush(PENDING_KEY, PROCESSING_LIST);
    if (!jobId) return null;
    await this.client.zadd(PROCESSING_ZSET, Date.now(), jobId);
    const job = await this.getJob(jobId);
    if (!job) {
      await this.cleanupProcessing(jobId);
      return null;
    }
    return { ...job };
  }

  async ack(jobId: string) {
    await this.cleanupProcessing(jobId);
    await this.client.del(JOB_KEY(jobId));
  }

  async fail(jobId: string, reason: string, options: FailOptions) {
    const job = await this.getJob(jobId);
    if (!job) {
      await this.cleanupProcessing(jobId);
      return;
    }
    job.attempts += 1;
    job.lastError = reason;
    await this.saveJob(job);
    await this.cleanupProcessing(jobId);
    if (options.retryable && job.attempts < job.maxAttempts) {
      if (options.delayMs && options.delayMs > 0) {
        await this.client.zadd(DELAYED_KEY, Date.now() + options.delayMs, jobId);
      } else {
        await this.client.lpush(PENDING_KEY, jobId);
      }
    } else {
      await this.client.rpush(DEAD_KEY, serialize(job));
      await this.client.del(JOB_KEY(jobId));
    }
  }

  async release(jobId: string, options?: { delayMs?: number }) {
    await this.cleanupProcessing(jobId);
    if (options?.delayMs && options.delayMs > 0) {
      await this.client.zadd(DELAYED_KEY, Date.now() + options.delayMs, jobId);
    } else {
      await this.client.lpush(PENDING_KEY, jobId);
    }
  }

  async progress(jobId: string, progress: number) {
    const job = await this.getJob(jobId);
    if (!job) return;
    job.progress = progress;
    await this.saveJob(job);
  }

  async get(jobId: string) {
    const job = await this.getJob(jobId);
    return job ? { ...job } : null;
  }

  async pollDeadLetter(limit: number) {
    const entries = await this.client.lrange(DEAD_KEY, 0, limit - 1);
    return entries
      .map((item) => deserialize(item))
      .filter((job): job is QueueJob => Boolean(job))
      .map((job) => ({ ...job }));
  }

  async counts() {
    const [pending, processing, delayed] = await Promise.all([
      this.client.llen(PENDING_KEY),
      this.client.zcard(PROCESSING_ZSET),
      this.client.zcard(DELAYED_KEY)
    ]);
    return {
      queued: pending + delayed,
      running: processing
    };
  }
}
