import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../utils/http-error.js';
import { createTask, getTask, queryTasks } from '../tasks/store.js';
import { controlTask } from '../tasks/runner.js';
import { metrics } from '../metrics/index.js';
import { refreshQueueMetrics } from '../lib/queue-metrics.js';
import { createTaskWithKey, findTaskByKey } from '../tasks/idempotency.js';
import { acquireIdempotencyLock, releaseIdempotencyLock } from '../services/idempotency.js';
import { listTaskEvents, recordTaskEvent } from '../services/task-event.js';
import { requireAuth } from '../middleware/auth.js';
import { protectedLimiter } from '../middleware/rate-limit.js';
import { requirePermission } from '../middleware/rbac.js';
import { recordAuditLog } from '../services/audit.js';
import { assertTaskQuota, recordTaskUsage } from '../services/usage.js';
import { createPipelineTask } from '../pipeline/orchestrator.js';
import { ensureTaskDir, resolveInput } from '../tasks/artifacts.js';
import { materializeStorageObject } from '../storage/object-store.js';
import { isStorageUri } from '../storage/uri.js';
import { generatePerTitleLadder } from '../features/encode/perTitle.js';
import { getHdrMetadataForProfile, type HdrProfile } from '../features/color/hdr.js';
import { adjustSubtitleForSafeArea } from '../features/subtitles/safearea.js';
import { evaluateLipSync } from '../features/qc/lipsync.js';
import { readFile, stat } from 'node:fs/promises';
import { resolve as resolvePath, join } from 'node:path';

const inputRefSchema = z.union([
  z.string().min(1),
  z.object({
    from: z.string().min(1),
    artifact: z.string().min(1)
  })
]);

const providerOverrideSchema = z.union([
  z.string().min(1),
  z.object({
    asr: z.string().min(1).optional(),
    tts: z.string().min(1).optional()
  })
]);

const subtitleParamsSchema = z.object({
  kind: z.literal('subtitle'),
  language: z.string().min(2),
  model: z.string().min(1).optional(),
  provider: providerOverrideSchema.optional(),
  diarize: z.boolean().optional(),
  timestamps: z.boolean().optional(),
  inputAudio: inputRefSchema
});

const dubbingParamsSchema = z.object({
  kind: z.literal('dubbing'),
  provider: providerOverrideSchema,
  voiceId: z.string().optional(),
  language: z.string().min(2),
  speed: z.number().positive().optional(),
  style: z.string().optional(),
  inputSubtitle: inputRefSchema
});

const resolutionSchema = z.enum(['1080p', '1440p', '2160p', 'source']);

const watermarkSchema = z.object({
  path: inputRefSchema,
  opacity: z.coerce.number().min(0).max(1).optional(),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional()
});

const colorProfileSchema = z.enum(['hdr10', 'hlg', 'bt2020', 'hdr10+']);

const encodeProfileSchema = z
  .object({
    video: z.string().min(1).optional(),
    resolution: resolutionSchema.optional(),
    colorProfile: colorProfileSchema.optional(),
    targetVmaf: z.coerce.number().min(60).max(100).optional()
  })
  .strict();

const resolveMediaInput = async (value?: unknown) => {
  if (!value) return undefined;
  if (typeof value === 'string') {
    if (isStorageUri(value)) {
      return materializeStorageObject(value);
    }
    return resolvePath(value);
  }
  if (value && typeof value === 'object') {
    const candidate = value as { from?: string; artifact?: string };
    if (typeof candidate.from === 'string' && typeof candidate.artifact === 'string') {
      return resolveInput({ from: candidate.from, artifact: candidate.artifact });
    }
  }
  return undefined;
};

const burnParamsSchema = z.object({
  kind: z.literal('burn'),
  inputVideo: inputRefSchema,
  inputAudio: inputRefSchema.optional(),
  inputSubtitle: inputRefSchema.optional(),
  resolution: resolutionSchema.default('1080p'),
  bitrate: z.coerce.number().int().min(500).optional(),
  watermark: watermarkSchema.optional(),
  hwaccel: z.enum(['auto', 'none']).default('auto')
});

const pipelineParamsSchema = z.object({
  kind: z.literal('pipeline'),
  inputVideo: z.string().min(1),
  language: z.string().min(2).optional(),
  voiceId: z.string().optional(),
  provider: z.string().optional(),
  resolution: resolutionSchema.default('1080p').optional(),
  bitrate: z.coerce.number().int().min(500).optional(),
  watermark: watermarkSchema.optional(),
  hwaccel: z.enum(['auto', 'none']).default('auto')
});

const providerPolicySchema = z.union([
  z.enum(['best_quality', 'lowest_cost', 'balanced']),
  z
    .string()
    .regex(/^force:[a-z0-9_.-]+$/i, 'force overrides must follow force:<provider> format')
]);

const referenceSchema = z.object({
  url: z.string().url(),
  label: z.string().max(120).optional()
});

const genVideoParamsSchema = z.object({
  kind: z.literal('gen_video'),
  prompt: z.string().min(10),
  storyboard: z.string().optional(),
  duration: z.coerce.number().int().min(3).max(600),
  resolution: z.enum(['1080p', '2k', '4k']),
  fps: z.coerce.number().int().min(12).max(60).optional(),
  aspect: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  seed: z.coerce.number().int().min(0).max(1_000_000).optional(),
  negative: z.string().optional(),
  references: z.array(referenceSchema).max(5).default([]),
  providerPolicy: providerPolicySchema.default('balanced')
});

const genEffectParamsSchema = z.object({
  kind: z.literal('gen_effect'),
  effect: z.enum(['zoom', 'reframe', 'kenburns']).default('zoom'),
  inputVideo: inputRefSchema,
  fps: z.coerce.number().int().min(12).max(60).optional(),
  resolution: z.enum(['1080p', '2k', '4k']).optional(),
  seed: z.coerce.number().int().min(0).max(1_000_000).optional(),
  providerPolicy: providerPolicySchema.default('force:domoai')
});

const paramsSchema = z.union([
  subtitleParamsSchema,
  dubbingParamsSchema,
  burnParamsSchema,
  pipelineParamsSchema,
  genVideoParamsSchema,
  genEffectParamsSchema
]);

const createTaskSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    preset: z.string().optional(),
    dependsOn: z.array(z.string().min(1)).optional(),
    params: paramsSchema
  })
  .strict();

const createTaskBodySchema = createTaskSchema.extend({
  idempotencyKey: z.string().min(1).max(128).optional()
});

const idParamsSchema = z.object({
  id: z.string().min(1)
});

const controlSchema = z
  .object({
    action: z.enum(['pause', 'resume', 'cancel'])
  })
  .strict();

const sortValues = ['createdAt_desc', 'createdAt_asc', 'progress_desc'] as const;
type SortParam = (typeof sortValues)[number];

const allowedStatuses = new Set(['queued', 'running', 'success', 'failed', 'cancelled', 'paused']);

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

const parseStatuses = (value?: string) => {
  if (!value) return [];
  return value
    .split(',')
    .map((status) => status.trim())
    .filter((status) => allowedStatuses.has(status));
};

const clampLimit = (value?: string) => {
  const num = Number(value);
  if (Number.isNaN(num) || num <= 0) return 20;
  return Math.min(100, Math.max(1, Math.floor(num)));
};

const parseCursor = (cursor?: string) => {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (decoded?.createdAt && decoded?.id) {
      return { createdAt: new Date(decoded.createdAt), id: String(decoded.id) };
    }
  } catch {
    return null;
  }
  return null;
};

const parseDateParam = (value?: string) => {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return new Date(timestamp);
};

const buildCreatedPayload = (task: Awaited<ReturnType<typeof getTask>>) => ({
  title: task?.title ?? null,
  preset: task?.preset ?? null,
  params: task?.params ?? {},
  dependsOn: task?.dependsOn ?? []
});

export const tasksRouter = Router();

tasksRouter.get(
  '/tasks',
  requireAuth,
  requirePermission('tasks', 'read'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const statuses = parseStatuses(req.query.status as string | undefined);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const limit = clampLimit(req.query.limit as string | undefined);
    const cursor = parseCursor(req.query.cursor as string | undefined);
    const sort = sortValues.includes(req.query.sort as SortParam)
      ? (req.query.sort as SortParam)
      : 'createdAt_desc';
    const createdFrom = parseDateParam(req.query.from as string | undefined);
    const createdTo = parseDateParam(req.query.to as string | undefined);

    const result = await queryTasks({
      organizationId: orgId,
      statuses,
      search: q,
      limit,
      cursor: cursor ?? undefined,
      sort,
      createdFrom,
      createdTo
    });
    res.json(result);
  })
);

tasksRouter.get(
  '/tasks/:id',
  requireAuth,
  requirePermission('tasks', 'read'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const params = idParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new HttpError(400, 'INVALID_TASK_ID', 'Invalid task id', params.error.flatten());
    }
    const task = await getTask(params.data.id, orgId);
    if (!task) {
      throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found');
    }
    res.json(task);
  })
);

tasksRouter.get(
  '/tasks/:id/events',
  requireAuth,
  requirePermission('tasks', 'read'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const params = idParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new HttpError(400, 'INVALID_TASK_ID', 'Invalid task id', params.error.flatten());
    }
    const limit = clampLimit(req.query.limit as string | undefined);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const result = await listTaskEvents({ taskId: params.data.id, organizationId: orgId, limit, cursor });
    res.json(result);
  })
);

tasksRouter.post(
  '/tasks',
  requireAuth,
  requirePermission('tasks', 'write'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const parsed = createTaskBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_TASK_PAYLOAD', 'Invalid task payload', parsed.error.flatten());
    }

    const { idempotencyKey, ...taskPayload } = parsed.data;
    const headerKey = req.header('Idempotency-Key')?.trim();
    const effectiveKey = idempotencyKey ?? headerKey;

    if (taskPayload.params.kind === 'pipeline') {
      const { task, reused } = await createPipelineTask({
        orgId,
        title: taskPayload.title,
        description: taskPayload.description,
        preset: taskPayload.preset ?? undefined,
        params: taskPayload.params,
        actorUserId: req.auth?.userId ?? null,
        actorServiceAccountId: req.auth?.serviceAccountId ?? null
      });
      res.status(reused ? 200 : 201).json(task);
      return;
    }

    const createInput = {
      organizationId: orgId,
      ...taskPayload
    };

    if (effectiveKey) {
      const existing = await findTaskByKey(effectiveKey, orgId);
      if (existing) {
        res.json(existing);
        return;
      }

      const lockKey = `${orgId}:${effectiveKey}`;
      const lockAcquired = await acquireIdempotencyLock(lockKey);
      if (!lockAcquired) {
        const inflight = await findTaskByKey(effectiveKey, orgId);
        if (inflight) {
          res.json(inflight);
          return;
        }
        throw new HttpError(409, 'Task creation in progress', 'IDEMPOTENCY_INFLIGHT');
      }

      try {
        await assertTaskQuota(orgId, 1);
        const task = await createTaskWithKey(createInput, effectiveKey, orgId);
        metrics.tasksCreated.inc();
        await recordTaskUsage(orgId, 1);
        await refreshQueueMetrics();
        await recordTaskEvent({
          taskId: task.id,
          organizationId: orgId,
          type: 'task.created',
          payload: buildCreatedPayload(task),
          actor: req.auth?.userId ?? null
        });
        await recordAuditLog({
          orgId,
          action: 'task.created',
          target: task.id,
          payload: { title: task.title, preset: task.preset, kind: task.params?.kind },
          req,
          actorUserId: req.auth?.userId ?? null,
          actorServiceAccountId: req.auth?.serviceAccountId ?? null
        });
        res.status(201).json(task);
      } finally {
        await releaseIdempotencyLock(lockKey);
      }
      return;
    }

    await assertTaskQuota(orgId, 1);
    const task = await createTask(createInput);
    metrics.tasksCreated.inc();
    await recordTaskUsage(orgId, 1);
    await refreshQueueMetrics();
    await recordTaskEvent({
      taskId: task.id,
      organizationId: orgId,
      type: 'task.created',
      payload: buildCreatedPayload(task),
      actor: req.auth?.userId ?? null
    });
    await recordAuditLog({
      orgId,
      action: 'task.created',
      target: task.id,
      payload: { title: task.title, preset: task.preset, kind: task.params?.kind },
      req,
      actorUserId: req.auth?.userId ?? null,
      actorServiceAccountId: req.auth?.serviceAccountId ?? null
    });
    res.status(201).json(task);
  })
);

tasksRouter.patch(
  '/tasks/:id',
  requireAuth,
  requirePermission('tasks', 'write'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const params = idParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new HttpError(400, 'INVALID_TASK_ID', 'Invalid task id', params.error.flatten());
    }
    const body = controlSchema.safeParse(req.body);
    if (!body.success) {
      throw new HttpError(400, 'INVALID_TASK_ACTION', 'Invalid task control payload', body.error.flatten());
    }
    const actor =
      req.auth?.userId ?? req.auth?.serviceAccountId ?? null;
    const controlled = await controlTask(params.data.id, orgId, body.data.action, actor);
    if (!controlled) {
      throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found');
    }
    await refreshQueueMetrics();
    await recordAuditLog({
      orgId,
      action: `task.${body.data.action}`,
      target: controlled.id,
      payload: { status: controlled.status },
      req,
      actorUserId: req.auth?.userId ?? null,
      actorServiceAccountId: req.auth?.serviceAccountId ?? null
    });
    res.json(controlled);
  })
);

tasksRouter.patch(
  '/tasks/:id/encode-profile',
  requireAuth,
  requirePermission('tasks', 'write'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const params = idParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new HttpError(400, 'INVALID_TASK_ID', 'Invalid task id', params.error.flatten());
    }
    const body = encodeProfileSchema.safeParse(req.body);
    if (!body.success) {
      throw new HttpError(400, 'INVALID_ENCODE_PROFILE', 'Invalid encode profile payload', body.error.flatten());
    }
    const task = await getTask(params.data.id, orgId);
    if (!task) {
      throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found');
    }
    const videoSource =
      (await resolveMediaInput(body.data.video ?? task.params?.inputVideo)) ??
      (await resolveMediaInput(task.params?.inputVideo));
    if (!videoSource) {
      throw new HttpError(400, 'MISSING_VIDEO', 'No video source provided');
    }
    const workspace = await ensureTaskDir(task.id);
    const resolution = (body.data.resolution ??
      (typeof task.params?.resolution === 'string' ? task.params?.resolution : '1080p')) as '1080p' | '1440p' | '2160p' | 'source';
    const ladder = await generatePerTitleLadder({
      taskId: task.id,
      workspace,
      resolution,
      targetVmaf: body.data.targetVmaf
    });
    const profile = body.data.colorProfile as HdrProfile | undefined;
    const colorMeta = getHdrMetadataForProfile(profile);
    const safeArea = adjustSubtitleForSafeArea(task.title ?? task.id, {
      width: 1920,
      height: 1080
    });
    const lipSync = evaluateLipSync(0);
    res.json({
      ladder,
      color: colorMeta,
      safeArea,
      lipSync,
      path: join(workspace, 'ladder.json')
    });
  })
);

tasksRouter.get(
  '/tasks/:id/ladder.json',
  requireAuth,
  requirePermission('tasks', 'read'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const params = idParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new HttpError(400, 'INVALID_TASK_ID', 'Invalid task id', params.error.flatten());
    }
    const task = await getTask(params.data.id, orgId);
    if (!task) {
      throw new HttpError(404, 'TASK_NOT_FOUND', 'Task not found');
    }
    const workspace = await ensureTaskDir(task.id);
    const ladderPath = join(workspace, 'ladder.json');
    try {
      await stat(ladderPath);
    } catch {
      throw new HttpError(404, 'LADDER_MISSING', 'Per-title ladder not generated yet');
    }
    const contents = await readFile(ladderPath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(contents);
  })
);
