import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { HttpError } from '../utils/http-error.js';
import { loadArtifacts } from '../tasks/artifacts.js';
import { openStorageStream } from '../storage/object-store.js';
import { metrics } from '../metrics/index.js';
import { recordAuditLog } from '../services/audit.js';

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const ensureOrgContext = (req: Request) => {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
  }
  return orgId;
};

const parseRangeHeader = (header: string | undefined, size: number) => {
  if (!header) return null;
  const match = header.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    throw new HttpError(400, 'INVALID_RANGE', 'Invalid Range header');
  }
  const start = match[1] ? Number(match[1]) : undefined;
  const end = match[2] ? Number(match[2]) : undefined;
  if (start === undefined && end !== undefined) {
    const len = end;
    return { start: Math.max(0, size - len), end: size - 1 };
  }
  return { start, end };
};

router.get(
  '/files/:taskId/:artifact',
  requireAuth,
  requirePermission('tasks', 'read'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const task = await prisma.task.findFirst({
      where: { id: req.params.taskId, organizationId: orgId }
    });
    if (!task) {
      throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found');
    }
    const artifacts = await loadArtifacts(task.id);
    const record = artifacts.artifacts[req.params.artifact];
    if (!record) {
      throw new HttpError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found');
    }
    if (!record.path) {
      throw new HttpError(404, 'ARTIFACT_MISSING_PATH', 'Artifact path missing');
    }
    const rangeRequest = parseRangeHeader(req.headers.range as string | undefined, record.size ?? 0);
    const streamInfo = await openStorageStream(record.path, rangeRequest);
    const chunkLength = streamInfo.end - streamInfo.start + 1;
    const statusCode = rangeRequest ? 206 : 200;
    res.status(statusCode);
    res.setHeader('Content-Length', String(chunkLength));
    res.setHeader('Accept-Ranges', 'bytes');
    if (rangeRequest) {
      res.setHeader('Content-Range', `bytes ${streamInfo.start}-${streamInfo.end}/${streamInfo.size}`);
    }
    res.setHeader('Content-Type', record.type ?? 'application/octet-stream');
    const auditPayload = {
      taskId: task.id,
      artifact: record.name,
      range: rangeRequest ? `${streamInfo.start}-${streamInfo.end}` : 'full'
    };
    streamInfo.stream.on('error', (error: NodeJS.ErrnoException) => res.destroy(error));
    streamInfo.stream.pipe(res);
    res.on('finish', () => {
      metrics.storageDownloadBytes.labels(orgId).inc(chunkLength);
      void recordAuditLog({
        orgId,
        action: 'files.download',
        target: task.id,
        payload: auditPayload,
        req,
        actorUserId: req.auth?.userId ?? null,
        actorServiceAccountId: req.auth?.serviceAccountId ?? null
      }).catch(() => null);
    });
  })
);

export const filesRouter = router;
