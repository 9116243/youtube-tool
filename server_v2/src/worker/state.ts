type ForkInfo = {
  pid: number;
  heartbeat: number;
};

let inlineHeartbeat = 0;
const forkWorkers = new Map<number, ForkInfo>();

export const recordInlineHeartbeat = () => {
  inlineHeartbeat = Date.now();
};

export const registerForkWorker = (slot: number, pid: number | undefined) => {
  forkWorkers.set(slot, { pid: pid ?? 0, heartbeat: Date.now() });
};

export const unregisterForkWorker = (slot: number) => {
  forkWorkers.delete(slot);
};

export const recordForkHeartbeat = (slot: number) => {
  const existing = forkWorkers.get(slot);
  if (existing) {
    existing.heartbeat = Date.now();
  }
};

export const getWorkerHealth = () => ({
  inlineHeartbeat,
  forkWorkers: Array.from(forkWorkers.entries()).map(([slot, info]) => ({
    slot,
    pid: info.pid,
    heartbeat: info.heartbeat
  }))
});
