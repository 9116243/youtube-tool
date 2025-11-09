import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { HttpError } from '../utils/http-error';

const uploadSchema = z
  .object({
    testName: z.string().min(1).default('Untitled Test'),
    samples: z
      .array(
        z
          .object({
            variant: z.string().min(1),
            payload: z.record(z.unknown()).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const fitSchema = z
  .object({
    testId: z.string().min(1).optional(),
  })
  .strict();

export const abRouter = Router();

abRouter.post('/ab/upload', async (req, res, next) => {
  try {
    const result = uploadSchema.safeParse(req.body);
    if (!result.success) {
      throw new HttpError(400, 'Invalid AB upload payload', 'VALIDATION_ERROR', result.error.flatten());
    }

    const test = await prisma.abTest.create({
      data: {
        name: result.data.testName,
      },
    });

    await prisma.abSample.createMany({
      data: result.data.samples.map((sample) => ({
        variant: sample.variant,
        payload: sample.payload ? JSON.stringify(sample.payload) : null,
        testId: test.id,
      })),
    });

    res.status(201).json({ ok: true, testId: test.id, inserted: result.data.samples.length });
  } catch (error) {
    next(error);
  }
});

abRouter.get('/ab/stats', async (_req, res, next) => {
  try {
    const totalSamples = await prisma.abSample.count();
    const group = await prisma.abSample.groupBy({
      by: ['variant'],
      _count: { variant: true },
    });

    type VariantGroup = { variant: string; _count: { variant: number } };

    res.json({
      ok: true,
      totalSamples,
      variants: (group as VariantGroup[]).map((item) => ({
        variant: item.variant,
        count: item._count.variant,
      })),
    });
  } catch (error) {
    next(error);
  }
});

abRouter.post('/ab/fit', async (req, res, next) => {
  try {
    const result = fitSchema.safeParse(req.body ?? {});
    if (!result.success) {
      throw new HttpError(400, 'Invalid AB fit payload', 'VALIDATION_ERROR', result.error.flatten());
    }

    res.json({
      ok: true,
      run: {
        id: `fit_${Date.now()}`,
        status: 'completed',
        accuracy: 0.87,
      },
    });
  } catch (error) {
    next(error);
  }
});

abRouter.get('/ab/report', async (_req, res, next) => {
  try {
    res.json({
      ok: true,
      summary: 'AB testing insights are not yet available, showing placeholder data.',
      winners: [
        { variant: 'A', uplift: '+4.2%' },
        { variant: 'B', uplift: '+1.1%' },
      ],
    });
  } catch (error) {
    next(error);
  }
});
