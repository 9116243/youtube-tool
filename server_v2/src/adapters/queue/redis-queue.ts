import type { QueueAdapter } from './types.js';
import type { TaskCreateInput, TaskRecord, TaskUpdateInput } from '../../tasks/models.js';

export class RedisQueueAdapter implements QueueAdapter {
  constructor(_redisUrl?: string) {}

  private notImplemented(): never {
    throw new Error('Redis queue adapter is not implemented yet.');
  }

  async createTask(_input: TaskCreateInput): Promise<TaskRecord> {
    return this.notImplemented();
  }

  async listTasks(_organizationId?: string): Promise<TaskRecord[]> {
    return this.notImplemented();
  }

  async getTask(_id: string, _organizationId?: string): Promise<TaskRecord | null> {
    return this.notImplemented();
  }

  async updateTask(_id: string, _data: TaskUpdateInput): Promise<TaskRecord> {
    return this.notImplemented();
  }

  async findRunnableTask(): Promise<TaskRecord | null> {
    return this.notImplemented();
  }

  async fetchDependencies(_ids: string[]): Promise<TaskRecord[]> {
    return this.notImplemented();
  }

  async getQueueCounts(_organizationId?: string): Promise<{ queued: number; running: number }> {
    return this.notImplemented();
  }
}
