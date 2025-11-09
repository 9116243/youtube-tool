import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { HttpError } from '../../utils/http-error.js';
import { metrics } from '../../metrics/index.js';
import { enqueueTask } from '../../queue/index.js';
import { defaultTaskResult } from '../../tasks/models.js';
import { recordTaskEvent } from '../../services/task-event.js';

const router = Router();

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional()
});

const replaySchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1)
});

const encodeCursor = (item: { id: string; createdAt: Date }) =>
  Buffer.from(JSON.stringify({ id: item.id, createdAt: item.createdAt.toISOString() })).toString('base64url');

const decodeCursor = (value?: string | null) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { id: string; createdAt: string };
    if (parsed?.id && parsed?.createdAt) {
      return { id: parsed.id, createdAt: new Date(parsed.createdAt) };
    }
  } catch {
    return null;
  }
  return null;
};

router.get(
  '/admin/deadletters',
  requireAuth,
  requirePermission('admin', 'read'),
  async (req, res) => {
    const auth = req.auth!;
    const orgId = auth.orgId;
    if (!orgId) {
      throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
    }
    const params = paginationSchema.safeParse(req.query);
    if (!params.success) {
      throw new HttpError(400, 'ERR_VALIDATION', 'Invalid pagination query', params.error.flatten());
    }
    const cursorData = decodeCursor(params.data.cursor);
    const tasks = await prisma.task.findMany({
      where: { organizationId: orgId, status: 'failed' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.data.limit + 1,
      ...(cursorData
        ? {
            cursor: { id: cursorData.id },
            skip: 1
          }
        : {})
    });
    const hasNext = tasks.length > params.data.limit;
    const slice = hasNext ? tasks.slice(0, -1) : tasks;
    res.json({
      items: slice,
      nextCursor: hasNext ? encodeCursor(slice[slice.length - 1]) : null
    });
  }
);

router.post(
  '/admin/deadletters/replay',
  requireAuth,
  requirePermission('admin', 'write'),
  async (req, res) => {
    const auth = req.auth!;
    const orgId = auth.orgId;
    if (!orgId) {
      throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
    }
    const parsed = replaySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'ERR_VALIDATION', 'Invalid replay payload', parsed.error.flatten());
    }
    const tasks = await prisma.task.findMany({
      where: { id: { in: parsed.data.taskIds }, organizationId: orgId, status: 'failed' }
    });
    if (!tasks.length) {
      res.json({ replayed: 0 });
      return;
    }
    const defaultResultPayload = JSON.stringify(defaultTaskResult);
    await prisma.$transaction(async (tx) => {
      for (const task of tasks) {
        await tx.task.update({
          where: { id: task.id },
          data: {
            status: 'queued',
            progress: 0,
            eta: null,
            result: defaultResultPayload
          }
        });
        await enqueueTask(task.id);
      }
    });
    await Promise.all(
      tasks.map((task) =>
        recordTaskEvent({
          taskId: task.id,
          organizationId: task.organizationId,
          type: 'task.retry',
          payload: { source: 'admin_deadletter_replay' },
          actor: auth.userId ?? auth.serviceAccountId ?? 'admin'
        })
      )
    );
    metrics.deadletterReplayed.inc(tasks.length);
    res.json({ replayed: tasks.length });
  }
);

router.delete(
  '/admin/deadletters',
  requireAuth,
  requirePermission('admin', 'write'),
  async (req, res) => {
    const auth = req.auth!;
    const orgId = auth.orgId;
    if (!orgId) {
      throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
    }
    const parsed = replaySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'ERR_VALIDATION', 'Invalid delete payload', parsed.error.flatten());
    }
    const result = await prisma.task.deleteMany({
      where: { id: { in: parsed.data.taskIds }, organizationId: orgId, status: 'failed' }
    });
    metrics.deadletterPurged.inc(result.count ?? 0);
    res.json({ purged: result.count ?? 0 });
  }
);

export const adminDeadlettersRouter = router;
