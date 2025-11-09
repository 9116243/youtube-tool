import { metrics } from '../metrics/index.js';
import { isWorkerChild, emitToMaster } from './ipc.js';

type MetricMethod = 'inc' | 'observe' | 'set';

export const recordMetric = (
  metric: keyof typeof metrics,
  method: MetricMethod,
  value: number
) => {
  if (isWorkerChild()) {
    emitToMaster({
      type: 'metrics',
      metric,
      method,
      value
    });
    return;
  }
  const target = metrics[metric];
  if (!target) return;
  if (method === 'inc' && 'inc' in target && typeof target.inc === 'function') {
    target.inc(value);
  } else if (method === 'observe' && 'observe' in target && typeof target.observe === 'function') {
    target.observe(value);
  } else if (method === 'set' && 'set' in target && typeof target.set === 'function') {
    target.set(value);
  }
};
