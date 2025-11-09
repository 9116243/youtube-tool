import { fork, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from 'cors';
import express from 'express';
import type { Express, RequestHandler } from 'express';
import { env } from './utils/env.js';
import { buildV1Router } from './router.v1.js';
import { buildCompatRouter } from './router.compat.js';
import { errorHandler } from './middleware/error.js';
import { runnerLoop, stopRunner } from './tasks/runner.js';
import { logger } from './utils/logger.js';
import { startScheduler } from './worker/scheduler.js';
import { startLifecycleCron } from './cron/lifecycle.js';
import { initializeQueue } from './queue/index.js';
import { requestContextMiddleware } from './middleware/request-id.js';
import { shutdownOtel, startOtel } from './observability/otel.js';
import { startPublisherWorker } from './worker/publisher.js';
import { startAlertWorker } from './worker/alerts.js';
import { startCostRollupCron } from './cron/cost-rollup.js';
import type { WorkerMessage } from './worker/ipc.js';
import { metrics } from './metrics/index.js';
import { sseBroadcast, sseCloseAll, sseEmit, ssePush } from './sse.js';
import { shutdownGuard } from './middleware/shutdown.js';
import { isDraining, setDraining } from './state/shutdown.js';
import { registerForkWorker, unregisterForkWorker, recordForkHeartbeat } from './worker/state.js';

type WorkerHandle = {
  slot: number;
  child: ChildProcess;
  restarts: number;
  shuttingDown: boolean;
  restartTimer?: NodeJS.Timeout;
};

const managedWorkers = new Map<number, WorkerHandle>();
const MAX_WORKER_RESTARTS = 5;
const WORKER_BACKOFF_BASE_MS = 1_000;
const WORKER_SHUTDOWN_TIMEOUT_MS = 5_000;
let workerPoolActive = false;
const SHUTDOWN_TIMEOUT_MS = 15_000;

const ensureTsExecArgs = (argv: string[]) => {
  const hasTsLoader =
    argv.some((arg) => arg.includes('tsx')) ||
    argv.some((arg, index) => arg === '--loader' && argv[index + 1]?.includes('tsx/esm'));
  if (hasTsLoader) {
    return [...argv];
  }
  return [...argv, '--loader', 'tsx/esm'];
};

const resolveWorkerEntrypoint = () => {
  const runningFromDist = import.meta.url.includes('/dist/') || import.meta.url.includes('\\dist\\');
  const distEntry = resolve(process.cwd(), 'dist/worker/child.js');
  if (runningFromDist && existsSync(distEntry)) {
    return { entry: distEntry, execArgv: [...process.execArgv] };
  }
  const srcEntry = resolve(process.cwd(), 'src/worker/child.ts');
  return { entry: srcEntry, execArgv: ensureTsExecArgs([...process.execArgv]) };
};

const applyMetricUpdate = (metricName: string, method: 'inc' | 'observe' | 'set', value: number) => {
  const metric = metrics[metricName as keyof typeof metrics];
  if (!metric) return;
  type MetricFnHolder = {
    inc?: (n: number) => void;
    observe?: (n: number) => void;
    set?: (n: number) => void;
  };
  const target = metric as MetricFnHolder;
  const fn = target[method];
  if (typeof fn === 'function') {
    fn.call(metric, value);
  }
};

const handleWorkerMessage = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return;
  const message = raw as WorkerMessage;
  switch (message.type) {
    case 'metrics':
      applyMetricUpdate(message.metric, message.method, message.value);
      break;
    case 'sse:push':
      ssePush(message.taskId, message.payload as any);
      break;
    case 'sse:emit':
      if (message.taskId === '*' && message.event === 'broadcast') {
        sseBroadcast((message.payload ?? {}) as Record<string, unknown>);
      } else if (message.taskId === '*') {
        sseBroadcast((message.payload ?? {}) as Record<string, unknown>);
      } else {
        sseEmit(message.taskId, message.event, (message.payload ?? {}) as Record<string, unknown>);
      }
      break;
    case 'sse:close':
      sseCloseAll(message.taskId);
      break;
    case 'log':
      logger[message.level](message.meta ?? {}, message.message);
      break;
    case 'heartbeat':
      if (typeof message.slot === 'number') {
        recordForkHeartbeat(message.slot);
      }
      break;
    default:
      logger.warn({ message }, 'Received unknown worker message');
  }
};

const spawnWorker = (slot: number, restarts = 0) => {
  const { entry, execArgv } = resolveWorkerEntrypoint();
  const child = fork(entry, [], {
    env: {
      ...process.env,
      WORKER_CHILD: '1',
      WORKER_SLOT: String(slot)
    },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    execArgv
  });
  const handle: WorkerHandle = { slot, child, restarts, shuttingDown: false };
  managedWorkers.set(slot, handle);
  logger.info({ slot, pid: child.pid }, 'Spawned worker');
  registerForkWorker(slot, child.pid ?? undefined);
  child.on('message', (message: WorkerMessage) => handleWorkerMessage(message));
  child.on('exit', (code, signal) => {
    logger.warn({ slot, code, signal }, 'Worker exited');
    unregisterForkWorker(slot);
    managedWorkers.delete(slot);
    if (handle.restartTimer) {
      clearTimeout(handle.restartTimer);
      handle.restartTimer = undefined;
    }
    if (handle.shuttingDown) {
      return;
    }
    if (restarts >= MAX_WORKER_RESTARTS) {
      logger.error({ slot }, 'Worker restart limit reached; not respawning');
      return;
    }
    const delay = Math.min(30_000, WORKER_BACKOFF_BASE_MS * 2 ** restarts);
    handle.restartTimer = setTimeout(() => spawnWorker(slot, restarts + 1), delay);
  });
  child.on('error', (error) => {
    logger.error({ err: error, slot }, 'Worker process error');
  });
};

const startWorkerPool = () => {
  if (workerPoolActive) return;
  workerPoolActive = true;
  for (let slot = 0; slot < env.QUEUE_CONCURRENCY; slot += 1) {
    spawnWorker(slot);
  }
};

const stopWorkerPool = async () => {
  if (!workerPoolActive) return;
  workerPoolActive = false;
  const handles = [...managedWorkers.values()];
  managedWorkers.clear();
  await Promise.all(
    handles.map(
      (handle) =>
        new Promise<void>((resolveWorker) => {
          handle.shuttingDown = true;
          if (handle.restartTimer) {
            clearTimeout(handle.restartTimer);
            handle.restartTimer = undefined;
          }
          const timeout = setTimeout(() => {
            handle.child.kill('SIGKILL');
          }, WORKER_SHUTDOWN_TIMEOUT_MS);
          handle.child.once('exit', () => {
            clearTimeout(timeout);
            resolveWorker();
          });
          handle.child.kill('SIGTERM');
        })
    )
  );
};

const app: Express = express();
app.set('trust proxy', env.TRUST_PROXY);

app.use(requestContextMiddleware);
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true
  }) as RequestHandler
);
app.use(express.json({ limit: '2mb' }));
app.use(shutdownGuard);

const v1Router = buildV1Router();
app.use('/v1', v1Router);
app.use(buildCompatRouter());
app.use(errorHandler);

let server: ReturnType<typeof app.listen> | null = null;

const bootstrap = async () => {
  await startOtel();
  await initializeQueue();
  server = app.listen(env.PORT, () => {
    logger.info(`API listening http://localhost:${env.PORT} (CORS=${env.CORS_ORIGIN}, CONCURRENCY=${env.CONCURRENCY})`);
  });
  if (env.WORKER_MODE === 'fork' && env.QUEUE_DRIVER === 'redis') {
    startWorkerPool();
  } else {
    if (env.WORKER_MODE === 'fork' && env.QUEUE_DRIVER !== 'redis') {
      logger.warn('WORKER_MODE=fork requires QUEUE_DRIVER=redis; falling back to inline mode');
    }
    runnerLoop();
  }
  startScheduler();
  startLifecycleCron();
  startCostRollupCron();
  startPublisherWorker();
  startAlertWorker();
};

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Failed to bootstrap services');
  process.exit(1);
});

const shutdown = async (signal?: NodeJS.Signals) => {
  if (isDraining()) return;
  setDraining();
  logger.info({ signal }, 'shutting down server');
  const forceExit = setTimeout(() => {
    logger.error('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
    });
  }

  if (workerPoolActive) {
    await stopWorkerPool();
  } else {
    await stopRunner(WORKER_SHUTDOWN_TIMEOUT_MS);
  }

  await shutdownOtel();
  clearTimeout(forceExit);
  process.exit(0);
};

process.on('SIGINT', (signal) => {
  void shutdown(signal);
});
process.on('SIGTERM', (signal) => {
  void shutdown(signal);
});
