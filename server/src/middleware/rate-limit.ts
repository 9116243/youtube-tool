import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { appEnv } from '../utils/env';

export const protectedLimiter = rateLimit({
  windowMs: appEnv.RATE_LIMIT_WINDOW * 1000,
  max: appEnv.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    return req.ip ?? 'unknown';
  },
});
