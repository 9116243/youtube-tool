import { createHmac } from 'node:crypto';
import fetch from 'node-fetch';
import { env } from '../utils/env.js';
import { prisma } from '../db/prisma.js';
import type { Prisma } from '@prisma/client';
import { encrypt, decrypt } from '../services/crypto.js';
import { logger } from '../utils/logger.js';
import { metrics } from '../metrics/index.js';

const BASE_DELAY_MS = 500;
const TIMEOUT_MS = 10_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http/https webhook targets are supported');
    }
    return parsed.toString();
  } catch (error) {
    throw new Error('Invalid webhook URL');
  }
};

export const signPayload = (body: string, secret?: string | null) => {
  const key = secret && secret.length ? secret : env.KMS_SECRET;
  const hmac = createHmac('sha256', key);
  return `sha256=${hmac.update(body).digest('hex')}`;
};

type DeliveryRecord = {
  id: string;
  organizationId: string;
  taskId: string;
  targetUrl: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  secretCipher: string | null;
  payload: string;
};

const updateDelivery = (id: string, data: Prisma.WebhookDeliveryUpdateInput) =>
  prisma.webhookDelivery.update({ where: { id }, data });

const observeDuration = (durationMs: number) => {
  metrics.webhookDuration.observe(durationMs);
};

const incrementStatus = (status: 'success' | 'failed') => {
  metrics.webhookDeliveries.labels(status).inc();
};

const sendWithRetries = async (record: DeliveryRecord, payload: string, secret?: string | null) => {
  const maxAttempts = Math.max(1, record.maxAttempts || env.WEBHOOK_RETRY_MAX);
  const url = record.targetUrl;
  const signature = signPayload(payload, secret);
  let attempts = record.attempts ?? 0;
  let lastError: string | null = null;
  metrics.webhookInflight.inc();
  try {
    for (; attempts < maxAttempts; attempts += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const started = Date.now();
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-YTBPro-Signature': signature
          },
          body: payload,
          signal: controller.signal
        });
        const duration = Date.now() - started;
        observeDuration(duration);
        await updateDelivery(record.id, {
          attempts: attempts + 1,
          lastResponseCode: response.status,
          lastDurationMs: duration,
          lastError: response.ok ? null : `HTTP_${response.status}`,
          status: response.ok ? 'success' : 'retrying',
          completedAt: response.ok ? new Date() : null
        });
        if (response.ok) {
          incrementStatus('success');
          logger.info({ taskId: record.taskId, deliveryId: record.id }, 'Webhook delivered');
          return;
        }
        lastError = `HTTP_${response.status}`;
      } catch (error) {
        const duration = Date.now() - started;
        observeDuration(duration);
        lastError = (error as Error).message;
        await updateDelivery(record.id, {
          attempts: attempts + 1,
          lastDurationMs: duration,
          lastError,
          status: attempts + 1 >= maxAttempts ? 'failed' : 'retrying'
        });
      } finally {
        clearTimeout(timeout);
      }
      if (attempts + 1 < maxAttempts) {
        const backoff = BASE_DELAY_MS * 2 ** attempts;
        await delay(backoff);
      }
    }
    incrementStatus('failed');
    await updateDelivery(record.id, {
      status: 'failed',
      completedAt: new Date(),
      lastError: lastError ?? 'UNKNOWN_ERROR'
    });
    logger.warn({ taskId: record.taskId, deliveryId: record.id, error: lastError }, 'Webhook delivery failed');
  } finally {
    metrics.webhookInflight.dec();
  }
};

export const sendWebhookDelivery = async ({
  taskId,
  organizationId,
  url,
  secret,
  payload,
  retryOfId
}: {
  taskId: string;
  organizationId: string;
  url: string;
  secret?: string | null;
  payload: Record<string, unknown> | string;
  retryOfId?: string | null;
}) => {
  try {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const normalizedUrl = normalizeUrl(url);
    const record = await prisma.webhookDelivery.create({
      data: {
        taskId,
        organizationId,
        targetUrl: normalizedUrl,
        status: 'pending',
        attempts: 0,
        maxAttempts: env.WEBHOOK_RETRY_MAX,
        payload: serialized,
        signature: signPayload(serialized, secret),
        secretCipher: secret ? encrypt(secret) : null,
        retryOfId: retryOfId ?? null
      }
    });
    await sendWithRetries(record, serialized, secret ?? null);
  } catch (error) {
    logger.error({ err: error, taskId, url }, 'Failed to enqueue webhook delivery');
  }
};

export const redeliverWebhook = async (deliveryId: string, organizationId: string) => {
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, organizationId }
  });
  if (!delivery) {
    throw new Error('Webhook delivery not found');
  }
  const secret = delivery.secretCipher ? decrypt(delivery.secretCipher) : null;
  let payload: Record<string, unknown> | string;
  try {
    payload = JSON.parse(delivery.payload);
  } catch {
    payload = delivery.payload;
  }
  await sendWebhookDelivery({
    taskId: delivery.taskId,
    organizationId,
    url: delivery.targetUrl,
    secret,
    payload,
    retryOfId: delivery.id
  });
};

const parseCursor = (value?: string | null) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { id: string; createdAt: string };
    if (parsed?.id && parsed?.createdAt) {
      return { id: parsed.id, createdAt: new Date(parsed.createdAt) };
    }
  } catch {
    return null;
  }
  return null;
};

const encodeCursor = (row: { id: string; createdAt: Date }) =>
  Buffer.from(JSON.stringify({ id: row.id, createdAt: row.createdAt.toISOString() }), 'utf8').toString('base64url');

export const listWebhookDeliveries = async ({
  organizationId,
  taskId,
  status,
  limit,
  cursor
}: {
  organizationId: string;
  taskId?: string;
  status?: string;
  limit: number;
  cursor?: string;
}) => {
  const cursorData = parseCursor(cursor);
  const where: Prisma.WebhookDeliveryWhereInput = {
    organizationId,
    ...(taskId ? { taskId } : {}),
    ...(status ? { status } : {})
  };
  const records = await prisma.webhookDelivery.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursorData
      ? {
          cursor: { id: cursorData.id },
          skip: 1
        }
      : {})
  });
  const hasNext = records.length > limit;
  const slice = hasNext ? records.slice(0, -1) : records;
  const items = slice.map((item) => ({
    ...item,
    payload: safeParse(item.payload)
  }));
  return {
    items,
    nextCursor: hasNext ? encodeCursor(slice[slice.length - 1]) : null
  };
};

const safeParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
