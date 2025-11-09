import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { sseAdd, sseRemove } from '../sse.js';
import { getTask } from '../tasks/store.js';
import { HttpError } from '../utils/http-error.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const querySchema = z.object({
  taskId: z.string().min(1)
});

const headers = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*'
} as const;

const handleEvents = async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'INVALID_TASK_ID', 'Missing or invalid taskId', parsed.error.flatten());
  }

  const orgId = req.auth?.orgId;
  if (!orgId) {
    throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
  }

  const task = await getTask(parsed.data.taskId, orgId);
  if (!task) {
    throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found');
  }

  res.writeHead(200, headers);
  res.flushHeaders();
  res.write(': connected\n\n');

  sseAdd(task.id, res, {
    id: task.id,
    status: task.status,
    progress: task.progress,
    eta: task.eta ?? undefined,
    phase: task.result?.phase ?? 'queued',
    step: task.result?.step ?? 'pending',
    metrics: task.result?.metrics ?? {},
    files: task.result?.files ?? []
  });

  const cleanup = () => sseRemove(task.id, res);
  req.on('close', cleanup);
  req.on('end', cleanup);
  res.on('close', cleanup);
};

export const eventsRouter = Router();

eventsRouter.get(
  '/events',
  requireAuth,
  requirePermission('tasks', 'read'),
  (req, res, next) => {
    Promise.resolve(handleEvents(req, res)).catch(next);
  }
);
