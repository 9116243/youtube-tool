import { randomUUID } from 'node:crypto';
import { VideoGenAdapter, VideoGenAsset, VideoGenPollResponse, VideoGenSubmitRequest } from '../types.js';

type MockJob = {
  id: string;
  request: VideoGenSubmitRequest;
  submittedAt: number;
  readyAt: number;
  status: 'queued' | 'running' | 'success' | 'failed';
  assets?: VideoGenAsset[];
};

const jobs = new Map<string, MockJob>();

const now = () => Date.now();

const DEFAULT_MIN_MS = 30_000;
const DEFAULT_MAX_MS = 90_000;

const resolveBounds = () => {
  const rawMin = Number(process.env.GEN_MOCK_MIN_MS ?? DEFAULT_MIN_MS);
  const min = Number.isFinite(rawMin) ? Math.max(500, rawMin) : DEFAULT_MIN_MS;
  const rawMax = Number(process.env.GEN_MOCK_MAX_MS ?? DEFAULT_MAX_MS);
  const maxCandidate = Number.isFinite(rawMax) ? Math.max(min, rawMax) : DEFAULT_MAX_MS;
  return { min, max: Math.max(min, maxCandidate) };
};

const buildAssets = (req: VideoGenSubmitRequest): VideoGenAsset[] => {
  const summary = JSON.stringify(
    {
      prompt: req.prompt,
      negative: req.negative,
      storyboard: req.storyboard,
      duration: req.duration,
      resolution: req.resolution,
      fps: req.fps ?? 24,
      aspect: req.aspect,
      references: req.references,
      provider: 'mock'
    },
    null,
    2
  );
  return [
    {
      kind: 'primary',
      filename: 'primary.mp4',
      mime: 'video/mp4',
      buffer: Buffer.from(`MOCK_PRIMARY_${req.prompt.slice(0, 32)}`)
    },
    {
      kind: 'preview',
      filename: 'preview.mp4',
      mime: 'video/mp4',
      buffer: Buffer.from(`MOCK_PREVIEW_${req.prompt.slice(0, 32)}`)
    },
    {
      kind: 'cover',
      filename: 'cover.jpg',
      mime: 'image/jpeg',
      buffer: Buffer.from(`MOCK_COVER_${req.prompt.slice(0, 32)}`)
    },
    {
      kind: 'metadata',
      filename: 'metadata.json',
      mime: 'application/json',
      buffer: Buffer.from(summary)
    }
  ];
};

const computeProgress = (job: MockJob) => {
  const total = job.readyAt - job.submittedAt;
  const elapsed = Math.max(0, Math.min(now() - job.submittedAt, total));
  return Math.min(0.95, elapsed / total);
};

export const mockVideoGenAdapter: VideoGenAdapter = {
  name: 'mock',
  async submit(request) {
    const { min, max } = resolveBounds();
    const job: MockJob = {
      id: randomUUID(),
      request,
      submittedAt: now(),
      readyAt: now() + (min + Math.floor(Math.random() * (max - min + 1))),
      status: 'queued'
    };
    jobs.set(job.id, job);
    return { requestId: job.id };
  },
  async poll(requestId) {
    const job = jobs.get(requestId);
    if (!job) {
      return {
        status: 'failed',
        progress: 0,
        errorMessage: 'job_not_found',
        errorCode: 'GEN_PROVIDER_ERROR'
      } as VideoGenPollResponse;
    }
    if (job.status === 'success' && job.assets) {
      return {
        status: 'success',
        progress: 1,
        durationSec: job.request.duration,
        costCents: 0,
        assets: job.assets
      };
    }
    if (now() >= job.readyAt) {
      job.status = 'success';
      job.assets = buildAssets(job.request);
      return {
        status: 'success',
        progress: 1,
        durationSec: job.request.duration,
        costCents: 0,
        assets: job.assets
      };
    }
    job.status = 'running';
    return {
      status: 'running',
      progress: computeProgress(job),
      etaSeconds: Math.max(1, Math.round((job.readyAt - now()) / 1000))
    };
  },
  async cancel(requestId) {
    jobs.delete(requestId);
  },
  async fetchAssets(requestId) {
    const job = jobs.get(requestId);
    if (!job || job.status !== 'success' || !job.assets?.length) {
      throw new Error('assets_not_ready');
    }
    return job.assets.map((asset) => ({
      ...asset,
      buffer: Buffer.from(asset.buffer),
      metadata: asset.metadata ? { ...asset.metadata } : undefined
    }));
  }
};
