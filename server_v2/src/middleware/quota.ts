import type { NextFunction, Request, Response } from 'express';
import { assertTaskQuota } from '../services/usage.js';
import { HttpError } from '../utils/http-error.js';

const requireOrgId = (req: Request) => {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
  }
  return orgId;
};

export const taskQuotaGuard =
  (estimate = 1) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const orgId = requireOrgId(req);
      await assertTaskQuota(orgId, estimate);
      next();
    } catch (error) {
      next(error);
    }
  };

export { assertRenderQuota, assertStorageQuota, recordTaskUsage, recordRenderUsage, refreshStorageUsage, getUsageSnapshot } from '../services/usage.js';
