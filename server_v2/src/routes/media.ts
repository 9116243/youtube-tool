import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { HttpError } from '../utils/http-error.js';
import { requireAuth } from '../middleware/auth.js';
import { protectedLimiter } from '../middleware/rate-limit.js';
import { ingestMedia } from '../media/ingest.js';
import { dedupMedia, recommendBroll, searchMedia } from '../media/search.js';

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
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

const router = Router();

router.post(
  '/media/ingest',
  requireAuth,
  protectedLimiter,
    asyncHandler(async (req: Request, res: Response) => {
    const orgId = ensureOrgContext(req);
    const { filePath, kind, metadata, license, subtitles } = req.body ?? {};
    if (!filePath || typeof filePath !== 'string') {
      throw new HttpError(400, 'INVALID_MEDIA_PAYLOAD', 'filePath is required');
    }
    const assetKind = kind === 'subtitle' ? 'subtitle' : kind === 'metadata' ? 'metadata' : 'video';
    const result = await ingestMedia({
      organizationId: orgId,
      filePath,
      kind: assetKind as 'video' | 'subtitle' | 'metadata',
      metadata: metadata ?? {},
      license,
      subtitles
    });
    res.json({ asset: result.asset, keyframes: result.keyframes });
  })
);

router.post(
  '/media/search',
  requireAuth,
  protectedLimiter,
    asyncHandler(async (req: Request, res: Response) => {
    const orgId = ensureOrgContext(req);
    const { query, topK } = req.body ?? {};
    if (!query || typeof query !== 'string') {
      throw new HttpError(400, 'INVALID_MEDIA_QUERY', 'query is required');
    }
    const results = await searchMedia({
      organizationId: orgId,
      query,
      topK: typeof topK === 'number' ? topK : undefined
    });
    res.json({ results });
  })
);

router.post(
  '/media/dedup',
  requireAuth,
  protectedLimiter,
    asyncHandler(async (req: Request, res: Response) => {
    const orgId = ensureOrgContext(req);
    const { threshold } = req.body ?? {};
    const clusters = await dedupMedia({
      organizationId: orgId,
      threshold: typeof threshold === 'number' ? threshold : undefined
    });
    res.json({ clusters });
  })
);

router.post(
  '/media/recommend-broll',
  requireAuth,
  protectedLimiter,
    asyncHandler(async (req: Request, res: Response) => {
    const orgId = ensureOrgContext(req);
    const { query, topK } = req.body ?? {};
    if (!query || typeof query !== 'string') {
      throw new HttpError(400, 'INVALID_MEDIA_QUERY', 'query is required');
    }
    const candidates = await recommendBroll({
      organizationId: orgId,
      query,
      topK: typeof topK === 'number' ? topK : undefined
    });
    res.json({ candidates });
  })
);

export const mediaRouter = router;
