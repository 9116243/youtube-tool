import type { Request } from 'express';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

interface AuditLogParams {
  orgId: string;
  action: string;
  target?: string | null;
  payload?: Record<string, unknown> | null;
  req?: Request;
  actorUserId?: string | null;
  actorServiceAccountId?: string | null;
}

const serializePayload = (payload?: Record<string, unknown> | null) => {
  if (!payload) return null;
  try {
    return JSON.stringify(payload);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to serialize audit payload');
    return null;
  }
};

export const recordAuditLog = async ({
  orgId,
  action,
  target,
  payload,
  req,
  actorUserId,
  actorServiceAccountId
}: AuditLogParams) => {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: actorUserId ?? null,
        actorServiceAccountId: actorServiceAccountId ?? null,
        action,
        target: target ?? null,
        payload: serializePayload(payload),
        ip: req?.ip ?? null,
        userAgent: req?.get('user-agent') ?? null
      }
    });
  } catch (error) {
    logger.warn({ err: error, action }, 'Failed to record audit log');
  }
};
