import { Router } from 'express';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '../db/prisma.js';
import { saveUploadBuffer } from '../storage/uploads.js';
import { HttpError } from '../utils/http-error.js';
import { requireAuth } from '../middleware/auth.js';
import { protectedLimiter } from '../middleware/rate-limit.js';
import { requirePermission } from '../middleware/rbac.js';
import { recordAuditLog } from '../services/audit.js';
import { metrics } from '../metrics/index.js';
import { env } from '../utils/env.js';
import { detectMime, isAllowedMime, sanitizeFilename } from '../security/mime.js';
import { scanBuffer } from '../security/clamav.js';
import { logger } from '../utils/logger.js';
import { assertStorageQuota, refreshStorageUsage } from '../services/usage.js';
import { buildStorageUri } from '../storage/uri.js';
import { createPresignedUpload } from '../storage/object-store.js';

const upload = multer({ storage: multer.memoryStorage() });
const MAX_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

const asyncHandler =
  (fn: (req: any, res: any, next: any) => Promise<unknown>) =>
  (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const ensureQuarantineDir = async () => {
  await fs.mkdir(env.QUARANTINE_DIR, { recursive: true });
};

const quarantine = async (buffer: Buffer, fileName: string) => {
  await ensureQuarantineDir();
  const dest = join(env.QUARANTINE_DIR, `${Date.now()}-${fileName}`);
  await fs.writeFile(dest, buffer);
  return dest;
};

export const uploadsRouter = Router();

const ensureOrgContext = (req: { auth?: { orgId?: string } }) => {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
  }
  return orgId;
};

uploadsRouter.post(
  '/uploads',
  requireAuth,
  requirePermission('uploads', 'write'),
  protectedLimiter,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const auth = req.auth;
    const orgId = ensureOrgContext(req);
    if (!req.file) {
      throw new HttpError(400, 'INVALID_UPLOAD', 'Missing file payload');
    }
    const size = req.file.size ?? req.file.buffer.length;
    const sanitizedName = sanitizeFilename(req.file.originalname);
    const hash = createHash('sha256').update(req.file.buffer).digest('hex');

    const auditContext = {
      filename: sanitizedName,
      hash,
      size,
      mimeType: req.file.mimetype
    };

    if (size > MAX_BYTES) {
      metrics.uploadsRejected.inc();
      await recordAuditLog({
        orgId,
        action: 'upload.rejected',
        target: sanitizedName,
        payload: { ...auditContext, reason: 'too_large' },
        req,
        actorUserId: auth?.userId ?? null,
        actorServiceAccountId: auth?.serviceAccountId ?? null
      });
      throw new HttpError(413, 'UPLOAD_TOO_LARGE', `File exceeds max size of ${env.MAX_UPLOAD_MB} MB`);
    }

    const detected = await detectMime(req.file.buffer, req.file.mimetype);
    if (!isAllowedMime(detected.mime)) {
      metrics.uploadsRejected.inc();
      await recordAuditLog({
        orgId,
        action: 'upload.rejected',
        target: sanitizedName,
        payload: { ...auditContext, detectedMime: detected.mime, reason: 'mime_not_allowed' },
        req,
        actorUserId: auth?.userId ?? null,
        actorServiceAccountId: auth?.serviceAccountId ?? null
      });
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', `Mime type ${detected.mime} is not allowed`);
    }

    try {
      await assertStorageQuota(orgId, size);
    } catch (error) {
      metrics.uploadsRejected.inc();
      await recordAuditLog({
        orgId,
        action: 'upload.rejected',
        target: sanitizedName,
        payload: { ...auditContext, detectedMime: detected.mime, reason: 'storage_quota' },
        req,
        actorUserId: auth?.userId ?? null,
        actorServiceAccountId: auth?.serviceAccountId ?? null
      });
      throw error;
    }

    const scanResult = await scanBuffer(req.file.buffer);
    if (scanResult.status === 'infected') {
      metrics.uploadsRejected.inc();
      metrics.uploadsQuarantined.inc();
      const quarantinedPath = await quarantine(req.file.buffer, `${hash.slice(0, 8)}-${sanitizedName}`);
      await recordAuditLog({
        orgId,
        action: 'upload.quarantined',
        target: sanitizedName,
        payload: {
          ...auditContext,
          detectedMime: detected.mime,
          quarantinePath: quarantinedPath,
          signature: scanResult.signature
        },
        req,
        actorUserId: auth?.userId ?? null,
        actorServiceAccountId: auth?.serviceAccountId ?? null
      });
      throw new HttpError(422, 'UPLOAD_VIRUS_DETECTED', `Malware detected: ${scanResult.signature}`);
    }
    if (scanResult.status === 'error') {
      throw new HttpError(503, 'CLAMAV_UNAVAILABLE', 'Unable to scan file for malware');
    }

    const storageResult = await saveUploadBuffer(req.file.buffer, sanitizedName);
    const record = await prisma.upload.create({
      data: {
        id: storageResult.id,
        organizationId: orgId,
        path: storageResult.path,
        relativePath: storageResult.relativePath,
        hash: storageResult.hash,
        size: storageResult.size,
        mimeType: req.file.mimetype,
        originalName: storageResult.originalName,
        createdByUserId: auth?.userId ?? null,
        createdByServiceAccountId: auth?.serviceAccountId ?? null
      }
    });
    metrics.uploadsAccepted.inc();
    metrics.storageUploadBytes.labels(orgId).inc(storageResult.size);
    await recordAuditLog({
      orgId,
      action: 'upload.created',
      target: record.id,
      payload: { size: record.size, mimeType: record.mimeType, hash: storageResult.hash },
      req,
      actorUserId: auth?.userId ?? null,
      actorServiceAccountId: auth?.serviceAccountId ?? null
    });
    await refreshStorageUsage(orgId);
    res.status(201).json({
      upload: record,
      storage: storageResult
    });
  })
);

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.coerce.number().int().min(1),
  checksum: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, 'checksum must be a sha256 hex string')
    .optional()
});

uploadsRouter.post(
  '/uploads/presign',
  requireAuth,
  requirePermission('uploads', 'write'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    if (env.BLOB_BACKEND !== 's3') {
      throw new HttpError(400, 'PRESIGN_UNAVAILABLE', 'S3 storage backend is required for presigned uploads');
    }
    const orgId = ensureOrgContext(req);
    const auth = req.auth;
    const parsed = presignSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_PRESIGN_PAYLOAD', 'Invalid presign payload', parsed.error.flatten());
    }
    const id = nanoid();
    const safeName = sanitizeFilename(parsed.data.filename);
    const relativePath = `uploads/${id}/${safeName}`;
    const finalPath = buildStorageUri(relativePath);
    const presign = await createPresignedUpload(relativePath, parsed.data.contentType, parsed.data.size);
    await prisma.upload.create({
      data: {
        id,
        organizationId: orgId,
        path: finalPath,
        relativePath,
        hash: parsed.data.checksum ?? null,
        size: parsed.data.size,
        mimeType: parsed.data.contentType,
        originalName: safeName,
        createdByUserId: auth?.userId ?? null,
        createdByServiceAccountId: auth?.serviceAccountId ?? null
      }
    });
    await recordAuditLog({
      orgId,
      action: 'upload.presign',
      target: finalPath,
      payload: { size: parsed.data.size, mimeType: parsed.data.contentType },
      req,
      actorUserId: auth?.userId ?? null,
      actorServiceAccountId: auth?.serviceAccountId ?? null
    });
    res.json({
      uploadUrl: presign.uploadUrl,
      method: presign.method,
      finalPath,
      headers: {
        'Content-Type': parsed.data.contentType
      }
    });
  })
);
