import { Connection, WorkflowClient } from '@temporalio/client';
import { env } from '../../utils/env.js';
import { pipelineWorkflow } from '../../workflows/pipeline.workflow.js';
import type { TemporalPipelineInput } from './types.js';
import { HttpError } from '../../utils/http-error.js';
import { logger } from '../../utils/logger.js';

let connection: Connection | undefined;
try {
  connection = await Connection.connect({
    address: env.TEMPORAL_HOST
  });
} catch (error) {
  logger.warn({ err: error }, 'Temporal connection unavailable');
}

const client =
  connection &&
  new WorkflowClient({
    namespace: env.TEMPORAL_NAMESPACE,
    connection
  });

export const startTemporalPipeline = (input: TemporalPipelineInput) =>
  (
    client ??
    (() => {
      throw new HttpError(
        503,
        'TEMPORAL_UNAVAILABLE',
        'Temporal server is not reachable; cannot start pipeline'
      );
    })()
  ).start(pipelineWorkflow, {
    args: [input],
    workflowId: `temporal-pipeline-${input.taskId}`,
    taskQueue: env.TEMPORAL_WORKFLOW_TASK_QUEUE
  });
