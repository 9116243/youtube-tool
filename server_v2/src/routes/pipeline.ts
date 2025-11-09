import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import YAML from 'yaml';
import { prisma } from '../db/prisma.js';
import { buildTaskData } from '../tasks/models.js';
import { HttpError } from '../utils/http-error.js';
import { metrics } from '../metrics/index.js';
import { refreshQueueMetrics } from '../lib/queue-metrics.js';
import { requireAuth } from '../middleware/auth.js';
import { protectedLimiter } from '../middleware/rate-limit.js';
import { enqueueTask } from '../queue/index.js';
import { requirePermission } from '../middleware/rbac.js';
import { recordAuditLog } from '../services/audit.js';
import { recordTaskEvent } from '../services/task-event.js';
import { startTemporalPipeline } from '../orchestration/temporal/client.js';
import { env } from '../utils/env.js';
import { assertTaskQuota, recordTaskUsage } from '../services/usage.js';
import { ssePush, type TaskStreamPayload } from '../sse.js';

const router = Router();

const itemSchema = z
  .object({
    localId: z.string().min(1).optional(),
    title: z.string().min(1),
    preset: z.string().optional(),
    params: z.record(z.unknown()).default({}),
    dependsOn: z.array(z.string()).default([])
  })
  .strict();

const bodySchema = z
  .object({
    items: z.array(itemSchema).min(1)
  })
  .strict();

const templateStageSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    title: z.string().min(1),
    preset: z.string().optional(),
    params: z.record(z.unknown()).default({}),
    dependsOn: z.array(z.string().min(1)).default([]),
    retries: z.number().int().min(0).optional(),
    timeout: z.number().int().min(1).optional()
  })
  .strict();

const templateSchema = z
  .object({
    stages: z.array(templateStageSchema).min(1),
    retries: z.number().int().min(0).optional(),
    timeout: z.number().int().min(1).optional()
  })
  .strict();

const watermarkSchema = z.object({
  path: z.string().min(1),
  opacity: z.coerce.number().min(0).max(1).optional(),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional()
});

const temporalShotSchema = z
  .object({
    id: z.string().min(1),
    inputVideo: z.string().min(1),
    inputAudio: z.string().min(1).optional(),
    language: z.string().min(2).optional(),
    voiceId: z.string().optional(),
    provider: z.string().optional(),
    resolution: z.enum(['1080p', '1440p', '2160p', 'source']).optional(),
    bitrate: z.coerce.number().int().min(500).optional(),
    watermark: watermarkSchema.optional(),
    useGpu: z.boolean().default(true),
    metadata: z.record(z.unknown()).optional()
  })
  .strict();

const temporalPipelineSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    preset: z.string().optional(),
    provider: z.string().optional(),
    voiceId: z.string().optional(),
    language: z.string().optional(),
    shots: z.array(temporalShotSchema).min(1).max(12)
  })
  .strict();

const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const ensureOrgContext = (req: Request) => {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
  }
  return orgId;
};

const topoSort = (items: Array<z.infer<typeof itemSchema>>) => {
  const localIdMap = new Map<string, number>();
  items.forEach((item, index) => {
    if (item.localId) {
      if (localIdMap.has(item.localId)) {
        throw new HttpError(400, 'INVALID_PIPELINE', `Duplicate localId ${item.localId}`);
      }
      localIdMap.set(item.localId, index);
    }
  });

  const indegree = new Array(items.length).fill(0);
  const edges: number[][] = items.map(() => []);

  items.forEach((item, index) => {
    item.dependsOn.forEach((dep) => {
      if (localIdMap.has(dep)) {
        const depIndex = localIdMap.get(dep)!;
        edges[depIndex].push(index);
        indegree[index] += 1;
      }
    });
  });

  const queue: number[] = [];
  indegree.forEach((deg, index) => {
    if (deg === 0) queue.push(index);
  });

  const order: number[] = [];
  while (queue.length) {
    const node = queue.shift()!;
    order.push(node);
    for (const next of edges[node]) {
      indegree[next] -= 1;
      if (indegree[next] === 0) {
        queue.push(next);
      }
    }
  }

  if (order.length !== items.length) {
    throw new HttpError(400, 'INVALID_PIPELINE', 'Detected dependency cycle in pipeline');
  }
  return { order, localIdMap };
};

const cloneValue = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const rewriteReferences = (value: unknown, mapping: Map<string, string>): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteReferences(item, mapping));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.from === 'string' && mapping.has(record.from)) {
      return { ...record, from: mapping.get(record.from)! };
    }
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      next[key] = rewriteReferences(entry, mapping);
    }
    return next;
  }
  return value;
};

const parseTemplateString = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(400, 'INVALID_TEMPLATE', 'Pipeline template payload is empty');
  }
  const attempts: Array<() => unknown> = [
    () => JSON.parse(trimmed),
    () => YAML.parse(trimmed)
  ];
  for (const attempt of attempts) {
    try {
      const parsed = attempt();
      return templateSchema.parse(parsed);
    } catch {
      /* try next */
    }
  }
  throw new HttpError(400, 'INVALID_TEMPLATE', 'Template must be valid JSON or YAML');
};

const parseTemplateBody = (body: unknown) => {
  if (typeof body === 'string') {
    return parseTemplateString(body);
  }
  if (body && typeof body === 'object' && 'template' in body && typeof (body as Record<string, unknown>).template === 'string') {
    return parseTemplateString((body as Record<string, string>).template);
  }
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'INVALID_TEMPLATE', 'Template payload missing');
  }
  return templateSchema.parse(body);
};

router.post(
  '/pipeline/submit',
  requireAuth,
  requirePermission('pipeline', 'write'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_PIPELINE', 'Invalid pipeline payload', parsed.error.flatten());
    }

    const { items } = parsed.data;
    await assertTaskQuota(orgId, items.length);
    const { order, localIdMap } = topoSort(items);

    const created = await prisma.$transaction(async (tx) => {
      const localToTask = new Map<string, string>();
      const results: { id: string; localId?: string }[] = [];

      for (const index of order) {
        const item = items[index];
        const resolvedDeps = item.dependsOn.map((dep) => {
          if (localToTask.has(dep)) {
            return localToTask.get(dep)!;
          }
          if (localIdMap.has(dep)) {
            throw new HttpError(400, 'INVALID_PIPELINE', `Dependency ${dep} not resolved`);
          }
          return dep;
        });

        const createdTask = await tx.task.create({
          data: buildTaskData({
            organizationId: orgId,
            title: item.title,
            preset: item.preset,
            params: item.params,
            dependsOn: resolvedDeps
          })
        });

        if (item.localId) {
          localToTask.set(item.localId, createdTask.id);
        }
        results.push({ id: createdTask.id, localId: item.localId });
      }

      return results;
    });

    for (const item of created) {
      await enqueueTask(item.id);
    }
    metrics.tasksCreated.inc(created.length);
    await recordTaskUsage(orgId, created.length);
    await refreshQueueMetrics();
    await recordAuditLog({
      orgId,
      action: 'pipeline.submit',
      target: created.map((item) => item.id).join(','),
      payload: { count: created.length },
      req,
      actorUserId: req.auth?.userId ?? null,
      actorServiceAccountId: req.auth?.serviceAccountId ?? null
    });
    res.json({ created, topoOrder: created.map((item) => item.id) });
  })
);

router.post(
  '/pipeline/run',
  requireAuth,
  requirePermission('pipeline', 'write'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const template = parseTemplateBody(req.body);
    if (template.stages.length > env.PIPELINE_MAX_STAGES) {
      throw new HttpError(
        400,
        'PIPELINE_TOO_LARGE',
        `Pipeline exceeds limit of ${env.PIPELINE_MAX_STAGES} stages`
      );
    }
    const normalizedStages = template.stages.map((stage, index) => ({
      ...stage,
      stageId: stage.id ?? `stage-${index + 1}`
    }));
    const seen = new Set<string>();
    normalizedStages.forEach((stage) => {
      if (seen.has(stage.stageId)) {
        throw new HttpError(400, 'INVALID_TEMPLATE', `Duplicate stage id ${stage.stageId}`);
      }
      seen.add(stage.stageId);
    });
    const stageOrder = new Map<string, number>();
    normalizedStages.forEach((stage, index) => stageOrder.set(stage.stageId, index));
    await assertTaskQuota(orgId, normalizedStages.length);

    const created = await prisma.$transaction(async (tx) => {
      const stageMapping = new Map<string, string>();
      const results: { stageId: string; taskId: string }[] = [];

      for (const stage of normalizedStages) {
        const currentIndex = stageOrder.get(stage.stageId) ?? 0;
        const resolvedDepends = stage.dependsOn?.map((dep) => {
          if (stageMapping.has(dep)) {
            return stageMapping.get(dep)!;
          }
          if (stageOrder.has(dep) && (stageOrder.get(dep) ?? 0) >= currentIndex) {
            throw new HttpError(
              400,
              'INVALID_TEMPLATE',
              `Stage ${stage.stageId} cannot depend on future stage ${dep}`
            );
          }
          return dep;
        }) ?? [];

        const paramsClone = cloneValue(stage.params ?? {});
        const resolvedParams = rewriteReferences(paramsClone, stageMapping) as Record<string, unknown>;
        const timeout = stage.timeout ?? template.timeout;
        if (timeout) {
          resolvedParams.timeoutSeconds = timeout;
        }
        const maxRetries = stage.retries ?? template.retries ?? null;

        const createdTask = await tx.task.create({
          data: buildTaskData({
            organizationId: orgId,
            title: stage.title,
            preset: stage.preset,
            params: resolvedParams,
            dependsOn: resolvedDepends,
            maxRetries
          })
        });

        stageMapping.set(stage.stageId, createdTask.id);
        results.push({ stageId: stage.stageId, taskId: createdTask.id });
      }

      return results;
    });

    await Promise.all(created.map((item) => enqueueTask(item.taskId)));
    metrics.tasksCreated.inc(created.length);
    await recordTaskUsage(orgId, created.length);
    await refreshQueueMetrics();
    await recordAuditLog({
      orgId,
      action: 'pipeline.run',
      target: created.map((item) => item.taskId).join(','),
      payload: { stages: created.length },
      req,
      actorUserId: req.auth?.userId ?? null,
      actorServiceAccountId: req.auth?.serviceAccountId ?? null
    });
    res.json({ created });
  })
);

export const pipelineRouter = router;

router.post(
  '/pipeline/temporal/run',
  requireAuth,
  requirePermission('pipeline', 'write'),
  protectedLimiter,
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const parsed = temporalPipelineSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_TEMPORAL_PAYLOAD', 'Pipeline payload invalid', parsed.error.flatten());
    }
    await assertTaskQuota(orgId, parsed.data.shots.length);
    const params = {
      kind: 'temporal',
      shots: parsed.data.shots
    };
    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        preset: parsed.data.preset ?? null,
        params: JSON.stringify(params),
        status: 'running',
        progress: 0,
        result: JSON.stringify({ phase: 'PIPE', step: 'temporal.init' })
      }
    });
    metrics.tasksCreated.inc();
    await recordTaskUsage(orgId, 1);
    await recordTaskEvent({
      taskId: task.id,
      organizationId: orgId,
      type: 'task.created',
      payload: { kind: 'temporal', shots: parsed.data.shots.length },
      actor: req.auth?.userId ?? null
    });
    await recordAuditLog({
      orgId,
      action: 'pipeline.temporal.run',
      target: task.id,
      payload: { shots: parsed.data.shots.length },
      req,
      actorUserId: req.auth?.userId ?? null,
      actorServiceAccountId: req.auth?.serviceAccountId ?? null
    });
    ssePush(task.id, {
      id: task.id,
      status: 'running',
      progress: 0,
      phase: 'PIPE',
      step: 'temporal.init'
    });
    let workflowHandle: Awaited<ReturnType<typeof startTemporalPipeline>> | undefined;
    try {
      workflowHandle = await startTemporalPipeline({
        taskId: task.id,
        organizationId: orgId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        preset: parsed.data.preset ?? null,
        provider: parsed.data.provider,
        voiceId: parsed.data.voiceId,
        language: parsed.data.language,
        shots: parsed.data.shots
      });
    } catch (error) {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          progress: 0,
          result: JSON.stringify({
            phase: 'PIPE',
            step: 'temporal.failed',
            metrics: { error: (error as Error).message }
          })
        }
      });
      metrics.tasksFailed.inc();
      await recordTaskEvent({
        taskId: task.id,
        organizationId: orgId,
        type: 'task.failed',
        payload: { phase: 'PIPE', step: 'temporal.failed', error: (error as Error).message },
        actor: 'temporal'
      });
      ssePush(task.id, {
        id: task.id,
        status: 'failed',
        progress: 0,
        phase: 'PIPE',
        step: 'temporal.failed'
      });
      throw new HttpError(502, 'TEMPORAL_WORKFLOW_FAILED', 'Could not start Temporal pipeline', {
        error: (error as Error).message
      });
    }
    res.status(201).json({ task, workflowId: workflowHandle!.workflowId });
  })
);

router.post(
  '/pipeline/temporal/events',
  asyncHandler(async (req, res) => {
    const secret = req.header('x-temporal-sse-secret');
    if (secret !== env.TEMPORAL_SSE_SECRET) {
      throw new HttpError(403, 'INVALID_SSE_SECRET', 'Temporal SSE secret mismatch');
    }
    const payload = req.body as TaskStreamPayload & { taskId?: string };
    if (!payload?.taskId) {
      throw new HttpError(400, 'INVALID_SSE_PAYLOAD', 'Missing taskId in SSE payload');
    }
    ssePush(payload.taskId, { ...payload, id: payload.taskId });
    res.sendStatus(204);
  })
);
