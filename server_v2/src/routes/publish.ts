import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { requireAuth } from '../middleware/auth.js';
import { protectedLimiter } from '../middleware/rate-limit.js';
import { requirePermission } from '../middleware/rbac.js';
import { recordAuditLog } from '../services/audit.js';

const scheduleSchema = z
  .object({
    platform: z.string().min(1),
    language: z.string().min(1),
    region: z.string().min(1),
    scheduledAt: z.coerce.date(),
    owner: z.string().optional(),
    notes: z.string().optional()
  })
  .strict();

const updateStatusSchema = z
  .object({
    status: z.enum(['scheduled', 'published']),
    notes: z.string().optional()
  })
  .strict();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const ensureOrgContext = (req: Request) => {
  if (!req.auth?.orgId) {
    throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
  }
  return req.auth.orgId;
};

export const publishRouter = Router();

publishRouter.post(
  '/publish/schedule',
  requireAuth,
  requirePermission('publish', 'write'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_PUBLISH_PAYLOAD', 'Invalid schedule payload', parsed.error.flatten());
    }
    const row = await prisma.publishSchedule.create({
      data: { ...parsed.data, status: 'scheduled', organizationId: orgId }
    });
    await recordAuditLog({
      orgId,
      action: 'publish.schedule_created',
      target: row.id,
      payload: { platform: row.platform, scheduledAt: row.scheduledAt },
      req,
      actorUserId: req.auth?.userId ?? null,
      actorServiceAccountId: req.auth?.serviceAccountId ?? null
    });
    res.status(201).json(row);
  })
);

publishRouter.get(
  '/publish/list',
  requireAuth,
  requirePermission('publish', 'read'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const rows = await prisma.publishSchedule.findMany({
      where: { organizationId: orgId },
      orderBy: { scheduledAt: 'desc' }
    });
    res.json(rows);
  })
);

publishRouter.patch(
  '/publish/:id',
  requireAuth,
  requirePermission('publish', 'write'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const body = updateStatusSchema.safeParse(req.body);
    if (!body.success) {
      throw new HttpError(400, 'INVALID_PUBLISH_STATUS', 'Invalid publish status payload', body.error.flatten());
    }
    const updated = await prisma.publishSchedule.update({
      where: { id: req.params.id, organizationId: orgId },
      data: { status: body.data.status, notes: body.data.notes }
    });
    await recordAuditLog({
      orgId,
      action: 'publish.schedule_updated',
      target: updated.id,
      payload: { status: updated.status },
      req,
      actorUserId: req.auth?.userId ?? null,
      actorServiceAccountId: req.auth?.serviceAccountId ?? null
    });
    res.json(updated);
  })
);
