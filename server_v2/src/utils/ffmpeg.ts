import { spawn } from 'node:child_process';
import { env } from './env.js';
import ffmpegStatic from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import { logger } from './logger.js';

const userDefined = Boolean(process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.trim().length);

const defaultFfmpeg = ffmpegStatic || env.FFMPEG_PATH;
export const ffmpegPath: string = userDefined ? env.FFMPEG_PATH : defaultFfmpeg;
export const ffprobePath: string = ffprobe.path;

type CaptureResult = { stdout: string; stderr: string };

export const runFfmpegCapture = (args: string[]): Promise<CaptureResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `${ffmpegPath} exited with code ${code}`));
      }
    });
  });

let filterCache: Promise<Set<string>> | null = null;

const parseFilterList = (output: string) => {
  const filters = new Set<string>();
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Filters:')) continue;
    // Expected format: " T.. libvmaf           V->V      Calculate the VMAF"
    const match = /^.[A-Z.]{2}\s+([a-zA-Z0-9_]+)\s/.exec(line);
    if (match && match[1]) {
      filters.add(match[1]);
    }
  }
  return filters;
};

const loadFilters = async (): Promise<Set<string>> => {
  try {
    const { stdout } = await runFfmpegCapture(['-hide_banner', '-filters']);
    return parseFilterList(stdout);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to inspect ffmpeg filters, assuming minimal support');
    return new Set<string>();
  }
};

export const supportsFilter = async (name: string) => {
  if (!filterCache) {
    filterCache = loadFilters();
  }
  const filters = await filterCache;
  return filters.has(name);
};

export const resetFilterCache = () => {
  filterCache = null;
};
