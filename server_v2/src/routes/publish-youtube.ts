import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { resolve as resolvePath } from 'node:path';
import { promises as fs } from 'node:fs';
import type { Prisma, PublishJob } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { protectedLimiter } from '../middleware/rate-limit.js';
import { HttpError } from '../utils/http-error.js';
import { loadArtifacts } from '../tasks/artifacts.js';
import { env } from '../utils/env.js';
import { isStorageUri } from '../storage/uri.js';
import { materializeStorageObject } from '../storage/object-store.js';
import { evaluateLicenseForTask } from '../licensing/index.js';
import { recordLicenseBlock } from '../metrics/generation.js';
import { recordAuditLog } from '../services/audit.js';

const router = Router();

const PRIVACY_VALUES = ['public', 'private', 'unlisted'] as const;

const ensureOrgContext = (req: Request) => {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
  }
  return orgId;
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const artifactSchema = z.union([
  z.object({
    taskId: z.string().min(1),
    artifactName: z.string().min(1)
  }),
  z.object({
    path: z.string().min(1)
  })
]);

const scheduleSchema = z.object({
  channelBindingId: z.string().min(1),
  title: z.string().min(1).max(120),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().min(1).max(100)).max(12).optional(),
  privacy: z.enum(PRIVACY_VALUES).default('private'),
  scheduledAt: z.coerce.date(),
  artifact: artifactSchema
});

const updateJobSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(5000).optional(),
    tags: z.array(z.string().min(1).max(100)).max(12).optional(),
    privacy: z.enum(PRIVACY_VALUES).optional(),
    scheduledAt: z.coerce.date().optional(),
    status: z.enum(['scheduled', 'cancelled']).optional(),
    notes: z.string().max(2000).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });

const decodeStringArray = (value?: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
};

type PublishJobWithChannel = Prisma.PublishJobGetPayload<{ include: { channelBinding: true } }>;

const serializeJob = (job: PublishJobWithChannel | PublishJob | null) => {
  if (!job) return null;
  const channelBinding = 'channelBinding' in job ? (job as PublishJobWithChannel).channelBinding : null;
  return {
    id: job.id,
    organizationId: job.organizationId,
    channelBindingId: job.channelBindingId,
    taskId: job.taskId,
    artifactName: job.artifactName,
    artifactPath: job.artifactPath,
    title: job.title,
    description: job.description,
    tags: decodeStringArray(job.tags),
    privacy: job.privacy,
    scheduledAt: job.scheduledAt,
    status: job.status,
    notes: job.notes,
    videoId: job.videoId,
    externalUrl: job.externalUrl,
    publishedAt: job.publishedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    channel: channelBinding
      ? {
          id: channelBinding.id,
          title: channelBinding.channelTitle,
          provider: channelBinding.provider
        }
      : null
  };
};

const isRemoteUri = (input: string) => /^https?:\/\//i.test(input) || /^s3:\/\//i.test(input);

const resolveLocalArtifactPath = async (input: string) => {
  if (isRemoteUri(input)) {
    return input;
  }
  if (isStorageUri(input)) {
    return materializeStorageObject(input);
  }
  const absolute = resolvePath(env.WORK_DIR, input);
  await fs.access(absolute);
  return absolute;
};

const resolveArtifactPath = async (
  orgId: string,
  artifact: z.infer<typeof artifactSchema>
): Promise<{ path: string; taskId?: string; artifactName?: string }> => {
  if ('path' in artifact && artifact.path) {
    const normalized = await resolveLocalArtifactPath(artifact.path);
    return { path: normalized };
  }
  const artifactRef = artifact as { taskId: string; artifactName: string };
  const task = await prisma.task.findFirst({
    where: { id: artifactRef.taskId, organizationId: orgId }
  });
  if (!task) {
    throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found for artifact reference');
  }
  const artifacts = await loadArtifacts(task.id);
  const record = artifacts.artifacts?.[artifactRef.artifactName];
  if (!record?.path) {
    throw new HttpError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found on task');
  }
  const normalized = await resolveLocalArtifactPath(record.path);
  return { path: normalized, taskId: task.id, artifactName: artifactRef.artifactName };
};

router.get(
  '/publish/youtube/channels',
  requireAuth,
  requirePermission('publish', 'read'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const rows = await prisma.channelBinding.findMany({
      where: { organizationId: orgId, provider: 'youtube' },
      orderBy: { createdAt: 'desc' }
    });
    res.json({
      bindings: rows.map((binding) => ({
        id: binding.id,
        channelId: binding.channelId,
        channelTitle: binding.channelTitle,
        status: binding.status,
        notes: binding.notes,
        createdAt: binding.createdAt,
        updatedAt: binding.updatedAt,
        scopes: decodeStringArray(binding.scopes)
      }))
    });
  })
);

router.delete(
  '/publish/youtube/channels/:id',
  requireAuth,
  requirePermission('publish', 'admin'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    await prisma.channelBinding.deleteMany({
      where: { id: req.params.id, organizationId: orgId, provider: 'youtube' }
    });
    res.status(204).send();
  })
);

router.post(
  '/publish/youtube/schedule',
  requireAuth,
  requirePermission('publish', 'write'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_PUBLISH_PAYLOAD', 'Invalid schedule payload', parsed.error.flatten());
    }
    const binding = await prisma.channelBinding.findFirst({
      where: { id: parsed.data.channelBindingId, organizationId: orgId, provider: 'youtube' }
    });
    if (!binding) {
      throw new HttpError(404, 'CHANNEL_NOT_FOUND', 'Channel binding not found');
    }
    const artifactInfo = await resolveArtifactPath(orgId, parsed.data.artifact);
    if (artifactInfo.taskId) {
      const { license, violation } = await evaluateLicenseForTask(artifactInfo.taskId);
      if (violation) {
        recordLicenseBlock(license?.provider ?? 'unknown', violation.reason);
        await recordAuditLog({
          orgId,
          action: 'publish.license_block',
          target: artifactInfo.taskId,
          payload: {
            reason: violation.reason,
            message: violation.message,
            license
          },
          req,
          actorUserId: req.auth?.userId ?? null,
          actorServiceAccountId: req.auth?.serviceAccountId ?? null
        });
        throw new HttpError(409, 'GEN_LICENSE_BLOCK', violation.message, {
          reason: violation.reason,
          provider: license?.provider ?? 'unknown'
        });
      }
    }
    const job = await prisma.publishJob.create({
      data: {
        organizationId: orgId,
        channelBindingId: binding.id,
        taskId: artifactInfo.taskId ?? null,
        artifactName: artifactInfo.artifactName ?? null,
        artifactPath: artifactInfo.path,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        tags: parsed.data.tags ? JSON.stringify(parsed.data.tags) : null,
        privacy: parsed.data.privacy,
        scheduledAt: parsed.data.scheduledAt,
        status: 'scheduled',
        notes: null
      },
      include: { channelBinding: true }
    });
    res.status(201).json(serializeJob(job));
  })
);

const jobListQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [])),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional()
});

router.get(
  '/publish/jobs',
  requireAuth,
  requirePermission('publish', 'read'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const parsed = jobListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_QUERY', 'Invalid jobs query', parsed.error.flatten());
    }
    const statuses = parsed.data.status ?? [];
    const cursor = parsed.data.cursor;
    const where = {
      organizationId: orgId,
      ...(statuses.length ? { status: { in: statuses } } : {})
    };
    const jobs = await prisma.publishJob.findMany({
      where,
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      take: parsed.data.limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1
          }
        : {}),
      include: { channelBinding: true }
    });
    const hasNext = jobs.length > parsed.data.limit;
    const slice = hasNext ? jobs.slice(0, -1) : jobs;
    res.json({
      items: slice.map(serializeJob),
      nextCursor: hasNext ? slice[slice.length - 1]?.id ?? null : null
    });
  })
);

router.patch(
  '/publish/jobs/:id',
  requireAuth,
  requirePermission('publish', 'write'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const parsed = updateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_PUBLISH_UPDATE', 'Invalid job update payload', parsed.error.flatten());
    }
    const job = await prisma.publishJob.findFirst({
      where: { id: req.params.id, organizationId: orgId }
    });
    if (!job) {
      throw new HttpError(404, 'JOB_NOT_FOUND', 'Publish job not found');
    }
    if (!['scheduled'].includes(job.status)) {
      throw new HttpError(409, 'JOB_LOCKED', 'Only scheduled jobs can be edited');
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.description !== undefined) data.description = parsed.data.description ?? null;
    if (parsed.data.tags !== undefined) data.tags = JSON.stringify(parsed.data.tags);
    if (parsed.data.privacy) data.privacy = parsed.data.privacy;
    if (parsed.data.scheduledAt) data.scheduledAt = parsed.data.scheduledAt;
    if (parsed.data.status) data.status = parsed.data.status;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes ?? null;
    const updated = await prisma.publishJob.update({
      where: { id: job.id },
      data,
      include: { channelBinding: true }
    });
    res.json(serializeJob(updated));
  })
);

router.post(
  '/publish/tiktok/schedule',
  requireAuth,
  requirePermission('publish', 'write'),
  (_req, res) => {
    res.status(501).json({ message: 'TikTok publisher is not available yet' });
  }
);

export const publishYouTubeRouter = router;
