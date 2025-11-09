import { spawn } from 'node:child_process';
import { ffprobePath } from './ffmpeg.js';
import { logger } from './logger.js';

const probe = (args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
        resolve(stdout);
      } else {
        reject(new Error(stderr || `${ffprobePath} exited with ${code}`));
      }
    });
  });

export type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
};

export const probeVideoMetadata = async (filePath: string): Promise<VideoMetadata> => {
  try {
    const stdout = await probe([
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      '-select_streams',
      'v:0',
      filePath
    ]);
    const parsed = JSON.parse(stdout || '{}');
    const stream = Array.isArray(parsed.streams) ? parsed.streams[0] : null;
    const format = parsed.format ?? {};
    const width = Number(stream?.width ?? 1920) || 1920;
    const height = Number(stream?.height ?? 1080) || 1080;
    const duration = Number(stream?.duration ?? format?.duration ?? 10) || 10;
    const fpsText = typeof stream?.avg_frame_rate === 'string' ? stream.avg_frame_rate : '24/1';
    const fps = parseFps(fpsText);
    const bitrate = Number(stream?.bit_rate ?? format?.bit_rate ?? 0);
    return { width, height, duration, fps, bitrateKbps: Math.max(1, Math.round(bitrate / 1000)) };
  } catch (error) {
    logger.warn({ err: error }, 'Failed to probe video metadata, using defaults');
    return { width: 1920, height: 1080, duration: 10, fps: 24, bitrateKbps: 8000 };
  }
};

const parseFps = (text: string) => {
  const parts = text.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return Math.round(num / den);
    }
  }
  const value = Number(text);
  return Number.isFinite(value) ? Math.round(value) : 24;
};
