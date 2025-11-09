import type { Task as TaskModel } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { QueueAdapter } from './types.js';
import {
  buildTaskData,
  mapTaskRecord,
  type TaskCreateInput,
  type TaskRecord,
  type TaskUpdateInput,
  serializeParams
} from '../../tasks/models.js';

export class LocalQueueAdapter implements QueueAdapter {
  async createTask(input: TaskCreateInput): Promise<TaskRecord> {
    const task = await prisma.task.create({ data: buildTaskData(input) });
    return mapTaskRecord(task);
  }

  async listTasks(organizationId?: string): Promise<TaskRecord[]> {
    const tasks = await prisma.task.findMany({
      where: organizationId ? { organizationId } : undefined,
      orderBy: { createdAt: 'desc' }
    });
    return tasks.map(mapTaskRecord);
  }

  async getTask(id: string, organizationId?: string): Promise<TaskRecord | null> {
    const task = await prisma.task.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {})
      }
    });
    return task ? mapTaskRecord(task) : null;
  }

  async updateTask(id: string, data: TaskUpdateInput): Promise<TaskRecord> {
    const payload: Record<string, unknown> = {};
    if (data.title !== undefined) payload.title = data.title;
    if (data.description !== undefined) payload.description = data.description;
    if (data.preset !== undefined) payload.preset = data.preset;
    if (data.status !== undefined) payload.status = data.status;
    if (data.params !== undefined) payload.params = serializeParams(data.params);
    const updated = await prisma.task.update({ where: { id }, data: payload });
    return mapTaskRecord(updated);
  }

  async findRunnableTask(): Promise<TaskRecord | null> {
    const task = await prisma.task.findFirst({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' }
    });
    return task ? mapTaskRecord(task) : null;
  }

  async fetchDependencies(ids: string[]): Promise<TaskRecord[]> {
    if (!ids.length) return [];
    const tasks = await prisma.task.findMany({ where: { id: { in: ids } } });
    return tasks.map(mapTaskRecord);
  }

  async getQueueCounts(organizationId?: string): Promise<{ queued: number; running: number }> {
    const [queued, running] = await Promise.all([
      prisma.task.count({ where: { status: 'queued', ...(organizationId ? { organizationId } : {}) } }),
      prisma.task.count({ where: { status: 'running', ...(organizationId ? { organizationId } : {}) } })
    ]);
    return { queued, running };
  }
}
