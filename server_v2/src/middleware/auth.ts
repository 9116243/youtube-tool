import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import { env } from '../utils/env.js';
import { HttpError } from '../utils/http-error.js';
import { hashApiKey } from '../services/api-keys.js';
import { updateRequestContext } from '../observability/context.js';

const BEARER_PREFIX = 'Bearer ';

type Role = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        actorType: 'user' | 'service';
        userId?: string;
        email?: string | null;
        serviceAccountId?: string;
        orgId?: string;
        role?: Role;
      };
    }
  }
}

const ensureAuthContext = (req: Request) => {
  if (!req.auth) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
  }
};

const authenticateUserToken = (req: Request) => {
  const header = req.header('Authorization') ?? req.header('authorization');
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing Authorization header');
  }
  const token = header.slice(BEARER_PREFIX.length).trim();
  const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string; email?: string };
  if (!payload.sub) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Invalid token');
  }
  req.auth = {
    actorType: 'user',
    userId: payload.sub,
    email: payload.email ?? null
  };
};

const authenticateApiKey = async (req: Request, apiKey: string) => {
  const keyHash = hashApiKey(apiKey);
  const record = await prisma.apiKey.findFirst({
    where: { keyHash },
    include: { serviceAccount: true }
  });
  if (!record || record.revokedAt || !record.serviceAccount) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Invalid API key');
  }
  await prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() }
  });
  req.auth = {
    actorType: 'service',
    serviceAccountId: record.serviceAccountId,
    orgId: record.serviceAccount.organizationId,
    role: 'ADMIN'
  };
};

const attachUserOrganization = async (req: Request) => {
  ensureAuthContext(req);
  if (req.auth?.actorType !== 'user' || !req.auth.userId) {
    return;
  }
  const requestedOrgId = req.header('X-Org-Id')?.trim();
  const membership = await prisma.membership.findFirst({
    where: {
      userId: req.auth.userId,
      ...(requestedOrgId ? { organizationId: requestedOrgId } : {})
    },
    orderBy: { createdAt: 'asc' }
  });
  if (!membership) {
    throw new HttpError(403, 'ORG_ACCESS_DENIED', 'User does not belong to this organization');
  }
  req.auth.orgId = membership.organizationId;
  req.auth.role = (membership.role as Role) ?? 'VIEWER';
};

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const apiKeyHeader = req.header('X-Api-Key') ?? req.header('x-api-key');
    if (apiKeyHeader) {
      await authenticateApiKey(req, apiKeyHeader.trim());
    } else {
      authenticateUserToken(req);
    }

    if (req.auth?.actorType === 'user') {
      await attachUserOrganization(req);
    }

    if (req.auth?.actorType === 'service') {
      if (!req.auth.orgId && req.auth.serviceAccountId) {
        const account = await prisma.serviceAccount.findUnique({
          where: { id: req.auth.serviceAccountId }
        });
        if (!account) {
          throw new HttpError(401, 'UNAUTHORIZED', 'Service account not found');
        }
        req.auth.orgId = account.organizationId;
      }
      req.auth.role = req.auth.role ?? 'ADMIN';
    }

    if (!req.auth?.orgId) {
      throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
    }
    updateRequestContext({
      orgId: req.auth.orgId,
      userId: req.auth.userId ?? req.auth.serviceAccountId ?? undefined
    });

    next();
  } catch (error) {
    next(error);
  }
};
