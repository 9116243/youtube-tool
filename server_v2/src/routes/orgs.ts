import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { HttpError } from '../utils/http-error.js';
import { recordAuditLog } from '../services/audit.js';

const router = Router();

const roleSchema = z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']);

const createOrgSchema = z
  .object({
    name: z.string().min(2).max(120),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/i, 'Slug must be alphanumeric with optional dashes')
      .max(120)
      .optional()
  })
  .strict();

const updateOrgSchema = createOrgSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required'
});

const memberCreateSchema = z
  .object({
    userId: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: roleSchema.default('VIEWER')
  })
  .refine((value) => Boolean(value.userId || value.email), {
    message: 'Provide userId or email',
    path: ['userId']
  });

const memberUpdateSchema = z.object({
  role: roleSchema
});

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

const ensureOrgMatch = (req: Request, orgId: string) => {
  const activeOrg = ensureOrgContext(req);
  if (activeOrg !== orgId) {
    throw new HttpError(403, 'ORG_SWITCH_REQUIRED', 'Switch organization via X-Org-Id before performing this action');
  }
  return activeOrg;
};

const ensureUserActor = (req: Request) => {
  if (req.auth?.actorType !== 'user' || !req.auth.userId) {
    throw new HttpError(403, 'USER_AUTH_REQUIRED', 'User authentication required for this action');
  }
  return req.auth.userId;
};

const membershipSelection = {
  include: { organization: true, user: true },
  orderBy: { createdAt: 'asc' as const }
};

const ensureOwnerWillRemain = async (orgId: string, membershipId: string) => {
  const remainingOwners = await prisma.membership.count({
    where: {
      organizationId: orgId,
      role: 'OWNER',
      NOT: { id: membershipId }
    }
  });
  if (remainingOwners === 0) {
    throw new HttpError(400, 'OWNER_REQUIRED', 'Organization must keep at least one owner');
  }
};

router.get(
  '/orgs',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.auth?.actorType === 'service') {
      const orgId = ensureOrgContext(req);
      const organization = await prisma.organization.findUnique({ where: { id: orgId } });
      res.json({
        organizations: organization
          ? [
              {
                organizationId: organization.id,
                name: organization.name,
                role: 'ADMIN'
              }
            ]
          : []
      });
      return;
    }
    const userId = ensureUserActor(req);
    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' }
    });
    res.json({
      organizations: memberships.map((membership) => ({
        membershipId: membership.id,
        organizationId: membership.organizationId,
        name: membership.organization.name,
        role: membership.role
      }))
    });
  })
);

router.post(
  '/orgs',
  requireAuth,
  requirePermission('orgs', 'write'),
  asyncHandler(async (req, res) => {
    const userId = ensureUserActor(req);
    const parsed = createOrgSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_ORG_PAYLOAD', 'Invalid organization payload', parsed.error.flatten());
    }
    const organization = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: parsed.data.name,
          slug: parsed.data.slug
        }
      });
      await tx.membership.create({
        data: {
          organizationId: created.id,
          userId,
          role: 'OWNER'
        }
      });
      return created;
    });
    await recordAuditLog({
      orgId: organization.id,
      action: 'org.created',
      target: organization.id,
      payload: { name: organization.name },
      req,
      actorUserId: userId
    });
    res.status(201).json(organization);
  })
);

router.get(
  '/orgs/:orgId',
  requireAuth,
  requirePermission('orgs', 'read'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgMatch(req, req.params.orgId);
    const organization = await prisma.organization.findUnique({
      where: { id: orgId }
    });
    if (!organization) {
      throw new HttpError(404, 'ORG_NOT_FOUND', 'Organization not found');
    }
    res.json(organization);
  })
);

router.patch(
  '/orgs/:orgId',
  requireAuth,
  requirePermission('orgs', 'write'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgMatch(req, req.params.orgId);
    ensureUserActor(req);
    const parsed = updateOrgSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_ORG_PAYLOAD', 'Invalid organization payload', parsed.error.flatten());
    }
    const organization = await prisma.organization.update({
      where: { id: orgId },
      data: parsed.data
    });
    await recordAuditLog({
      orgId,
      action: 'org.updated',
      target: orgId,
      payload: parsed.data,
      req,
      actorUserId: req.auth?.userId ?? null,
      actorServiceAccountId: req.auth?.serviceAccountId ?? null
    });
    res.json(organization);
  })
);

router.delete(
  '/orgs/:orgId',
  requireAuth,
  requirePermission('orgs', 'admin'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgMatch(req, req.params.orgId);
    ensureUserActor(req);
    if (req.auth?.role !== 'OWNER') {
      throw new HttpError(403, 'OWNER_REQUIRED', 'Only owners can delete organizations');
    }
    const [taskCount, uploadCount, publishCount, auditCount] = await prisma.$transaction([
      prisma.task.count({ where: { organizationId: orgId } }),
      prisma.upload.count({ where: { organizationId: orgId } }),
      prisma.publishSchedule.count({ where: { organizationId: orgId } }),
      prisma.auditLog.count({ where: { organizationId: orgId } })
    ]);
    if (taskCount || uploadCount || publishCount || auditCount) {
      throw new HttpError(
        409,
        'ORG_NOT_EMPTY',
        'Organization still contains resources or audit logs; archive data before deleting'
      );
    }
    await prisma.$transaction([
      prisma.apiKey.deleteMany({ where: { serviceAccount: { organizationId: orgId } } }),
      prisma.serviceAccount.deleteMany({ where: { organizationId: orgId } }),
      prisma.tenantScope.deleteMany({ where: { organizationId: orgId } }),
      prisma.membership.deleteMany({ where: { organizationId: orgId } }),
      prisma.organization.delete({ where: { id: orgId } })
    ]);
    res.status(204).send();
  })
);

router.get(
  '/orgs/:orgId/members',
  requireAuth,
  requirePermission('orgs', 'read'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgMatch(req, req.params.orgId);
    const members = await prisma.membership.findMany({
      where: { organizationId: orgId },
      ...membershipSelection
    });
    res.json({
      members: members.map((membership) => ({
        membershipId: membership.id,
        organizationId: membership.organizationId,
        role: membership.role,
        user: membership.user
          ? {
              id: membership.user.id,
              email: membership.user.email
            }
          : null
      }))
    });
  })
);

router.post(
  '/orgs/:orgId/members',
  requireAuth,
  requirePermission('orgs', 'admin'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgMatch(req, req.params.orgId);
    const actorUserId = ensureUserActor(req);
    const parsed = memberCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_MEMBER_PAYLOAD', 'Invalid member payload', parsed.error.flatten());
    }
    const targetUser =
      parsed.data.userId
        ? await prisma.user.findUnique({ where: { id: parsed.data.userId } })
        : await prisma.user.findUnique({ where: { email: parsed.data.email! } });
    if (!targetUser) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
    }
    const existing = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: targetUser.id
        }
      }
    });
    if (existing) {
      throw new HttpError(409, 'MEMBER_EXISTS', 'User already belongs to this organization');
    }
    const membership = await prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: targetUser.id,
        role: parsed.data.role
      }
    });
    await recordAuditLog({
      orgId,
      action: 'org.member_added',
      target: membership.id,
      payload: { userId: targetUser.id, role: membership.role },
      req,
      actorUserId
    });
    res.status(201).json(membership);
  })
);

router.patch(
  '/orgs/:orgId/members/:memberId',
  requireAuth,
  requirePermission('orgs', 'admin'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgMatch(req, req.params.orgId);
    const actorUserId = ensureUserActor(req);
    const parsed = memberUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_MEMBER_PAYLOAD', 'Invalid member payload', parsed.error.flatten());
    }
    const membership = await prisma.membership.findFirst({
      where: { id: req.params.memberId, organizationId: orgId }
    });
    if (!membership) {
      throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    }
    if (membership.role === 'OWNER' && parsed.data.role !== 'OWNER') {
      await ensureOwnerWillRemain(orgId, membership.id);
    }
    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: { role: parsed.data.role }
    });
    await recordAuditLog({
      orgId,
      action: 'org.member_role_changed',
      target: membership.id,
      payload: { from: membership.role, to: parsed.data.role },
      req,
      actorUserId
    });
    res.json(updated);
  })
);

router.delete(
  '/orgs/:orgId/members/:memberId',
  requireAuth,
  requirePermission('orgs', 'admin'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgMatch(req, req.params.orgId);
    const actorUserId = ensureUserActor(req);
    const membership = await prisma.membership.findFirst({
      where: { id: req.params.memberId, organizationId: orgId }
    });
    if (!membership) {
      throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    }
    if (membership.role === 'OWNER') {
      await ensureOwnerWillRemain(orgId, membership.id);
    }
    await prisma.membership.delete({ where: { id: membership.id } });
    await recordAuditLog({
      orgId,
      action: 'org.member_removed',
      target: membership.id,
      payload: { userId: membership.userId },
      req,
      actorUserId
    });
    res.status(204).send();
  })
);

export const orgsRouter = router;
