import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

export type TaskEventType =
  | 'task.created'
  | 'task.status'
  | 'task.progress'
  | 'task.retry'
  | 'task.failed'
  | 'task.completed'
  | 'task.cancelled'
  | 'task.deadletter'
  | 'gen.effect.fallback'
  | 'webhook.success'
  | 'webhook.failed';

export interface RecordTaskEventInput {
  taskId: string;
  organizationId: string;
  type: TaskEventType;
  payload?: Record<string, unknown> | null;
  actor?: string | null;
}

export interface TaskEventCursor {
  id: string;
  createdAt: string;
}

const encodeCursor = (cursor: TaskEventCursor) =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

const decodeCursor = (value: string): TaskEventCursor | null => {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as TaskEventCursor;
    if (parsed?.id && parsed?.createdAt) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
};

const serializePayload = (payload?: Record<string, unknown> | null) => {
  if (!payload) return null;
  try {
    return JSON.stringify(payload);
  } catch (error) {
    logger.warn({ err: error, payload }, 'Failed to serialize task event payload');
    return null;
  }
};

export const recordTaskEvent = async ({ taskId, organizationId, type, payload, actor }: RecordTaskEventInput) => {
  try {
    await prisma.taskEvent.create({
      data: {
        taskId,
        organizationId,
        type,
        payload: serializePayload(payload),
        actor: actor ?? null
      }
    });
  } catch (error) {
    logger.error({ err: error, type, taskId }, 'Failed to record task event');
  }
};

export const listTaskEvents = async ({
  taskId,
  organizationId,
  limit,
  cursor
}: {
  taskId: string;
  organizationId: string;
  limit: number;
  cursor?: string;
}) => {
  const cursorData = cursor ? decodeCursor(cursor) : null;
  const records = await prisma.taskEvent.findMany({
    where: { taskId, organizationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursorData
      ? {
          cursor: { id: cursorData.id },
          skip: 1
        }
      : {})
  });
  const hasNext = records.length > limit;
  const slice = hasNext ? records.slice(0, -1) : records;
  const items = slice.map((event) => ({
    ...event,
    payload: event.payload ? safeParse(event.payload) : null
  }));
  const nextCursor =
    hasNext && items.length
      ? encodeCursor({
          id: items[items.length - 1].id,
          createdAt: items[items.length - 1].createdAt.toISOString()
        })
      : null;
  return { items, nextCursor };
};

const safeParse = (raw: string) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
