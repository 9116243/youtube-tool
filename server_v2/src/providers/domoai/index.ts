import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { VideoGenAsset } from '../types.js';
import type { EffectKind } from '../../gen/effects.js';
import { recordGenerationProviderRequest } from '../../metrics/generation.js';
import { env } from '../../utils/env.js';

type SubmitRequest = {
  inputPath: string;
  effect: EffectKind;
  width: number;
  height: number;
  fps: number;
};

type EffectJob = {
  id: string;
  request: SubmitRequest;
  status: 'queued' | 'running' | 'success' | 'failed';
  assets?: VideoGenAsset[];
  error?: string;
};

type EffectPollResponse =
  | {
      status: 'running';
      progress: number;
      etaSeconds?: number;
    }
  | {
      status: 'success';
      progress: number;
      assets: VideoGenAsset[];
    }
  | {
      status: 'failed';
      progress: number;
      errorMessage: string;
    };

class DomoAiEffectAdapter {
  private jobs = new Map<string, EffectJob>();
  private inflight = 0;
  private waiters: Array<() => void> = [];

  private acquireSlot() {
    return new Promise<void>((resolve) => {
      if (this.inflight < env.DOMOAI_MAX_CONCURRENCY) {
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
      status: 'queued'
    };
    this.jobs.set(job.id, job);
    void this.processJob(job);
    recordGenerationProviderRequest('domoai', 'submit', 'success');
    return { requestId: job.id };
  }

  private async loadAssets(job: EffectJob) {
    if (job.assets) return job.assets;
    await this.acquireSlot();
    const buffer = await fs.readFile(job.request.inputPath);
    this.releaseSlot();
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
            fps: job.request.fps
          },
          null,
          2
        )
      )
    };
    const primaryAsset: VideoGenAsset = {
      kind: 'primary',
      filename: 'primary.mp4',
      mime: 'video/mp4',
      buffer,
      metadata: {
        effect: job.request.effect
      }
    };
    const coverAsset: VideoGenAsset = {
      kind: 'cover',
      filename: 'cover.jpg',
      mime: 'image/jpeg',
      buffer: Buffer.from(`DOMOAI_${job.request.effect}_${Date.now()}`)
    };
    job.assets = [primaryAsset, coverAsset, metadataAsset];
    return job.assets;
  }

  private async processJob(job: EffectJob) {
    job.status = 'running';
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await this.loadAssets(job);
      job.status = 'success';
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
    }
  }

  async poll(requestId: string): Promise<EffectPollResponse> {
    const job = this.jobs.get(requestId);
    if (!job) {
      recordGenerationProviderRequest('domoai', 'poll', 'error');
      return {
        status: 'failed',
        progress: 1,
        errorMessage: 'job_not_found'
      };
    }
    if (job.status === 'failed') {
      return { status: 'failed', progress: 1, errorMessage: job.error ?? 'failed' };
    }
    if (job.status === 'success') {
      const assets = await this.loadAssets(job);
      recordGenerationProviderRequest('domoai', 'poll', 'success');
      return { status: 'success', progress: 1, assets };
    }
    return { status: 'running', progress: 0.5, etaSeconds: 1 };
  }

  async fetchAssets(requestId: string) {
    const job = this.jobs.get(requestId);
    if (!job) {
      throw new Error('job_not_found');
    }
    if (job.status === 'failed') {
      throw new Error(job.error ?? 'job_failed');
    }
    if (job.status !== 'success') {
      throw new Error('assets_not_ready');
    }
    return this.loadAssets(job);
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

export const domoaiEffectAdapter = new DomoAiEffectAdapter();
