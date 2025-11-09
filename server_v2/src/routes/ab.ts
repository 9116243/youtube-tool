import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../utils/http-error.js';
import { requireAuth } from '../middleware/auth.js';
import { protectedLimiter } from '../middleware/rate-limit.js';
import { createExperiment, getExperimentStatus } from '../ab/engine.js';
import { prisma } from '../db/prisma.js';

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const ensureOrg = (req: Request) => {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
  }
  return orgId;
};

const createSchema = z.object({
  name: z.string().min(1),
  variants: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().optional()
    })
  ).min(2)
});

router.post(
  '/ab/experiments',
  requireAuth,
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrg(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_AB_PAYLOAD', 'Invalid experiment payload', parsed.error.flatten());
    }
    const experiment = await createExperiment({
      organizationId: orgId,
      name: parsed.data.name,
      variants: parsed.data.variants
    });
    res.status(201).json({ experimentId: experiment.experiment.id, variants: experiment.variants });
  })
);

router.get(
  '/ab/variants/:id/metrics',
  requireAuth,
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const variant = await prisma.variant.findUnique({ where: { id: req.params.id } });
    if (!variant) {
      throw new HttpError(404, 'VARIANT_NOT_FOUND', 'Variant does not exist');
    }
    const conversionRate = variant.impressions ? variant.conversions / variant.impressions : 0;
    res.json({
      id: variant.id,
      name: variant.name,
      description: variant.description,
      impressions: variant.impressions,
      conversions: variant.conversions,
      conversionRate
    });
  })
);

router.get(
  '/ab/experiments/:id/status',
  requireAuth,
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const status = await getExperimentStatus(req.params.id);
    if (!status) {
      throw new HttpError(404, 'EXPERIMENT_NOT_FOUND', 'Experiment does not exist');
    }
    res.json(status);
  })
);

export const abRouter = router;
