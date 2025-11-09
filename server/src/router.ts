import { Router } from 'express';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { pipelineRouter } from './routes/pipeline';
import { aiRouter } from './routes/ai';
import { abRouter } from './routes/ab';
import { publishRouter } from './routes/publish';
import { analyticsRouter } from './routes/analytics';
import { tasksRouter } from './routes/tasks';
import { uploadsRouter } from './routes/uploads';
import { sseRouter } from './routes/sse';
import { metricsRouter } from './routes/metrics';

export const buildRouter = () => {
  const router = Router();

  router.use(healthRouter);
  router.use(authRouter);
  router.use(pipelineRouter);
  router.use(tasksRouter);
  router.use(aiRouter);
  router.use(abRouter);
  router.use(publishRouter);
  router.use(uploadsRouter);
  router.use(analyticsRouter);
  router.use(sseRouter);
  router.use(metricsRouter);

  return router;
};
