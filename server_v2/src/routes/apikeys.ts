import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { HttpError } from '../utils/http-error.js';
import { generateApiKey, hashApiKey } from '../services/api-keys.js';
import { recordAuditLog } from '../services/audit.js';
import { env } from '../utils/env.js';

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const ensureOrgContext = (req: Request) => {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
  }
  return orgId;
};

const ensureUserActor = (req: Request) => {
  if (req.auth?.actorType !== 'user' || !req.auth.userId) {
    throw new HttpError(403, 'USER_AUTH_REQUIRED', 'User authentication required for this action');
  }
  return req.auth.userId;
};

const createKeySchema = z
  .object({
    serviceAccountId: z.string().min(1).optional(),
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(512).optional()
  })
  .refine((value) => Boolean(value.serviceAccountId || value.name), {
    message: 'Provide name when creating a new service account',
    path: ['name']
  });

router.get(
  '/apikeys',
  requireAuth,
  requirePermission('apikeys', 'read'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const accounts = await prisma.serviceAccount.findMany({
      where: { organizationId: orgId },
      include: {
        apiKeys: {
          select: {
            id: true,
            keyPrefix: true,
            lastFour: true,
            createdAt: true,
            lastUsedAt: true,
            revokedAt: true
          },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ serviceAccounts: accounts });
  })
);

router.post(
  '/apikeys',
  requireAuth,
  requirePermission('apikeys', 'write'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const actorUserId = ensureUserActor(req);
    const parsed = createKeySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_APIKEY_PAYLOAD', 'Invalid API key payload', parsed.error.flatten());
    }
    let serviceAccount =
      parsed.data.serviceAccountId
        ? await prisma.serviceAccount.findFirst({
            where: { id: parsed.data.serviceAccountId, organizationId: orgId }
          })
        : null;
    if (parsed.data.serviceAccountId && !serviceAccount) {
      throw new HttpError(404, 'SERVICE_ACCOUNT_NOT_FOUND', 'Service account not found');
    }
    if (!serviceAccount) {
      serviceAccount = await prisma.serviceAccount.create({
        data: {
          organizationId: orgId,
          name: parsed.data.name!,
          description: parsed.data.description ?? null
        }
      });
    }
    const rawKey = generateApiKey();
    const hashed = hashApiKey(rawKey);
    const keyRecord = await prisma.apiKey.create({
      data: {
        serviceAccountId: serviceAccount.id,
        keyHash: hashed,
        keyPrefix: env.API_KEY_PREFIX,
        lastFour: rawKey.slice(-4)
      },
      select: {
        id: true,
        serviceAccountId: true,
        keyPrefix: true,
        lastFour: true,
        createdAt: true
      }
    });
    await recordAuditLog({
      orgId,
      action: 'apikey.created',
      target: keyRecord.id,
      payload: { serviceAccountId: serviceAccount.id },
      req,
      actorUserId
    });
    res.status(201).json({
      apiKey: rawKey,
      key: keyRecord,
      serviceAccount
    });
  })
);

router.delete(
  '/apikeys/:id',
  requireAuth,
  requirePermission('apikeys', 'write'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const actorUserId = ensureUserActor(req);
    const apiKey = await prisma.apiKey.findFirst({
      where: { id: req.params.id, serviceAccount: { organizationId: orgId } }
    });
    if (!apiKey) {
      throw new HttpError(404, 'APIKEY_NOT_FOUND', 'API key not found');
    }
    if (!apiKey.revokedAt) {
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { revokedAt: new Date() }
      });
      await recordAuditLog({
        orgId,
        action: 'apikey.revoked',
        target: apiKey.id,
        payload: { serviceAccountId: apiKey.serviceAccountId },
        req,
        actorUserId
      });
    }
    res.status(204).send();
  })
);

export const apiKeysRouter = router;
