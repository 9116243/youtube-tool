import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { HttpError } from '../../utils/http-error.js';
import { buildTaskWebhookPayload } from '../webhook.js';
import { prisma } from '../../db/prisma.js';
import { listWebhookDeliveries, redeliverWebhook, sendWebhookDelivery } from '../../webhooks/dispatcher.js';

const router = Router();

const listSchema = z.object({
  taskId: z.string().min(1).optional(),
  status: z.enum(['pending', 'retrying', 'success', 'failed']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

const testSchema = z.object({
  taskId: z.string().min(1),
  url: z.string().url(),
  secret: z.string().optional(),
  payload: z.record(z.any()).optional()
});

router.get(
  '/admin/webhooks/deliveries',
  requireAuth,
  requirePermission('admin', 'read'),
  async (req, res) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
    }
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new HttpError(400, 'ERR_VALIDATION', 'Invalid query parameters', parsed.error.flatten());
    }
    const result = await listWebhookDeliveries({
      organizationId: orgId,
      taskId: parsed.data.taskId,
      status: parsed.data.status,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor
    });
    res.json(result);
  }
);

router.post(
  '/admin/webhooks/test',
  requireAuth,
  requirePermission('admin', 'write'),
  async (req, res) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
    }
    const parsed = testSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'ERR_VALIDATION', 'Invalid webhook test payload', parsed.error.flatten());
    }
    const task = await prisma.task.findFirst({
      where: { id: parsed.data.taskId, organizationId: orgId }
    });
    if (!task) {
      throw new HttpError(404, 'ERR_NOT_FOUND', 'Task not found in this organization');
    }
    const metrics =
      typeof task.result === 'string'
        ? safeParse(task.result)
        : (task.result as Record<string, unknown> | null) ?? {};
    const payload =
      parsed.data.payload ??
      (await buildTaskWebhookPayload({
        taskId: task.id,
        orgId,
        status: task.status,
        metrics: (metrics && typeof metrics === 'object' ? metrics : {}) ?? {}
      }));
    await sendWebhookDelivery({
      taskId: task.id,
      organizationId: orgId,
      url: parsed.data.url,
      secret: parsed.data.secret ?? null,
      payload
    });
    res.status(202).json({ ok: true });
  }
);

router.post(
  '/admin/webhooks/redeliver/:deliveryId',
  requireAuth,
  requirePermission('admin', 'write'),
  async (req, res) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
    }
    const deliveryId = req.params.deliveryId;
    if (!deliveryId) {
      throw new HttpError(400, 'ERR_VALIDATION', 'Missing delivery id');
    }
    try {
      await redeliverWebhook(deliveryId, orgId);
    } catch (error) {
      if ((error as Error).message === 'Webhook delivery not found') {
        throw new HttpError(404, 'ERR_NOT_FOUND', 'Delivery not found');
      }
      throw error;
    }
    res.status(202).json({ ok: true });
  }
);

export const adminWebhooksRouter = router;

const safeParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};
