import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { appEnv } from '../../utils/env';

import type { VideoGenAdapter, VideoGenAsset } from '../types';
import type { DomoAiEffectRequest } from './mapping';
import { recordGenerationProviderRequest } from '../../metrics/generation';

type SubmitRequest = DomoAiEffectRequest & {
  inputPath: string;
};

type EffectJobStatus = 'queued' | 'running' | 'success' | 'failed';

type EffectJob = {
  id: string;
  request: SubmitRequest;
  status: EffectJobStatus;
  assets?: VideoGenAsset[];
  error?: string;
};

export class DomoAiEffectAdapter {
  private readonly jobs = new Map<string, EffectJob>();
  private inflight = 0;
  private readonly waiters: Array<() => void> = [];

  private acquireSlot() {
    return new Promise<void>((resolve) => {
      if (this.inflight < appEnv.DOMOAI_MAX_CONCURRENCY) {
        this.inflight += 1;
        resolve();
        return;
      }
      this.waiters.push(resolve);
    });
  }

  private releaseSlot() {
    this.inflight = Math.max(0, this.inflight - 1);
    const next = this.waiters.shift();
    if (next) {
      this.inflight += 1;
      next();
    }
  }

  async submit(request: SubmitRequest) {
    const job: EffectJob = {
      id: randomUUID(),
      request,
      status: 'queued',
    };
    this.jobs.set(job.id, job);
    void this.processJob(job);
    recordGenerationProviderRequest('domoai', 'submit', 'success');
    return { requestId: job.id };
  }

  private async processJob(job: EffectJob) {
    job.status = 'running';
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      job.assets = await this.buildAssets(job);
      job.status = 'success';
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
    }
  }

  private async buildAssets(job: EffectJob) {
    await this.acquireSlot();
    try {
      const buffer = await fs.readFile(job.request.inputPath);
      const metadataAsset: VideoGenAsset = {
        kind: 'metadata',
        filename: 'variant.json',
        mime: 'application/json',
        buffer: Buffer.from(
          JSON.stringify(
            {
              effect: job.request.effect,
              width: job.request.width,
              height: job.request.height,
              fps: job.request.fps,
            },
            null,
            2,
          ),
        ),
      };
      const primaryAsset: VideoGenAsset = {
        kind: 'primary',
        filename: 'primary.mp4',
        mime: 'video/mp4',
        buffer,
        metadata: {
          effect: job.request.effect,
        },
      };
      const coverAsset: VideoGenAsset = {
        kind: 'cover',
        filename: 'cover.jpg',
        mime: 'image/jpeg',
        buffer: Buffer.from(`DOMOAI_${job.request.effect}_${Date.now().toString(36)}`),
      };
      return [primaryAsset, previewAsset(primaryAsset), coverAsset, metadataAsset].filter((asset): asset is VideoGenAsset => Boolean(asset));
    } finally {
      this.releaseSlot();
    }
  }

  async poll(requestId: string) {
    const job = this.jobs.get(requestId);
    if (!job) {
      recordGenerationProviderRequest('domoai', 'poll', 'error');
      return {
        status: 'failed' as const,
        progress: 1,
        errorMessage: 'job_not_found',
      };
    }
    if (job.status === 'failed') {
      return {
        status: 'failed' as const,
        progress: 1,
        errorMessage: job.error ?? 'failed',
      };
    }
    if (job.status === 'success' && job.assets) {
      recordGenerationProviderRequest('domoai', 'poll', 'success');
      return {
        status: 'success' as const,
        progress: 1,
        assets: job.assets,
      };
    }
    return {
      status: 'running' as const,
      progress: 0.5,
      etaSeconds: 1,
    };
  }

  async fetchAssets(requestId: string) {
    const job = this.jobs.get(requestId);
    if (!job) {
      throw new Error('job_not_found');
    }
    if (job.status === 'failed') {
      throw new Error(job.error ?? 'job_failed');
    }
    if (job.status !== 'success' || !job.assets?.length) {
      throw new Error('assets_not_ready');
    }
    return job.assets;
  }

  async cancel(requestId: string) {
    const job = this.jobs.get(requestId);
    if (job) {
      job.status = 'failed';
      job.error = 'cancelled';
      this.jobs.delete(requestId);
      recordGenerationProviderRequest('domoai', 'cancel', 'success');
    }
  }
}

const previewAsset = (primary: VideoGenAsset): VideoGenAsset | null => {
  if (!primary.buffer.length) {
    return null;
  }
  return {
    kind: 'preview',
    filename: 'preview.mp4',
    mime: 'video/mp4',
    buffer: Buffer.from(primary.buffer),
  };
};

export const domoaiEffectAdapter = new DomoAiEffectAdapter();
