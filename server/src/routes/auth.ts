import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { HttpError } from '../utils/http-error';
import { appEnv } from '../utils/env';

const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
  })
  .strict();

const loginSchema = registerSchema;

const authRouter = Router();

authRouter.post('/auth/register', async (req, res, next) => {
  try {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      throw new HttpError(400, 'Invalid request body', 'VALIDATION_ERROR', result.error.flatten());
    }
    const payload = result.data;
    const normalizedEmail = payload.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new HttpError(409, 'Email already registered', 'EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
      },
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      throw new HttpError(400, 'Invalid request body', 'VALIDATION_ERROR', result.error.flatten());
    }
    const payload = result.data;
    const user = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });

    if (!user) {
      throw new HttpError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!valid) {
      throw new HttpError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const tokenPayload = {
      uid: user.id,
      email: user.email,
    };
    const tokenOptions: SignOptions = { expiresIn: appEnv.JWT_EXPIRES as SignOptions['expiresIn'] };
    const token = jwt.sign(tokenPayload, appEnv.JWT_SECRET, tokenOptions);

    res.json({ token });
  } catch (error) {
    next(error);
  }
});

export { authRouter };
