import { Router } from 'express';
import { register } from '../metrics';

export const metricsRouter = Router();

metricsRouter.get('/metrics', async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  } catch (error) {
    next(error);
  }
});
