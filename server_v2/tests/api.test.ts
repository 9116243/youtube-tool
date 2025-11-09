import { describe, it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { agent, resetDatabase } from './helpers.js';
import { prisma } from '../src/db/prisma.js';
import { signPayload } from '../src/routes/webhook.js';
import { ensureTaskDir, saveArtifacts, loadArtifacts } from '../src/tasks/artifacts.js';
import { absoluteToStorageUri } from '../src/storage/uri.js';
import { getFlag } from '../src/services/flags.js';
import { runGenVideo } from '../src/gen/orchestrator.js';
import { runGenEffect } from '../src/gen/effects.js';
import { env } from '../src/utils/env.js';

process.env.GEN_MOCK_MIN_MS = '200';
process.env.GEN_MOCK_MAX_MS = '400';

const password = 'Passw0rd!123!';

const originalGenMinuteLimit = env.GEN_QUOTA_MIN_PER_DAY;
const originalGenConcurrency = env.GEN_QUOTA_CONCURRENCY;

afterEach(() => {
  env.GEN_QUOTA_MIN_PER_DAY = originalGenMinuteLimit;
  env.GEN_QUOTA_CONCURRENCY = originalGenConcurrency;
});

const registerAndAuth = async (email: string) => {
  const api = agent();
  const response = await api.post('/v1/auth/register').send({ email, password });
  expect(response.status).toBe(201);
  const token = response.body.token;
  const orgId = response.body.organizations[0].organizationId;
  return { api, token, orgId };
};

const authHeaders = (token: string, orgId: string) => ({
  Authorization: `Bearer ${token}`,
  'X-Org-Id': orgId
});

describe('API contracts', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('registers user and creates task via /v1 routes', async () => {
    const email = `test+${Date.now()}@codex.local`;
    const { api, token, orgId } = await registerAndAuth(email);
    const createRes = await api
      .post('/v1/tasks')
      .set(authHeaders(token, orgId))
      .send({
        title: 'Unit subtitle',
        params: { kind: 'subtitle', language: 'en-US', inputAudio: './sample.wav' }
      });
    expect(createRes.status).toBe(201);
    const listRes = await api.get('/v1/tasks').set(authHeaders(token, orgId));
    expect(listRes.status).toBe(200);
    expect(listRes.body.items ?? []).toHaveLength(1);
  });

  it('denies viewer access to admin resources', async () => {
    const email = `viewer+${Date.now()}@codex.local`;
    const { api, token, orgId } = await registerAndAuth(email);
    await prisma.membership.updateMany({
      where: { organizationId: orgId },
      data: { role: 'VIEWER' }
    });
    const adminRes = await api.get('/v1/admin/deadletters').set(authHeaders(token, orgId));
    expect(adminRes.status).toBe(403);
    expect(adminRes.body.error.code).toBe('ERR_AUTH');
  });

  it('expands pipeline templates atomically', async () => {
    const email = `pipeline+${Date.now()}@codex.local`;
    const { api, token, orgId } = await registerAndAuth(email);
    const template = {
      stages: [
        {
          id: 'sub',
          title: 'Sub stage',
          params: { kind: 'subtitle', language: 'en-US', inputAudio: './a.wav' }
        },
        {
          id: 'burn',
          title: 'Burn stage',
          dependsOn: ['sub'],
          params: {
            kind: 'burn',
            inputVideo: './video.mp4',
            inputSubtitle: { from: 'sub', artifact: 'srt' }
          }
        }
      ]
    };
    const response = await api
      .post('/v1/pipeline/run')
      .set(authHeaders(token, orgId))
      .send(template);
    expect(response.status).toBe(200);
    expect(response.body.created).toHaveLength(2);
    const burnStage = response.body.created.find((item: any) => item.stageId === 'burn');
    const subStage = response.body.created.find((item: any) => item.stageId === 'sub');
    expect(burnStage).toBeDefined();
    expect(subStage).toBeDefined();

    const burnTask = await prisma.task.findUniqueOrThrow({ where: { id: burnStage.taskId } });
    const deps = JSON.parse(burnTask.dependsOn ?? '[]');
    expect(deps).toContain(subStage.taskId);
  });

  it('produces deterministic webhook signatures', () => {
    const payload = JSON.stringify({ id: 'task123', status: 'success' });
    const signatureA = signPayload(payload);
    const signatureB = signPayload(payload);
    expect(signatureA).toBe(signatureB);
  });

  it('supports overriding webhook secret when signing payloads', () => {
    const payload = JSON.stringify({ id: 'task123', status: 'success' });
    const defaultSignature = signPayload(payload);
    const customSignature = signPayload(payload, 'custom-secret');
    expect(customSignature).not.toBe(defaultSignature);
  });

  it('allows admins to manage feature flags with org overrides', async () => {
    const email = `flags+${Date.now()}@codex.local`;
    const { api, token, orgId } = await registerAndAuth(email);
    const headers = authHeaders(token, orgId);
    const createRes = await api
      .post('/v1/admin/flags')
      .set(headers)
      .send({ key: 'publish.dry_run', defaultValue: true });
    expect([200, 201]).toContain(createRes.status);

    const listRes = await api.get('/v1/admin/flags').set(headers);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.items)).toBe(true);
    expect(listRes.body.items.find((flag: any) => flag.key === 'publish.dry_run')).toBeTruthy();

    const overrideRes = await api
      .post('/v1/admin/flags/publish.dry_run/overrides')
      .set(headers)
      .send({ orgId, value: false });
    expect(overrideRes.status).toBe(200);

    const resolved = await getFlag('publish.dry_run', orgId, true);
    expect(resolved).toBe(false);
  });

  it('reports usage snapshot via billing route', async () => {
    const email = `billing+${Date.now()}@codex.local`;
    const { api, token, orgId } = await registerAndAuth(email);
    await api
      .post('/v1/tasks')
      .set(authHeaders(token, orgId))
      .send({
        title: 'Usage sample',
        params: { kind: 'subtitle', language: 'en-US', inputAudio: './sample.wav' }
      });
    const usageRes = await api.get('/v1/billing/usage').set(authHeaders(token, orgId));
    expect(usageRes.status).toBe(200);
    expect(usageRes.body.tasks.used).toBeGreaterThanOrEqual(1);
    expect(usageRes.body.tasks.limit).toBeGreaterThan(0);
    expect(usageRes.body.renderMinutes.used).toBe(0);
    expect(usageRes.body.storage.limitBytes).toBeGreaterThan(0);
  });

  it('rejects presign requests when S3 backend is disabled', async () => {
    const email = `presign+${Date.now()}@codex.local`;
    const { api, token, orgId } = await registerAndAuth(email);
    const res = await api
      .post('/v1/uploads/presign')
      .set(authHeaders(token, orgId))
      .send({ filename: 'demo.wav', contentType: 'audio/wav', size: 1024 });
    expect(res.status).toBe(400);
  });

  it('streams artifacts via /files route', async () => {
    const email = `files+${Date.now()}@codex.local`;
    const { api, token, orgId } = await registerAndAuth(email);
    const createRes = await api
      .post('/v1/tasks')
      .set(authHeaders(token, orgId))
      .send({
        title: 'Download me',
        params: { kind: 'subtitle', language: 'en-US', inputAudio: './sample.wav' }
      });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    const workspace = await ensureTaskDir(taskId);
    const artifactPath = join(workspace, 'artifact.txt');
    await fs.writeFile(artifactPath, 'hello-download');
    const storagePath = absoluteToStorageUri(artifactPath);
    await saveArtifacts(taskId, {
      artifacts: {
        sample: {
          name: 'sample',
          path: storagePath,
          type: 'text/plain',
          size: 'hello-download'.length,
          createdAt: new Date().toISOString(),
          metadata: {}
        }
      }
    });
    const downloadRes = await api
      .get(`/v1/files/${taskId}/sample`)
      .set(authHeaders(token, orgId));
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.text).toBe('hello-download');
  });

  it('runs gen_video pipeline via mock adapter', async () => {
    const email = `gen+${Date.now()}@codex.local`;
    const { api, token, orgId } = await registerAndAuth(email);
    const createRes = await api
      .post('/v1/tasks')
      .set(authHeaders(token, orgId))
      .send({
        title: 'Gen video test',
        params: {
          kind: 'gen_video',
          prompt: 'A cinematic shot of a neon skyline reflecting on water',
          duration: 10,
          resolution: '1080p',
          aspect: '16:9',
          providerPolicy: 'force:mock'
        }
      });
    expect(createRes.status).toBe(201);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: createRes.body.id } });
    const params = JSON.parse(task.params ?? '{}');
    await runGenVideo({
      id: task.id,
      organizationId: task.organizationId,
      params
    });
    const generation = await prisma.generation.findUnique({ where: { taskId: task.id } });
    expect(generation).not.toBeNull();
    const workspace = await ensureTaskDir(task.id);
    await expect(fs.stat(join(workspace, 'primary.mp4'))).resolves.toBeTruthy();
    await expect(fs.stat(join(workspace, 'preview.mp4'))).resolves.toBeTruthy();
    await expect(fs.stat(join(workspace, 'cover.jpg'))).resolves.toBeTruthy();
    await expect(fs.stat(join(workspace, 'metadata.json'))).resolves.toBeTruthy();
    const assets = await prisma.generationAsset.findMany({ where: { generationId: generation!.id } });
    expect(assets.length).toBeGreaterThanOrEqual(4);
    const events = await prisma.generationEvent.findMany({ where: { generationId: generation!.id } });
    expect(events.length).toBeGreaterThanOrEqual(4);
    const artifactState = await loadArtifacts(task.id);
    expect(Object.keys(artifactState.artifacts)).toEqual(
      expect.arrayContaining(['primary', 'preview', 'cover', 'metadata'])
    );
  });

  it('reports generation billing usage snapshot', async () => {
    const email = `billing+${Date.now()}@codex.local`;
    const { api, token, orgId } = await registerAndAuth(email);
    const createRes = await api
      .post('/v1/tasks')
      .set(authHeaders(token, orgId))
      .send({
        title: 'Gen for billing',
        params: {
          kind: 'gen_video',
          prompt: 'A serene mountain lake at sunrise',
          duration: 12,
          resolution: '1080p',
          aspect: '16:9',
          providerPolicy: 'force:mock'
        }
      });
    expect(createRes.status).toBe(201);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: createRes.body.id } });
    await runGenVideo({
      id: task.id,
      organizationId: task.organizationId,
      params: JSON.parse(task.params ?? '{}')
    });
    const generation = await prisma.generation.findUniqueOrThrow({ where: { taskId: task.id } });
    expect(generation.billedMinutes).toBeGreaterThan(0);
    const usageRes = await api.get('/v1/billing/usage').set(authHeaders(token, orgId));
    expect(usageRes.status).toBe(200);
    expect(usageRes.body.generations.minutesUsed).toBeGreaterThanOrEqual(generation.billedMinutes);
    expect(usageRes.body.generations.limit).toBe(env.GEN_QUOTA_MIN_PER_DAY);
  });

  it('enforces generation minute quota per org', async () => {
    env.GEN_QUOTA_MIN_PER_DAY = 1;
    const email = `quota+${Date.now()}@codex.local`;
    const { token, orgId } = await registerAndAuth(email);
    const api = agent();
    const makeTask = async () => {
      const createRes = await api
        .post('/v1/tasks')
        .set(authHeaders(token, orgId))
        .send({
          title: 'Quota task',
          params: {
            kind: 'gen_video',
            prompt: `Quota run ${Date.now()}`,
            duration: 60,
            resolution: '1080p',
            aspect: '16:9',
            providerPolicy: 'force:mock'
          }
        });
      expect(createRes.status).toBe(201);
      return prisma.task.findUniqueOrThrow({ where: { id: createRes.body.id } });
    };
    const firstTask = await makeTask();
    await runGenVideo({
      id: firstTask.id,
      organizationId: firstTask.organizationId,
      params: JSON.parse(firstTask.params ?? '{}')
    });
    const secondTask = await makeTask();
    await expect(
      runGenVideo({
        id: secondTask.id,
        organizationId: secondTask.organizationId,
        params: JSON.parse(secondTask.params ?? '{}')
      })
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    const quotaGen = await prisma.generation.findUnique({ where: { taskId: secondTask.id } });
    expect(quotaGen?.status).toBe('rejected_quota');
    const quotaAudit = await prisma.generationAudit.findMany({
      where: { organizationId: orgId, event: 'quota.minutes' }
    });
    expect(quotaAudit.length).toBeGreaterThanOrEqual(1);
  });

  it('blocks generation when concurrency cap is reached', async () => {
    env.GEN_QUOTA_CONCURRENCY = 1;
    const email = `concurrency+${Date.now()}@codex.local`;
    const { token, orgId } = await registerAndAuth(email);
    const api = agent();
    const blockingTask = await prisma.task.create({
      data: {
        organizationId: orgId,
        title: 'Blocking generation',
        params: JSON.stringify({ kind: 'gen_video' }),
        status: 'running'
      }
    });
    await prisma.generation.create({
      data: {
        taskId: blockingTask.id,
        organizationId: orgId,
        tenantId: orgId,
        provider: 'mock',
        policy: 'force:mock',
        status: 'running',
        prompt: 'Blocking prompt',
        durationSec: 10,
        resolution: '1080p',
        fps: 24,
        aspectRatio: '16:9',
        seed: null,
        estimatedMinutes: 1,
        pricePerMinCents: 0
      }
    });
    const createRes = await api
      .post('/v1/tasks')
      .set(authHeaders(token, orgId))
      .send({
        title: 'Gen blocked',
        params: {
          kind: 'gen_video',
          prompt: 'Attempt while capped',
          duration: 10,
          resolution: '1080p',
          aspect: '16:9',
          providerPolicy: 'force:mock'
        }
      });
    expect(createRes.status).toBe(201);
    const nextTask = await prisma.task.findUniqueOrThrow({ where: { id: createRes.body.id } });
    await expect(
      runGenVideo({
        id: nextTask.id,
        organizationId: nextTask.organizationId,
        params: JSON.parse(nextTask.params ?? '{}')
      })
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    const audit = await prisma.generationAudit.findFirst({
      where: { organizationId: orgId, event: 'quota.concurrency' }
    });
    expect(audit).not.toBeNull();
  });

  it('rejects youtube publish jobs when license forbids commercial use', async () => {
    const email = `license-block+${Date.now()}@codex.local`;
    const { api, token, orgId } = await registerAndAuth(email);
    const binding = await prisma.channelBinding.create({
      data: {
        organizationId: orgId,
        provider: 'youtube',
        channelId: 'chan_123',
        channelTitle: 'Test Channel',
        scopes: JSON.stringify(['youtube.upload']),
        tokensRef: '{}',
        status: 'active',
        notes: null
      }
    });
    const createRes = await prisma.task.create({
      data: {
        organizationId: orgId,
        title: 'Gen for publish',
        params: JSON.stringify({
          kind: 'gen_video',
          prompt: 'Mock skyline for validation',
          duration: 10,
          resolution: '1080p',
          aspect: '16:9',
          providerPolicy: 'force:mock'
        })
      }
    });
    const params = JSON.parse(createRes.params ?? '{}');
    await runGenVideo({
      id: createRes.id,
      organizationId: orgId,
      params
    });
    const response = await api
      .post('/v1/publish/youtube/schedule')
      .set(authHeaders(token, orgId))
      .send({
        channelBindingId: binding.id,
        title: 'Blocked publish',
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
        artifact: {
          taskId: createRes.id,
          artifactName: 'primary'
        }
      });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('GEN_LICENSE_BLOCK');
    const audits = await prisma.auditLog.findMany({
      where: { organizationId: orgId, action: 'publish.license_block' }
    });
    expect(audits.length).toBeGreaterThan(0);
  });

  it(
    'applies domoai gen_effect and writes variant metadata',
    async () => {
    const email = `effect+${Date.now()}@codex.local`;
    const { api, token, orgId } = await registerAndAuth(email);
    const sampleVideoPath = join(process.cwd(), 'workspace', `effect-input-${Date.now()}.mp4`);
    await fs.mkdir(join(process.cwd(), 'workspace'), { recursive: true });
    await fs.writeFile(sampleVideoPath, Buffer.from('fake-video-content'));
    const createRes = await api
      .post('/v1/tasks')
      .set(authHeaders(token, orgId))
      .send({
        title: 'Effect zoom',
        params: {
          kind: 'gen_effect',
          effect: 'zoom',
          inputVideo: sampleVideoPath
        }
      });
    expect(createRes.status).toBe(201);
    const createdTask = await prisma.task.findUniqueOrThrow({ where: { id: createRes.body.id } });
    const params = JSON.parse(createdTask.params ?? '{}');
    await runGenEffect({
      id: createdTask.id,
      organizationId: createdTask.organizationId,
      params
    });
    const variantVideoPath = join(
      process.cwd(),
      'workspace',
      createdTask.id,
      'variants',
      'variant-001',
      'primary.mp4'
    );
    await expect(fs.stat(variantVideoPath)).resolves.toBeTruthy();
    const metadataPath = join(process.cwd(), 'workspace', createdTask.id, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    expect(Array.isArray(metadata.variants)).toBe(true);
    expect(metadata.variants.at(-1)?.name).toBe('variant-001');
    const artifacts = await loadArtifacts(createdTask.id);
    expect(artifacts.artifacts['variant-001-primary']).toBeDefined();
    const generation = await prisma.generation.findFirst({ where: { taskId: createdTask.id } });
    expect(generation?.provider).toBe('domoai');
    },
    10000
  );
});
