import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { ffmpegPath } from '../utils/ffmpeg.js';
import { probeVideoMetadata } from '../utils/media-probe.js';
import { logger } from '../utils/logger.js';
import { env } from '../utils/env.js';

export type QCIssue = {
  code: string;
  at?: number;
  details?: Record<string, unknown>;
};

export type QCFix = {
  action: 'normalize_loudness' | 'adjust_bitrate';
  params?: Record<string, unknown>;
};

export type QCResult = {
  passed: boolean;
  issues: QCIssue[];
  fixes?: QCFix[];
  metrics?: Record<string, unknown>;
};

const BITRATE_TARGETS: Record<'1080p' | '2k' | '4k', number> = {
  '1080p': 8000,
  '2k': 12000,
  '4k': 20000
};

const runFfmpeg = (args: string[]) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `${ffmpegPath} exited with code ${code}`));
      }
    });
  });

const detectBlackFrames = async (filePath: string) => {
  const { stderr } = await runFfmpeg([
    '-hide_banner',
    '-i',
    filePath,
    '-vf',
    'blackdetect=d=0.1:pic_th=0.98',
    '-an',
    '-f',
    'null',
    '-'
  ]);
  return stderr.includes('black_start');
};

const detectFreeze = async (filePath: string) => {
  const { stderr } = await runFfmpeg([
    '-hide_banner',
    '-i',
    filePath,
    '-vf',
    'freezedetect=n=0.003',
    '-an',
    '-f',
    'null',
    '-'
  ]);
  return stderr.includes('freeze_start');
};

const analyzeLoudness = async (filePath: string, target: number) => {
  try {
    const { stderr } = await runFfmpeg([
      '-hide_banner',
      '-i',
      filePath,
      '-af',
      `loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`,
      '-f',
      'null',
      '-'
    ]);
    const match = stderr.match(/{[^}]+input_i[^}]+}/);
    if (!match) return null;
    return JSON.parse(match[0]) as { input_i: number; input_lra: number; input_tp: number };
  } catch (error) {
    logger.warn({ err: error }, 'loudness analysis failed');
    return null;
  }
};

export const runVideoQc = async (filePath: string): Promise<QCResult> => {
  const issues: QCIssue[] = [];
  const fixes: QCFix[] = [];
  const metadata = await probeVideoMetadata(filePath);
  const metrics: Record<string, unknown> = {
    width: metadata.width,
    height: metadata.height,
    fps: metadata.fps,
    bitrateKbps: metadata.bitrateKbps
  };

  const targetLufs = env.LOUDNESS_TARGET_LUFS ?? -14;
  const loudness = await analyzeLoudness(filePath, targetLufs);
  if (loudness) {
    metrics.loudness = loudness.input_i;
    if (Math.abs(loudness.input_i - targetLufs) > 2) {
      issues.push({
        code: 'LOUDNESS_OUT_OF_RANGE',
        details: { measured: loudness.input_i, target: targetLufs }
      });
      fixes.push({ action: 'normalize_loudness', params: { target: targetLufs } });
    }
  }

  const resolutionLabel =
    metadata.height >= 2000 ? '4k' : metadata.height >= 1300 ? '2k' : '1080p';
  const targetBitrate = BITRATE_TARGETS[resolutionLabel as keyof typeof BITRATE_TARGETS];
  if (metadata.bitrateKbps < targetBitrate * 0.6) {
    issues.push({
      code: 'BITRATE_TOO_LOW',
      details: { measured: metadata.bitrateKbps, target: targetBitrate }
    });
    fixes.push({ action: 'adjust_bitrate', params: { target: targetBitrate } });
  }

  try {
    const blackFrames = await detectBlackFrames(filePath);
    if (blackFrames) {
      issues.push({ code: 'BLACK_FRAMES' });
    }
  } catch (error) {
    logger.warn({ err: error }, 'black frame detection failed');
  }

  try {
    const freeze = await detectFreeze(filePath);
    if (freeze) {
      issues.push({ code: 'FREEZE_FRAMES' });
    }
  } catch (error) {
    logger.warn({ err: error }, 'freeze detection failed');
  }

  const passed = issues.filter((issue) => !isFixableIssue(issue.code)).length === 0;
  return { passed, issues, fixes: fixes.length ? fixes : undefined, metrics };
};

const isFixableIssue = (code: string) =>
  code === 'LOUDNESS_OUT_OF_RANGE' || code === 'BITRATE_TOO_LOW';

export const isFixableResult = (result: QCResult) => {
  if (!result.fixes?.length) return false;
  const blocking = result.issues.filter((issue) => !isFixableIssue(issue.code));
  return blocking.length === 0;
};

export const applyQcFixes = async (inputPath: string, result: QCResult) => {
  if (!result.fixes?.length) return false;
  const needsLoudness = result.fixes.some((fix) => fix.action === 'normalize_loudness');
  const bitrateFix = result.fixes.find((fix) => fix.action === 'adjust_bitrate');
  const targetBitrate = bitrateFix?.params?.target ? Number(bitrateFix.params.target) : null;

  const tempPath = `${inputPath}.qc.mp4`;
  const args = ['-y', '-i', inputPath];

  if (needsLoudness) {
    const target = Number(
      result.fixes.find((fix) => fix.action === 'normalize_loudness')?.params?.target ?? -14
    );
    args.push('-af', `loudnorm=I=${target}:TP=-1.5:LRA=11`);
    args.push('-c:a', 'aac', '-b:a', '192k');
  } else {
    args.push('-c:a', 'copy');
  }

  if (targetBitrate) {
    args.push('-c:v', 'libx264', '-b:v', `${targetBitrate}k`);
  } else {
    args.push('-c:v', 'copy');
  }

  args.push('-movflags', '+faststart', tempPath);

  try {
    await runFfmpeg(args);
    await fs.rename(tempPath, inputPath);
    return true;
  } catch (error) {
    logger.warn({ err: error }, 'qc fix failed');
    try {
      await fs.unlink(tempPath);
    } catch {
      // ignore
    }
    return false;
  }
};
