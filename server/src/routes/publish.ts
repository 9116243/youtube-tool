import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { HttpError } from '../utils/http-error';
import { requireAuth } from '../middleware/auth';
import { protectedLimiter } from '../middleware/rate-limit';

const scheduleSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    scheduledFor: z.string().or(z.date()).transform((value) => new Date(value)),
  })
  .strict();

export const publishRouter = Router();

publishRouter.post('/publish/schedule', requireAuth, protectedLimiter, async (req, res, next) => {
  try {
    const result = scheduleSchema.safeParse(req.body);
    if (!result.success) {
      throw new HttpError(400, 'Invalid schedule payload', 'VALIDATION_ERROR', result.error.flatten());
    }

    const data = result.data;

    const schedule = await prisma.publishSchedule.create({
      data: {
        title: data.title,
        description: data.description,
        scheduledFor: data.scheduledFor,
      },
    });

    res.status(201).json({
      ok: true,
      schedule: {
        id: schedule.id,
        title: schedule.title,
        description: schedule.description,
        scheduledFor: schedule.scheduledFor.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

publishRouter.get('/publish/list', async (_req, res, next) => {
  try {
    const schedules = await prisma.publishSchedule.findMany({
      orderBy: { scheduledFor: 'asc' },
    });

    res.json({
      ok: true,
      schedules: schedules.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        scheduledFor: item.scheduledFor.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});
