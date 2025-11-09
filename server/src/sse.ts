import type { Response } from 'express';

export interface TaskStreamPayload {
  id: string;
  progress: number;
  status?: string;
  eta?: string;
  phase?: string;
  step?: string;
  message?: string;
  metrics?: Record<string, unknown>;
  files?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

type StreamEntry = {
  clients: Map<Response, ReturnType<typeof setInterval>>;
  latest?: TaskStreamPayload;
};

const HEARTBEAT_MS = 15000;
const streams = new Map<string, StreamEntry>();

const ensureEntry = (taskId: string): StreamEntry => {
  const existing = streams.get(taskId);
  if (existing) {
    return existing;
  }
  const entry: StreamEntry = { clients: new Map() };
  streams.set(taskId, entry);
  return entry;
};

const startHeartbeat = (taskId: string, res: Response) =>
  setInterval(() => {
    try {
      res.write('event: heartbeat\ndata: {"type":"heartbeat"}\n\n');
    } catch {
      sseRemove(taskId, res);
    }
  }, HEARTBEAT_MS);

const clearClient = (taskId: string, res: Response) => {
  const entry = streams.get(taskId);
  if (!entry) return;
  const timer = entry.clients.get(res);
  if (timer) {
    clearInterval(timer);
  }
  entry.clients.delete(res);
  if (entry.clients.size === 0) {
    streams.delete(taskId);
  }
};

const sendFrame = (res: Response, frame: string, taskId: string) => {
  try {
    res.write(frame);
  } catch {
    sseRemove(taskId, res);
  }
};

export const sseAdd = (taskId: string, res: Response, initial?: TaskStreamPayload) => {
  const entry = ensureEntry(taskId);
  if (entry.clients.has(res)) {
    clearClient(taskId, res);
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  entry.clients.set(res, startHeartbeat(taskId, res));
  if (initial) {
    entry.latest = initial;
    const frame = `data: ${JSON.stringify(initial)}\n\n`;
    sendFrame(res, frame, taskId);
  } else {
    sendFrame(res, ': connected\n\n', taskId);
  }
};

export const sseRemove = (taskId: string, res: Response) => {
  clearClient(taskId, res);
};

export const ssePush = (taskId: string, payload: TaskStreamPayload) => {
  const entry = streams.get(taskId);
  if (!entry) return;
  entry.latest = payload;
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  entry.clients.forEach((_, client) => sendFrame(client, frame, taskId));
};
