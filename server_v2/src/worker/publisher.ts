import { createReadStream, createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { env } from '../utils/env.js';
import { decrypt, encrypt } from '../services/crypto.js';
import { logger } from '../utils/logger.js';
import { isStorageUri } from '../storage/uri.js';
import { materializeStorageObject } from '../storage/object-store.js';
import { getFlag } from '../services/flags.js';
import { evaluateLicenseForTask } from '../licensing/index.js';
import { recordLicenseBlock } from '../metrics/generation.js';
import { recordAuditLog } from '../services/audit.js';

const TICK_INTERVAL_MS = 30_000;
let timer: NodeJS.Timeout | null = null;

type PublishJobWithChannel = Prisma.PublishJobGetPayload<{ include: { channelBinding: true } }>;
type JobRecord = PublishJobWithChannel;

const createOAuthClient = () => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials are not configured');
  }
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URL);
};

const parseTags = (tags?: string | null) => {
  if (!tags) return undefined;
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? (parsed as string[]) : undefined;
  } catch {
    return undefined;
  }
};

const downloadRemoteFile = async (url: string, jobId: string) => {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download artifact for job ${jobId}`);
  }
  const dir = await fs.mkdtemp(join(tmpdir(), 'yt-upload-'));
  const filePath = join(dir, `${jobId}.bin`);
  const nodeStream = Readable.fromWeb(response.body as unknown as WebReadableStream);
  await pipeline(nodeStream, createWriteStream(filePath));
  return {
    path: filePath,
    cleanup: () => fs.rm(dir, { recursive: true, force: true })
  };
};

const resolveArtifactPath = async (input: string) => {
  if (!input) return input;
  if (isStorageUri(input)) {
    return materializeStorageObject(input);
  }
  return input;
};

const toDownloadUrl = (input: string) => {
  if (/^s3:\/\//i.test(input)) {
    const withoutScheme = input.replace(/^s3:\/\//i, '');
    const [bucket, ...rest] = withoutScheme.split('/');
    const key = rest.join('/');
    if (!bucket || !key) {
      throw new Error('Invalid s3:// artifact path');
    }
    return `https://${bucket}.s3.amazonaws.com/${key}`;
  }
  return input;
};

const openArtifactStream = async (job: JobRecord) => {
  if (!job.artifactPath) {
    throw new Error('Missing artifact path');
  }
  let path = await resolveArtifactPath(job.artifactPath);
  if (/^https?:\/\//i.test(path) || /^s3:\/\//i.test(path)) {
    const temp = await downloadRemoteFile(toDownloadUrl(path), job.id);
    return {
      stream: createReadStream(temp.path),
      cleanup: temp.cleanup
    };
  }
  await fs.access(path);
  return {
    stream: createReadStream(path),
    cleanup: undefined
  };
};

const markJob = async (id: string, data: Prisma.PublishJobUpdateArgs['data']) =>
  prisma.publishJob.update({
    where: { id },
    data
  });

const refreshBindingTokens = async (bindingId: string, tokens: unknown) => {
  try {
    await prisma.channelBinding.update({
      where: { id: bindingId },
      data: {
        tokensRef: encrypt(JSON.stringify(tokens ?? {})),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    logger.warn({ err: error, bindingId }, 'Failed to refresh binding tokens');
  }
};

const ensureLicenseForJob = async (job: JobRecord) => {
  if (!job.taskId) {
    return true;
  }
  const { license, violation } = await evaluateLicenseForTask(job.taskId);
  if (!violation) {
    return true;
  }
  recordLicenseBlock(license?.provider ?? 'unknown', violation.reason);
  await recordAuditLog({
    orgId: job.organizationId,
    action: 'publish.license_block',
    target: job.id,
    payload: {
      reason: violation.reason,
      message: violation.message,
      jobId: job.id,
      taskId: job.taskId,
      license
    },
    actorUserId: null,
    actorServiceAccountId: null
  });
  await markJob(job.id, {
    status: 'failed',
    notes: `LICENSE_BLOCK: ${violation.reason}`
  });
  return false;
};

const handleJob = async (job: JobRecord) => {
  const locked = await prisma.publishJob.updateMany({
    where: { id: job.id, status: 'scheduled' },
    data: { status: 'processing', updatedAt: new Date() }
  });
  if (!locked.count) {
    return;
  }
  if (!job.channelBinding || job.channelBinding.status !== 'active') {
    await markJob(job.id, {
      status: 'failed',
      notes: 'Channel binding is inactive'
    });
    return;
  }
  if (!(await ensureLicenseForJob(job))) {
    return;
  }
  let artifactHandle: Awaited<ReturnType<typeof openArtifactStream>> | null = null;
  try {
    artifactHandle = await openArtifactStream(job);
  } catch (error) {
    await markJob(job.id, {
      status: 'failed',
      notes: (error as Error).message.slice(0, 500)
    });
    logger.error({ err: error, jobId: job.id }, 'Publish job missing artifact');
    return;
  }
  try {
    const dryRun = await getFlag('publish.dry_run', job.organizationId, env.DRY_RUN);
    if (dryRun) {
      await markJob(job.id, {
        status: 'published',
        notes: `DRY_RUN: simulated publish at ${new Date().toISOString()}`,
        publishedAt: new Date()
      });
      logger.info({ jobId: job.id }, 'Publish job simulated (dry-run)');
      return;
    }
    const tokens = JSON.parse(decrypt(job.channelBinding.tokensRef));
    const oauth2 = createOAuthClient();
    oauth2.setCredentials(tokens);
    await oauth2.getAccessToken();
    const youtube = google.youtube('v3');
    const response = await youtube.videos.insert({
      auth: oauth2,
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: job.title,
          description: job.description ?? undefined,
          tags: parseTags(job.tags)
        },
        status: {
          privacyStatus: job.privacy ?? 'private'
        }
      },
      media: {
        body: artifactHandle!.stream
      }
    });
    if (oauth2.credentials) {
      await refreshBindingTokens(job.channelBindingId, oauth2.credentials);
    }
    const videoId = response.data.id ?? null;
    await markJob(job.id, {
      status: 'published',
      videoId,
      externalUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
      publishedAt: new Date(),
      notes: response.statusText ?? null
    });
    logger.info({ jobId: job.id, videoId }, 'Publish job completed');
  } catch (error) {
    await markJob(job.id, {
      status: 'failed',
      notes: (error as Error).message.slice(0, 500)
    });
    logger.error({ err: error, jobId: job.id }, 'Publish job failed');
  } finally {
    await artifactHandle?.cleanup?.();
  }
};

const poll = async () => {
  const due: PublishJobWithChannel[] = await prisma.publishJob.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { lte: new Date() }
    },
    orderBy: { scheduledAt: 'asc' },
    take: 5,
    include: { channelBinding: true }
  });
  await Promise.all(due.map((job) => handleJob(job)));
};

export const startPublisherWorker = () => {
  if (timer) return;
  timer = setInterval(() => {
    poll().catch((error) => logger.error({ err: error }, 'Publisher worker tick failed'));
  }, TICK_INTERVAL_MS);
  void poll();
  logger.info('Publisher worker started');
};
