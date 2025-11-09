import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { HttpError } from '../utils/http-error.js';
import { env } from '../utils/env.js';
import { ensureTaskDir } from '../tasks/artifacts.js';
import { generatePerTitleLadder } from '../features/encode/perTitle.js';
import { getHdrMetadataForProfile } from '../features/color/hdr.js';
import { adjustSubtitleForSafeArea } from '../features/subtitles/safearea.js';
import { evaluateLipSync } from '../features/qc/lipsync.js';

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const requireDevTools = (req: Request, res: Response, next: NextFunction) => {
  if (!env.DEV_TOOLS) {
    throw new HttpError(404, 'NOT_FOUND', 'Endpoint not available');
  }
  next();
};

router.post(
  '/selftest',
  requireDevTools,
  asyncHandler(async (_req, res) => {
    const workspace = await ensureTaskDir('selftest');
    const ladder = await generatePerTitleLadder({
      taskId: 'selftest',
      workspace,
      resolution: '1080p',
      targetVmaf: env.PER_TITLE_VMAF_TARGET
    });
    const color = getHdrMetadataForProfile();
    const safeArea = adjustSubtitleForSafeArea('SELFTESTCDL', {
      width: 1920,
      height: 1080
    });
    const lipSync = evaluateLipSync(10);
    res.json({
      message: 'SELFTEST PASS',
      data: {
        ladder,
        color,
        safeArea,
        lipSync,
        externalFlows: Boolean(env.SELFTEST_ENABLE_EXTERNAL && env.SELFTEST_API_KEY)
      }
    });
  })
);

export const selftestRouter = router;
