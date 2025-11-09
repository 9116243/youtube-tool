import type { EnqueueOptions, FailOptions, QueueDriver, QueueJob } from './driver.js';

const now = () => Date.now();

type ScheduledJob = {
  jobId: string;
  availableAt: number;
};

export class MemoryQueueDriver implements QueueDriver {
  private jobs = new Map<string, QueueJob>();
  private pending: string[] = [];
  private processing = new Set<string>();
  private scheduled: ScheduledJob[] = [];
  private dead: QueueJob[] = [];

  async init(seed: Array<{ taskId: string; maxAttempts: number }> = []) {
    this.jobs.clear();
    this.pending = [];
    this.processing.clear();
    this.scheduled = [];
    this.dead = [];
    for (const entry of seed) {
      await this.enqueue(entry.taskId, { maxAttempts: entry.maxAttempts });
    }
  }

  private getOrCreateJob(taskId: string, maxAttempts: number) {
    const jobId = taskId;
    const existing = this.jobs.get(jobId);
    if (existing) {
      existing.maxAttempts = maxAttempts;
      existing.lastError = null;
      existing.progress = 0;
      return existing;
    }
    const job: QueueJob = {
      id: jobId,
      taskId,
      attempts: 0,
      maxAttempts,
      lastError: null,
      progress: 0
    };
    this.jobs.set(jobId, job);
    return job;
  }

  private schedule(jobId: string, delayMs: number) {
    this.scheduled.push({ jobId, availableAt: now() + delayMs });
  }

  private flushScheduled() {
    if (!this.scheduled.length) return;
    const current = now();
    const ready: string[] = [];
    this.scheduled = this.scheduled.filter((entry) => {
      if (entry.availableAt <= current) {
        ready.push(entry.jobId);
        return false;
      }
      return true;
    });
    ready.forEach((jobId) => {
      if (!this.pending.includes(jobId)) {
        this.pending.push(jobId);
      }
    });
  }

  async enqueue(taskId: string, options: EnqueueOptions) {
    const job = this.getOrCreateJob(taskId, options.maxAttempts);
    this.processing.delete(job.id);
    this.pending = this.pending.filter((id) => id !== job.id);
    if (options.delayMs && options.delayMs > 0) {
      this.schedule(job.id, options.delayMs);
    } else {
      this.pending.push(job.id);
    }
  }

  async dequeue(): Promise<QueueJob | null> {
    this.flushScheduled();
    const jobId = this.pending.shift();
    if (!jobId) return null;
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    this.processing.add(job.id);
    return { ...job };
  }

  async ack(jobId: string) {
    this.processing.delete(jobId);
    this.jobs.delete(jobId);
  }

  async fail(jobId: string, reason: string, options: FailOptions) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.processing.delete(jobId);
    job.attempts += 1;
    job.lastError = reason;
    if (options.retryable && job.attempts < job.maxAttempts) {
      if (options.delayMs && options.delayMs > 0) {
        this.schedule(jobId, options.delayMs);
      } else {
        this.pending.push(jobId);
      }
    } else {
      this.jobs.delete(jobId);
      this.dead.push({ ...job });
    }
  }

  async release(jobId: string, options?: { delayMs?: number }) {
    if (!this.jobs.has(jobId)) return;
    this.processing.delete(jobId);
    if (options?.delayMs) {
      this.schedule(jobId, options.delayMs);
    } else {
      this.pending.push(jobId);
    }
  }

  async progress(jobId: string, progress: number) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = progress;
    }
  }

  async get(jobId: string) {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  async pollDeadLetter(limit: number) {
    return this.dead.slice(0, limit).map((job) => ({ ...job }));
  }

  async counts() {
    this.flushScheduled();
    return {
      queued: this.pending.length + this.scheduled.length,
      running: this.processing.size
    };
  }
}
