import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { HttpError } from '../../utils/http-error.js';

const router = Router();

const querySchema = z.object({
  taskId: z.string().optional(),
  orgId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(['csv', 'ndjson']).default('ndjson')
});

const encodeCsv = (values: (string | number | null | undefined)[]) =>
  values
    .map((value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(',');

const eventToRow = (event: {
  id: string;
  taskId: string;
  organizationId: string;
  type: string;
  payload: unknown;
  actor: string | null;
  createdAt: Date;
}) => ({
  id: event.id,
  taskId: event.taskId,
  organizationId: event.organizationId,
  type: event.type,
  actor: event.actor ?? '',
  createdAt: event.createdAt.toISOString(),
  payload: event.payload ? JSON.stringify(event.payload) : ''
});

router.get(
  '/admin/events',
  requireAuth,
  requirePermission('admin', 'read'),
  async (req, res) => {
    const auth = req.auth!;
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new HttpError(400, 'ERR_VALIDATION', 'Invalid query parameters', parsed.error.flatten());
    }
    const orgId = parsed.data.orgId ?? auth.orgId;
    if (!orgId) {
      throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
    }
    const where = {
      organizationId: orgId,
      ...(parsed.data.taskId ? { taskId: parsed.data.taskId } : {}),
      ...(parsed.data.from || parsed.data.to
        ? {
            createdAt: {
              ...(parsed.data.from ? { gte: new Date(parsed.data.from) } : {}),
              ...(parsed.data.to ? { lte: new Date(parsed.data.to) } : {})
            }
          }
        : {})
    };

    if (parsed.data.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="task-events.csv"');
      res.write('id,taskId,organizationId,type,actor,createdAt,payload\n');
    } else {
      res.setHeader('Content-Type', 'application/x-ndjson');
    }

    let cursor: string | undefined;
    const pageSize = 500;
    while (true) {
      const batch = await prisma.taskEvent.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: pageSize,
        ...(cursor
          ? {
              cursor: { id: cursor },
              skip: 1
            }
          : {}),
        select: {
          id: true,
          taskId: true,
          organizationId: true,
          type: true,
          payload: true,
          actor: true,
          createdAt: true
        }
      });
      if (!batch.length) break;
      for (const entry of batch) {
        const row = eventToRow(entry);
        if (parsed.data.format === 'csv') {
          res.write(`${encodeCsv(Object.values(row))}\n`);
        } else {
          res.write(`${JSON.stringify(row)}\n`);
        }
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < pageSize) {
        break;
      }
    }
    res.end();
  }
);

export const adminEventsRouter = router;
