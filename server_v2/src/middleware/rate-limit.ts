import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import requestIp from 'request-ip';
import { env } from '../utils/env.js';
import { HttpError } from '../utils/http-error.js';

const resolveClientIp = (req: Request): string => {
  const detected = requestIp.getClientIp(req);
  if (detected) {
    return detected;
  }
  const forwarded = req.header('x-forwarded-for');
  if (forwarded) {
    const via = forwarded.split(',')[0]?.trim();
    return via || req.ip || req.socket.remoteAddress || 'unknown';
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

const buildKey = (req: Request) => {
  if (req.auth?.orgId) {
    return `org:${req.auth.orgId}`;
  }
  if (req.auth?.userId) {
    return `user:${req.auth.userId}`;
  }
  return `ip:${ipKeyGenerator(resolveClientIp(req))}`;
};

export const protectedLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW * 1000,
  max: env.RATE_LIMIT_PER_ORG,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request, _res: Response) => buildKey(req),
  handler: (_req, _res, next) => {
    next(new HttpError(429, 'ERR_RATE_LIMIT', 'Rate limit exceeded'));
  }
});
