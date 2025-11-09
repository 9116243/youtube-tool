import type { TaskCreateInput, TaskRecord, TaskUpdateInput } from '../../tasks/models.js';

export interface QueueAdapter {
  createTask(input: TaskCreateInput): Promise<TaskRecord>;
  listTasks(organizationId?: string): Promise<TaskRecord[]>;
  getTask(id: string, organizationId?: string): Promise<TaskRecord | null>;
  updateTask(id: string, data: TaskUpdateInput): Promise<TaskRecord>;
  findRunnableTask(): Promise<TaskRecord | null>;
  fetchDependencies(ids: string[]): Promise<TaskRecord[]>;
  getQueueCounts(organizationId?: string): Promise<{ queued: number; running: number }>;
}
