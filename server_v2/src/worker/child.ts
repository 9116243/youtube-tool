import { initializeQueue } from '../queue/index.js';
import { runnerLoop } from '../tasks/runner.js';
import { logger } from '../utils/logger.js';
import { env } from '../utils/env.js';

process.env.WORKER_CHILD = '1';

const bootstrap = async () => {
  if (env.QUEUE_DRIVER === 'memory') {
    await initializeQueue();
  }
  runnerLoop();
  logger.info({ pid: process.pid, queueDriver: env.QUEUE_DRIVER }, 'Worker child started');
};

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Worker child failed to start');
  process.exit(1);
});

const shutdown = (signal: NodeJS.Signals) => {
  logger.info({ signal }, 'Worker child shutting down');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
