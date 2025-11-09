import cors from 'cors';
import express from 'express';
import type { Server } from 'node:http';
import { buildRouter } from './router';
import { errorHandler } from './middleware/error';
import { appEnv } from './utils/env';
import { logger } from './utils/logger';
import { connectPrisma, disconnectPrisma } from './db/prisma';
import { startRunner } from './runner';

export const createServer = () => {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: appEnv.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json());

  app.use(buildRouter());

  app.use(errorHandler);

  return app;
};

export const startServer = async (): Promise<Server> => {
  await connectPrisma();
  const app = createServer();

  const server = app.listen(appEnv.PORT, () => {
    logger.info('Server listening on http://localhost:%d', appEnv.PORT);
    startRunner().catch((error) => {
      logger.error('Failed to start worker runner', error);
    });
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info('Received %s signal, shutting down gracefully', signal);
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
};

if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Failed to start server', error);
    process.exit(1);
  });
}
