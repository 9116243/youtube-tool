/* eslint-disable node/no-process-env */
export type WorkerMessage =
  | { type: 'metrics'; metric: string; method: 'inc' | 'observe' | 'set'; value: number }
  | { type: 'sse:push'; taskId: string; payload: unknown }
  | { type: 'sse:emit'; taskId: string; event: string; payload: unknown }
  | { type: 'sse:close'; taskId: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; meta?: Record<string, unknown> }
  | { type: 'heartbeat'; slot?: number };

export const isWorkerChild = () => process.env.WORKER_CHILD === '1';

export const emitToMaster = (message: WorkerMessage) => {
  if (!isWorkerChild()) return;
  if (typeof process.send === 'function') {
    process.send(message);
  }
};
