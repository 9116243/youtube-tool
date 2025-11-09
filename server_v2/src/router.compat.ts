import { Router } from 'express';
import { buildV1Router } from './router.v1.js';

const SUNSET_DATE = process.env.COMPAT_SUNSET || 'Tue, 31 Dec 2025 23:59:59 GMT';

export const buildCompatRouter = () => {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', SUNSET_DATE);
    next();
  });
  router.use(buildV1Router());
  return router;
};
