import type { TaskQueueDriver } from './types';

type Resolver = (value: string) => void;

export class MemoryQueueDriver implements TaskQueueDriver {
  private queue: string[] = [];

  private waiters: Resolver[] = [];

  async enqueue(taskId: string): Promise<void> {
    this.queue.push(taskId);
    this.flush();
  }

  async requeue(taskId: string): Promise<void> {
    this.queue.unshift(taskId);
    this.flush();
  }

  async dequeue(): Promise<string> {
    const next = this.queue.shift();
    if (next) {
      return next;
    }

    return new Promise<string>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  size(): number {
    return this.queue.length;
  }

  private flush() {
    if (!this.waiters.length) {
      return;
    }
    while (this.queue.length && this.waiters.length) {
      const waiter = this.waiters.shift();
      if (waiter) {
        const id = this.queue.shift()!;
        waiter(id);
      }
    }
  }
}
