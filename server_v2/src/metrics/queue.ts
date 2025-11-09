import { metrics } from './index.js';
import { recordMetric } from '../worker/metrics.js';

export const recordQueueEnqueued = (driver: string) => {
  metrics.queueEnqueued.labels(driver).inc();
};

export const recordQueueRetry = () => {
  recordMetric('queueRetry', 'inc', 1);
};

export const recordQueueFailed = () => {
  recordMetric('queueFailed', 'inc', 1);
};

export const recordQueueDeadletter = () => {
  recordMetric('queueDeadletter', 'inc', 1);
};

