import type { Response } from 'express';
import { context as otelContext, trace } from '@opentelemetry/api';
import type { ArtifactRecord } from './tasks/models.js';
import { isWorkerChild, emitToMaster } from './worker/ipc.js';

export type TaskStreamPayload = {
  id: string;
  progress: number;
  status: string;
  eta?: string;
  phase?: string;
  step?: string;
  metrics?: Record<string, unknown>;
  files?: ArtifactRecord[];
  type?: string;
  meta?: {
    traceId?: string;
    [key: string]: unknown;
  };
};

type StreamEntry = {
  clients: Map<Response, NodeJS.Timeout>;
  latest?: TaskStreamPayload;
};

const HEARTBEAT_MS = 15000;
const streams = new Map<string, StreamEntry>();

const ensureEntry = (taskId: string) => {
  const existing = streams.get(taskId);
  if (existing) return existing;
  const created: StreamEntry = { clients: new Map<Response, NodeJS.Timeout>() };
  streams.set(taskId, created);
  return created;
};

const startHeartbeat = (taskId: string, res: Response) => {
  const timer = setInterval(() => {
    try {
      res.write('event: ping\ndata: {}\n\n');
    } catch {
      clearInterval(timer);
      sseRemove(taskId, res);
    }
  }, HEARTBEAT_MS);
  return timer;
};

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

const attachTraceMeta = (payload: TaskStreamPayload | Record<string, unknown>) => {
  const span = trace.getSpan(otelContext.active());
  const traceId = span?.spanContext().traceId;
  if (traceId) {
    if ('meta' in payload) {
      const meta = (payload as TaskStreamPayload).meta ?? {};
      (payload as TaskStreamPayload).meta = { ...meta, traceId };
    } else {
      (payload as Record<string, unknown>).meta = { traceId };
    }
  }
  return payload;
};

export const sseAdd = (taskId: string, res: Response, initial?: TaskStreamPayload) => {
  const entry = ensureEntry(taskId);
  if (entry.clients.has(res)) {
    clearClient(taskId, res);
  }
  const heartbeat = startHeartbeat(taskId, res);
  entry.clients.set(res, heartbeat);
  if (initial) {
    const payload = attachTraceMeta({ ...initial, meta: initial.meta ? { ...initial.meta } : undefined }) as TaskStreamPayload;
    entry.latest = payload;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } else {
    res.write(': connected\n\n');
  }
};

export const sseRemove = (taskId: string, res: Response) => {
  clearClient(taskId, res);
};

export const ssePush = (taskId: string, payload: TaskStreamPayload) => {
  if (isWorkerChild()) {
    emitToMaster({ type: 'sse:push', taskId, payload });
    return;
  }
  const entry = ensureEntry(taskId);
  const enriched = attachTraceMeta({
    ...payload,
    meta: payload.meta ? { ...payload.meta } : undefined
  }) as TaskStreamPayload;
  entry.latest = enriched;
  const frame = `data: ${JSON.stringify(enriched)}\n\n`;
  entry.clients.forEach((_timer, res) => {
    try {
      res.write(frame);
    } catch {
      sseRemove(taskId, res);
    }
  });
};

export const sseCloseAll = (taskId: string) => {
  if (isWorkerChild()) {
    emitToMaster({ type: 'sse:close', taskId });
    return;
  }
  const entry = streams.get(taskId);
  if (!entry) return;
  entry.clients.forEach((timer, res) => {
    clearInterval(timer);
    try {
      res.write('event: close\ndata: {}\n\n');
      res.end();
    } catch {
      /* ignore */
    }
  });
  streams.delete(taskId);
};

export const sseBroadcast = (payload: Record<string, unknown>) => {
  if (isWorkerChild()) {
    emitToMaster({ type: 'sse:emit', taskId: '*', event: 'broadcast', payload });
    return;
  }
  const enriched = attachTraceMeta({ ...payload });
  const frame = `event: broadcast\ndata: ${JSON.stringify(enriched)}\n\n`;
  streams.forEach((entry, taskId) => {
    entry.clients.forEach((_timer, res) => {
      try {
        res.write(frame);
      } catch {
        sseRemove(taskId, res);
      }
    });
  });
};

export const sseEmit = (taskId: string, eventName: string, payload: Record<string, unknown>) => {
  if (isWorkerChild()) {
    emitToMaster({ type: 'sse:emit', taskId, event: eventName, payload });
    return;
  }
  const entry = streams.get(taskId);
  if (!entry) return;
  const enriched = attachTraceMeta({ ...payload });
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(enriched)}\n\n`;
  entry.clients.forEach((_timer, res) => {
    try {
      res.write(frame);
    } catch {
      sseRemove(taskId, res);
    }
  });
};
