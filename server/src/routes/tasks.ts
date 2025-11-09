import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { mapTask } from '../utils/task-mapper';
import { HttpError } from '../utils/http-error';
import { requireAuth } from '../middleware/auth';
import { protectedLimiter } from '../middleware/rate-limit';
import { enqueueTask } from '../queue';

const createTaskSchema = z
  .object({
    title: z.string().min(1),
    preset: z.string().min(1).optional().nullable(),
    params: z.record(z.unknown()).optional(),
  })
  .strict();

const controlSchema = z
  .object({
    action: z.enum(['pause', 'resume', 'cancel']),
  })
  .strict();

const idSchema = z.object({
  id: z.string().min(1),
});

export const tasksRouter = Router();

tasksRouter.get('/tasks', async (_req, res, next) => {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(tasks.map(mapTask));
  } catch (error) {
    next(error);
  }
});

tasksRouter.get('/tasks/:id', async (req, res, next) => {
  try {
    const params = idSchema.safeParse(req.params);
    if (!params.success) {
      throw new HttpError(400, 'Invalid task id', 'INVALID_TASK_ID', params.error.flatten());
    }
    const task = await prisma.task.findUnique({ where: { id: params.data.id } });
    if (!task) {
      throw new HttpError(404, 'Task not found', 'TASK_NOT_FOUND');
    }
    res.json(mapTask(task));
  } catch (error) {
    next(error);
  }
});

tasksRouter.post('/tasks', requireAuth, protectedLimiter, async (req, res, next) => {
  try {
    const payload = createTaskSchema.safeParse(req.body);
    if (!payload.success) {
      throw new HttpError(400, 'Invalid task payload', 'INVALID_TASK_PAYLOAD', payload.error.flatten());
    }
    const created = await prisma.task.create({
      data: {
        title: payload.data.title,
        preset: payload.data.preset ?? null,
        params: JSON.stringify(payload.data.params ?? {}),
        ownerId: req.user?.id,
      },
    });
    await enqueueTask(created.id);
    res.status(201).json(mapTask(created));
  } catch (error) {
    next(error);
  }
});

tasksRouter.patch('/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    const params = idSchema.safeParse(req.params);
    if (!params.success) {
      throw new HttpError(400, 'Invalid task id', 'INVALID_TASK_ID', params.error.flatten());
    }
    const control = controlSchema.safeParse(req.body);
    if (!control.success) {
      throw new HttpError(400, 'Invalid task action', 'INVALID_TASK_ACTION', control.error.flatten());
    }
    const statusMap: Record<z.infer<typeof controlSchema>['action'], string> = {
      pause: 'PAUSED',
      resume: 'QUEUED',
      cancel: 'CANCELLED',
    };
    const updated = await prisma.task.update({
      where: { id: params.data.id },
      data: { status: statusMap[control.data.action] },
    });
    res.json(mapTask(updated));
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'P2025') {
      next(new HttpError(404, 'Task not found', 'TASK_NOT_FOUND'));
      return;
    }
    next(error);
  }
});
