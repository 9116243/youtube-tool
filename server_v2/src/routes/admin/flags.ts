import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { deleteOrgOverride, invalidateFlag, listFlags, setOrgOverride, upsertFlag } from '../../services/flags.js';
import { HttpError } from '../../utils/http-error.js';

const router = Router();

const keySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9._-]+$/i, 'Key may only include letters, numbers, ".", "_" or "-"');

const upsertSchema = z.object({
  key: keySchema,
  defaultValue: z.boolean()
});

const overrideSchema = z.object({
  orgId: z.string().min(1),
  value: z.boolean()
});

const parseKey = (input: unknown) => {
  const parsed = keySchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(400, 'ERR_VALIDATION', 'Invalid feature flag key', parsed.error.flatten());
  }
  return parsed.data;
};

const ensureFlagExists = async (key: string) => {
  const record = await prisma.featureFlag.findUnique({ where: { key } });
  if (!record) {
    throw new HttpError(404, 'ERR_NOT_FOUND', 'Feature flag not found');
  }
  return record;
};

router.get(
  '/admin/flags',
  requireAuth,
  requirePermission('admin', 'read'),
  async (_req, res) => {
    const items = await listFlags();
    res.json({ items });
  }
);

router.post(
  '/admin/flags',
  requireAuth,
  requirePermission('admin', 'write'),
  async (req, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'ERR_VALIDATION', 'Invalid feature flag payload', parsed.error.flatten());
    }
    const existing = await prisma.featureFlag.findUnique({ where: { key: parsed.data.key } });
    await upsertFlag(parsed.data.key, parsed.data.defaultValue);
    res
      .status(existing ? 200 : 201)
      .json({ key: parsed.data.key, defaultValue: parsed.data.defaultValue });
  }
);

router.delete(
  '/admin/flags/:key',
  requireAuth,
  requirePermission('admin', 'write'),
  async (req, res) => {
    const key = parseKey(req.params.key);
    await ensureFlagExists(key);
    await prisma.featureFlag.delete({ where: { key } });
    invalidateFlag(key);
    res.status(204).end();
  }
);

router.post(
  '/admin/flags/:key/overrides',
  requireAuth,
  requirePermission('admin', 'write'),
  async (req, res) => {
    const key = parseKey(req.params.key);
    await ensureFlagExists(key);
    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'ERR_VALIDATION', 'Invalid override payload', parsed.error.flatten());
    }
    await setOrgOverride(key, parsed.data.orgId, parsed.data.value);
    res.json({ key, orgId: parsed.data.orgId, value: parsed.data.value });
  }
);

router.delete(
  '/admin/flags/:key/overrides/:orgId',
  requireAuth,
  requirePermission('admin', 'write'),
  async (req, res) => {
    const key = parseKey(req.params.key);
    const orgId = req.params.orgId;
    await ensureFlagExists(key);
    await deleteOrgOverride(key, orgId);
    res.status(204).end();
  }
);

router.post(
  '/admin/flags/:key/invalidate',
  requireAuth,
  requirePermission('admin', 'write'),
  async (req, res) => {
    const key = parseKey(req.params.key);
    await ensureFlagExists(key);
    invalidateFlag(key);
    res.status(202).json({ key, status: 'invalidated' });
  }
);

export const adminFlagsRouter = router;
