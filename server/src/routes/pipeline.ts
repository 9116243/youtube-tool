import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { mapTask } from '../utils/task-mapper';
import { HttpError } from '../utils/http-error';
import { requireAuth } from '../middleware/auth';
import { protectedLimiter } from '../middleware/rate-limit';
import { enqueueTask } from '../queue';

const pipelineSchema = z
  .object({
    title: z.string().min(1),
    preset: z.string().min(1).optional().nullable(),
    params: z.record(z.unknown()).optional(),
    dependsOn: z.array(z.string().min(1)).optional(),
  })
  .strict();

const submitSchema = z.object({
  tasks: z.array(pipelineSchema).min(1),
});

export const pipelineRouter = Router();

pipelineRouter.post('/pipeline/submit', requireAuth, protectedLimiter, async (req, res, next) => {
  try {
    const result = submitSchema.safeParse(req.body);
    if (!result.success) {
      throw new HttpError(400, 'Invalid pipeline payload', 'VALIDATION_ERROR', result.error.flatten());
    }

    const createdTasks = [];
    for (const taskInput of result.data.tasks) {
      const created = await prisma.task.create({
        data: {
          title: taskInput.title,
          preset: taskInput.preset ?? null,
          params: JSON.stringify(taskInput.params ?? {}),
          status: 'QUEUED',
          progress: 0,
          ownerId: req.user?.id,
        },
      });
      createdTasks.push(mapTask(created));
      await enqueueTask(created.id);
    }

    res.status(201).json({ created: createdTasks });
  } catch (error) {
    next(error);
  }
});
