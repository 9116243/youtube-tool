import { Router } from 'express';
import { register } from '../metrics/index.js';

export const metricsRouter = Router();

metricsRouter.get('/metrics', async (_req, res, next) => {
  try {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  } catch (error) {
    next(error);
  }
});
