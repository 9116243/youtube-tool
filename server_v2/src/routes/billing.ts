import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { getUsageSnapshot } from '../services/usage.js';
import { HttpError } from '../utils/http-error.js';

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

router.get(
  '/billing/usage',
  requireAuth,
  requirePermission('billing', 'read'),
  asyncHandler(async (req, res) => {
    const orgId = req.auth?.orgId;
    if (!orgId) {
      throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
    }
    const snapshot = await getUsageSnapshot(orgId);
    res.json(snapshot);
  })
);

export const billingRouter = router;
