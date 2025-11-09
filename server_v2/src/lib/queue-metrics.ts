import { updateQueueMetrics } from '../metrics/index.js';
import { getQueueCounts } from '../queue/index.js';
import { logger } from '../utils/logger.js';
import { isWorkerChild, emitToMaster } from '../worker/ipc.js';

export const refreshQueueMetrics = async () => {
  try {
    const counts = await getQueueCounts();
    if (isWorkerChild()) {
      emitToMaster({ type: 'metrics', metric: 'queueQueued', method: 'set', value: counts.queued });
      emitToMaster({ type: 'metrics', metric: 'queueRunning', method: 'set', value: counts.running });
    } else {
      updateQueueMetrics(counts);
    }
    return counts;
  } catch (error) {
    logger.warn({ err: error }, 'Failed to refresh queue metrics');
    return null;
  }
};
