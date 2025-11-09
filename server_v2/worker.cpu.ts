import { Worker } from '@temporalio/worker';
import path from 'node:path';
import { env } from './src/utils/env.js';
import { cpuActivities } from './src/orchestration/temporal/activities/index.js';

const workflowsPath = path.resolve(process.cwd(), 'src', 'workflows', 'pipeline.workflow.ts');

const run = async () => {
  const worker = await Worker.create({
    workflowsPath,
    activities: cpuActivities,
    taskQueue: env.TEMPORAL_TASK_QUEUE_CPU
  });

  const shutdownWorker = () => {
    try {
      worker.shutdown();
    } catch (error) {
      console.error('CPU worker shutdown failed', error);
    }
  };

  process.once('SIGINT', shutdownWorker);
  process.once('SIGTERM', shutdownWorker);

  await worker.run();
};

run().catch((error) => {
  console.error('CPU worker failed', error);
  process.exit(1);
});
