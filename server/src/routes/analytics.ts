import { Router } from 'express';

export const analyticsRouter = Router();

analyticsRouter.get('/analytics/overview', (_req, res) => {
  res.json({
    ok: true,
    tasks: {
      total: 128,
      running: 4,
      queued: 12,
      failed: 3,
      success: 109,
    },
    ab: {
      tests: 5,
      samples: 412,
    },
    publish: {
      scheduled: 8,
      completedThisWeek: 6,
    },
  });
});
