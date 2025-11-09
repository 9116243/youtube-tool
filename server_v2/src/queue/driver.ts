export type QueueJob = {
  id: string;
  taskId: string;
  attempts: number;
  maxAttempts: number;
  progress?: number;
  lastError?: string | null;
};

export type EnqueueOptions = {
  maxAttempts: number;
  delayMs?: number;
};

export type FailOptions = {
  retryable: boolean;
  delayMs?: number;
};

export interface QueueDriver {
  init(seed?: Array<{ taskId: string; maxAttempts: number }>): Promise<void>;
  enqueue(taskId: string, options: EnqueueOptions): Promise<void>;
  dequeue(): Promise<QueueJob | null>;
  ack(jobId: string): Promise<void>;
  fail(jobId: string, reason: string, options: FailOptions): Promise<void>;
  release(jobId: string, options?: { delayMs?: number }): Promise<void>;
  progress(jobId: string, progress: number): Promise<void>;
  get(jobId: string): Promise<QueueJob | null>;
  pollDeadLetter(limit: number): Promise<QueueJob[]>;
  counts(): Promise<{ queued: number; running: number }>;
}
