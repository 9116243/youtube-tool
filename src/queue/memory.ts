import type { QueueDriver } from './types.js';

export class MemoryQueueDriver implements QueueDriver {
  private queue: string[] = [];
  private inQueue = new Set<string>();

  async enqueue(taskId: string) {
    if (this.inQueue.has(taskId)) return;
    this.queue.push(taskId);
    this.inQueue.add(taskId);
  }

  async dequeue() {
    const id = this.queue.shift() ?? null;
    if (id) {
      this.inQueue.delete(id);
    }
    return id;
  }

  async init(taskIds: string[]) {
    for (const id of taskIds) {
      await this.enqueue(id);
    }
  }

  size() {
    return this.queue.length;
  }
}
