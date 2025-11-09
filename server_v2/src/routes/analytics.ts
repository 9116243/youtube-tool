import { Router, type Request, type Response, type NextFunction } from 'express';
import type { ParsedQs } from 'qs';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { HttpError } from '../utils/http-error.js';
import {
  getCostSummary,
  getUnitEconomics,
  getSlaStatus
} from '../analytics/cost-service.js';

const router = Router();

type QueryValue = string | ParsedQs | (string | ParsedQs)[];

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const ensureOrg = (req: Request) => {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required for analytics');
  }
  return orgId;
};

const parseWindowHours = (value?: QueryValue) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  if (typeof raw !== 'string') return undefined;
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
};

router.use(requireAuth, requirePermission('tasks', 'read'));

router.get('/analytics/overview', asyncHandler(async (_req, res) => {
  res.json({
    hour1_views: 48210,
    clicks: 7600,
    interaction_score: 9.1,
    ctr: 0.043,
    notes: 'Cost / generation analytics live at /analytics/costs, /analytics/unit-economics, /analytics/sla.'
  });
}));

router.get(
  '/analytics/costs',
  asyncHandler(async (req, res) => {
    const orgId = ensureOrg(req);
    const windowHours = parseWindowHours(req.query.windowHours ?? req.query.window);
    const summary = await getCostSummary({ windowHours, organizationId: orgId });
    res.json({ data: summary });
  })
);

router.get(
  '/analytics/unit-economics',
  asyncHandler(async (req, res) => {
    const orgId = ensureOrg(req);
    const windowHours = parseWindowHours(req.query.windowHours ?? req.query.window);
    const economics = await getUnitEconomics({ windowHours, organizationId: orgId });
    res.json({ data: economics });
  })
);

router.get(
  '/analytics/sla',
  asyncHandler(async (req, res) => {
    const orgId = ensureOrg(req);
    const windowHours = parseWindowHours(req.query.windowHours ?? req.query.window);
    const sla = await getSlaStatus({ windowHours, organizationId: orgId });
    res.json({ data: sla });
  })
);

export const analyticsRouter = router;
