import type { Prisma } from '@prisma/client';
import { getQueueAdapter } from '../adapters/queue/index.js';
import {
  defaultTaskResult,
  mapTaskRecord,
  type TaskCreateInput,
  type TaskRecord,
  type TaskResult,
  type TaskUpdateInput
} from './models.js';
import { prisma } from '../db/prisma.js';
import { enqueueTask } from '../queue/index.js';

const queue = getQueueAdapter();

export const createTask = async (input: TaskCreateInput) => {
  const task = await queue.createTask(input);
  await enqueueTask(task.id);
  return task;
};

export const listTasks = (organizationId: string) => queue.listTasks(organizationId);

export const getTask = (id: string, organizationId?: string) => queue.getTask(id, organizationId);

export const updateTask = (id: string, data: TaskUpdateInput) => queue.updateTask(id, data);

export const findRunnableTask = () => queue.findRunnableTask();

export const fetchDependencies = (ids: string[]) => queue.fetchDependencies(ids);

export const getQueueCounts = (organizationId?: string) => queue.getQueueCounts(organizationId);

export type TaskSort = 'createdAt_desc' | 'createdAt_asc' | 'progress_desc';

export type TaskQueryOptions = {
  organizationId: string;
  statuses?: string[];
  search?: string;
  limit: number;
  cursor?: { createdAt: Date; id: string };
  sort: TaskSort;
  createdFrom?: Date;
  createdTo?: Date;
};

const buildOrderBy = (sort: TaskSort): Prisma.TaskOrderByWithRelationInput[] => {
  if (sort === 'createdAt_asc') {
    return [{ createdAt: 'asc' }, { id: 'asc' }];
  }
  if (sort === 'progress_desc') {
    return [{ progress: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
  }
  return [{ createdAt: 'desc' }, { id: 'desc' }];
};

export const queryTasks = async (options: TaskQueryOptions) => {
  const filters: Prisma.TaskWhereInput[] = [{ organizationId: options.organizationId }];

  if (options.statuses?.length) {
    filters.push({ status: { in: options.statuses } });
  }

  if (options.search) {
    const orClauses: Prisma.TaskWhereInput[] = [
      { title: { contains: options.search } },
      { params: { contains: options.search } },
      { id: { equals: options.search } },
      { idempotency: { key: { contains: options.search } } }
    ];
    const parsedDate = Number.isNaN(Date.parse(options.search))
      ? null
      : new Date(options.search);
    if (parsedDate) {
      const end = new Date(parsedDate.getTime() + 24 * 60 * 60 * 1000);
      orClauses.push({ createdAt: { gte: parsedDate, lt: end } });
    }
    filters.push({ OR: orClauses });
  }

  if (options.createdFrom) {
    filters.push({ createdAt: { gte: options.createdFrom } });
  }

  if (options.createdTo) {
    filters.push({ createdAt: { lte: options.createdTo } });
  }

  if (options.cursor) {
    const { createdAt, id } = options.cursor;
    const cursorFilter: Prisma.TaskWhereInput =
      options.sort === 'createdAt_asc'
        ? {
            OR: [
              { createdAt: { gt: createdAt } },
              { AND: [{ createdAt: { equals: createdAt } }, { id: { gt: id } }] }
            ]
          }
        : {
            OR: [
              { createdAt: { lt: createdAt } },
              { AND: [{ createdAt: { equals: createdAt } }, { id: { lt: id } }] }
            ]
          };
    filters.push(cursorFilter);
  }

  const where =
    filters.length === 0 ? {} : filters.length === 1 ? filters[0] : { AND: filters };

  const tasks = await prisma.task.findMany({
    where,
    orderBy: buildOrderBy(options.sort),
    take: options.limit + 1
  });
  const hasNext = tasks.length > options.limit;
  const items = tasks.slice(0, options.limit).map(mapTaskRecord);
  const nextCursor =
    hasNext && items.length
      ? Buffer.from(
          JSON.stringify({
            id: items[items.length - 1].id,
            createdAt: items[items.length - 1].createdAt
          })
        ).toString('base64url')
      : null;

  return { items, nextCursor };
};

export { defaultTaskResult };
export type { TaskCreateInput, TaskRecord, TaskResult, TaskUpdateInput };
