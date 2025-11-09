import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import { env } from '../utils/env.js';
import { HttpError } from '../utils/http-error.js';

const router = Router();

const authSchema = z
  .object({
    email: z.string().email().min(1),
    password: z.string().min(8)
  })
  .strict();

const jwtOptions: SignOptions = { expiresIn: env.JWT_EXPIRES as SignOptions['expiresIn'] };

const issueToken = (user: { id: string; email: string }) =>
  jwt.sign({ sub: user.id, email: user.email }, env.JWT_SECRET, jwtOptions);

const listOrganizations = async (userId: string) => {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: 'asc' }
  });
  return memberships.map((membership) => ({
    membershipId: membership.id,
    organizationId: membership.organizationId,
    name: membership.organization.name,
    role: membership.role
  }));
};

const ensureDefaultOrganization = async (userId: string) => {
  const existing = await prisma.membership.findFirst({ where: { userId } });
  if (existing) {
    return;
  }
  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: env.ORG_DEFAULT_NAME
      }
    });
    await tx.membership.create({
      data: {
        organizationId: organization.id,
        userId,
        role: 'OWNER'
      }
    });
  });
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

router.post(
  '/auth/register',
  asyncHandler(async (req, res) => {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_AUTH_PAYLOAD', 'Invalid register payload', parsed.error.flatten());
    }
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) {
      throw new HttpError(409, 'USER_EXISTS', 'Email already registered');
    }
    const hash = await bcrypt.hash(parsed.data.password, 10);
    const { user } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: parsed.data.email,
          passwordHash: hash
        }
      });
      const organization = await tx.organization.create({
        data: {
          name: env.ORG_DEFAULT_NAME
        }
      });
      await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: createdUser.id,
          role: 'OWNER'
        }
      });
      return { user: createdUser };
    });
    const token = issueToken(user);
    const organizations = await listOrganizations(user.id);
    res.status(201).json({ token, user: { id: user.id, email: user.email }, organizations });
  })
);

router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_AUTH_PAYLOAD', 'Invalid login payload', parsed.error.flatten());
    }
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }
    const match = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!match) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }
    await ensureDefaultOrganization(user.id);
    const token = issueToken(user);
    const organizations = await listOrganizations(user.id);
    res.json({ token, user: { id: user.id, email: user.email }, organizations });
  })
);

export const authRouter = router;
