import fetch from 'node-fetch';
import { logger } from '../../utils/logger.js';
import { env } from '../../utils/env.js';
import type { TaskStreamPayload } from '../../sse.js';

const EVENTS_URL = `http://localhost:${env.PORT ?? 3001}/v1/pipeline/temporal/events`;

export const emitSseUpdate = async (payload: TaskStreamPayload & { taskId: string }) => {
  try {
    await fetch(EVENTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-temporal-sse-secret': env.TEMPORAL_SSE_SECRET
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    logger.warn({ err: error, taskId: payload.taskId }, 'Temporal bridge failed to send SSE event');
  }
};
