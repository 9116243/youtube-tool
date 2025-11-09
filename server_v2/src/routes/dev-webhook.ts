import { Router } from 'express';
import { env } from '../utils/env.js';

const router = Router();

router.post('/dev/webhook', (req, res) => {
  if (!env.DEV_TOOLS) {
    res.sendStatus(404);
    return;
  }
  const payload = req.body ?? {};
  res.json({
    status: 'ok',
    received: payload,
    env: {
      DEV_TOOLS: env.DEV_TOOLS,
      SELFTEST_API_KEY: Boolean(env.SELFTEST_API_KEY)
    }
  });
});

export const devWebhookRouter = router;
