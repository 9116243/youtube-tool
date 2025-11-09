import type { Task } from '@prisma/client';
import { prisma } from './db/prisma';
import { logger } from './utils/logger';
import { enqueueTask, dequeueTask } from './queue';
import { appEnv } from './utils/env';
import { orchestrateGenVideo } from './gen/orchestrator';
import { runGenEffect } from './gen/effects';
import { safeJsonParse } from './utils/json';
import { ssePush } from './sse';

const WORKER_CONCURRENCY = 2;
const POLL_DELAY_MS = 250;

let runnerStarted = false;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hydratePendingTasks = async () => {
  await prisma.task.updateMany({
    where: { status: 'RUNNING' },
    data: { status: 'QUEUED' },
  });
  const pending = await prisma.task.findMany({
    where: { status: 'QUEUED' },
    select: { id: true },
  });
  if (pending.length) {
    logger.info('Re-enqueuing %d pending tasks', pending.length);
    for (const item of pending) {
      await enqueueTask(item.id);
    }
  }
};

const pushSimulatedProgress = (taskId: string, progress: number, status: 'running' | 'success', step: string) => {
  ssePush(taskId, {
    id: taskId,
    progress,
    status,
    phase: 'SIM',
    step,
  });
};

const simulateWork = async (task: Task) => {
  await prisma.task.update({
    where: { id: task.id },
    data: { status: 'RUNNING', progress: 0 },
  });

  const steps = 5;
  for (let step = 1; step <= steps; step += 1) {
    await delay(400);
    const progress = Math.round((step / steps) * 100);
    await prisma.task.update({
      where: { id: task.id },
      data: { progress },
    });
    pushSimulatedProgress(task.id, progress, 'running', `step-${step}`);
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { status: 'SUCCESS', progress: 100 },
  });
  pushSimulatedProgress(task.id, 100, 'success', 'complete');
};

const handleTask = async (taskId: string) => {
  const record = await prisma.task.findUnique({ where: { id: taskId } });
  if (!record) {
    return;
  }
  const params = safeJsonParse<Record<string, unknown>>(record.params);
  const kind = typeof params.kind === 'string' ? params.kind : undefined;
  if (kind === 'gen_video') {
    await orchestrateGenVideo(record);
    return;
  }
  if (kind === 'gen_effect') {
    await runGenEffect(record);
    return;
  }
  await simulateWork(record);
};

const workerLoop = async () => {
  while (runnerStarted) {
    try {
      const taskId = await dequeueTask();
      await handleTask(taskId);
    } catch (error) {
      logger.error('Worker loop failed', error);
      await delay(POLL_DELAY_MS);
    }
  }
};

export const startRunner = async () => {
  if (runnerStarted) {
    return;
  }
  runnerStarted = true;
  await hydratePendingTasks();
  for (let idx = 0; idx < WORKER_CONCURRENCY; idx += 1) {
    void workerLoop();
  }
  if (appEnv.WORKER_MODE === 'fork') {
    logger.warn('WORKER_MODE=fork not implemented; running inline workers instead');
  } else {
    logger.info('Inline worker started with concurrency=%d', WORKER_CONCURRENCY);
  }
};
