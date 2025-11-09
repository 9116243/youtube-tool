import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { runFfmpegCapture, supportsFilter } from '../utils/ffmpeg.js';

export type BurnQualityMetrics = {
  loudness?: {
    inputIntegrated?: number;
    inputLra?: number;
    outputIntegrated?: number;
    outputLra?: number;
  };
  vmaf?: number;
};

export type BurnQualityAssessment = {
  metrics: BurnQualityMetrics;
  shouldRetry: boolean;
  reason?: string;
};

const extractJsonBlock = (content: string) => {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = content.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return null;
};

const measureLoudness = async (filePath: string) => {
  const args = [
    '-hide_banner',
    '-i',
    filePath,
    '-af',
    `loudnorm=I=${env.LOUDNESS_TARGET_LUFS}:TP=-1.5:LRA=${env.LOUDNESS_RANGE}:print_format=json`,
    '-f',
    'null',
    '-'
  ];
  try {
    const { stderr } = await runFfmpegCapture(args);
    const parsed = extractJsonBlock(stderr);
    if (!parsed) return null;
    return {
      inputIntegrated: parsed.input_i ? Number(parsed.input_i) : undefined,
      inputLra: parsed.input_lra ? Number(parsed.input_lra) : undefined,
      outputIntegrated: parsed.output_i ? Number(parsed.output_i) : undefined,
      outputLra: parsed.output_lra ? Number(parsed.output_lra) : undefined
    };
  } catch (error) {
    logger.warn({ err: error }, 'Failed to measure loudness');
    return null;
  }
};

const measureVmaf = async (referencePath: string, testPath: string) => {
  const supported = await supportsFilter('libvmaf');
  if (!supported) return null;
  const workDir = await mkdtemp(join(tmpdir(), 'vmaf-'));
  const logPath = join(workDir, 'vmaf.json');
  const filterGraph =
    '[0:v]scale=1920:1080:flags=bicubic:force_divisible_by=2:force_original_aspect_ratio=decrease[v0];' +
    '[1:v]scale=1920:1080:flags=bicubic:force_divisible_by=2:force_original_aspect_ratio=decrease[v1];' +
    '[v0][v1]libvmaf=log_fmt=json:log_path=' +
    logPath;
  const args = ['-hide_banner', '-i', testPath, '-i', referencePath, '-lavfi', filterGraph, '-f', 'null', '-'];
  try {
    await runFfmpegCapture(args);
    const payload = await readFile(logPath, 'utf8');
    const parsed = JSON.parse(payload);
    const mean = parsed?.pooled_metrics?.vmaf?.mean;
    return typeof mean === 'number' ? mean : null;
  } catch (error) {
    logger.warn({ err: error }, 'Failed to measure VMAF');
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => null);
  }
};

export const assessBurnQuality = async ({
  enforce,
  originalVideo,
  outputVideo
}: {
  enforce: boolean;
  originalVideo?: string | null;
  outputVideo: string;
}): Promise<BurnQualityAssessment> => {
  const metrics: BurnQualityMetrics = {};
  let shouldRetry = false;
  let reason: string | undefined;

  const loudness = await measureLoudness(outputVideo);
  if (loudness) {
    metrics.loudness = loudness;
    if (enforce && typeof loudness.outputIntegrated === 'number') {
      const delta = Math.abs(loudness.outputIntegrated - env.LOUDNESS_TARGET_LUFS);
      if (delta > 1.5) {
        shouldRetry = true;
        reason = 'loudness_out_of_range';
      }
    }
    if (!shouldRetry && enforce && typeof loudness.outputLra === 'number') {
      if (loudness.outputLra > env.LOUDNESS_RANGE * 1.2) {
        shouldRetry = true;
        reason = 'loudness_range_exceeded';
      }
    }
  }

  if (!shouldRetry && originalVideo) {
    const vmafScore = await measureVmaf(originalVideo, outputVideo);
    if (typeof vmafScore === 'number') {
      metrics.vmaf = vmafScore;
      if (enforce && vmafScore < env.VMAF_MIN) {
        shouldRetry = true;
        reason = 'vmaf_below_threshold';
      }
    }
  }

  return { metrics, shouldRetry, reason };
};
