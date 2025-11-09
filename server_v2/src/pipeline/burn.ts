import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { materializeStorageObject } from '../storage/object-store.js';
import { isStorageUri } from '../storage/uri.js';
import { ffmpegPath, ffprobePath } from '../utils/ffmpeg.js';

type ResolutionId = '1080p' | '1440p' | '2160p' | 'source';

type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type WatermarkConfig = {
  path: string;
  opacity?: number;
  position?: WatermarkPosition;
};

const RESOLUTION_MAP: Record<Exclude<ResolutionId, 'source'>, { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 }
};

const DEFAULT_BITRATES: Record<Exclude<ResolutionId, 'source'>, number> = {
  '1080p': 8000,
  '1440p': 14000,
  '2160p': 24000
};

const watermarkPositions: Record<WatermarkPosition, { x: string; y: string }> = {
  'top-left': { x: '10', y: '10' },
  'top-right': { x: 'main_w-overlay_w-10', y: '10' },
  'bottom-left': { x: '10', y: 'main_h-overlay_h-10' },
  'bottom-right': { x: 'main_w-overlay_w-10', y: 'main_h-overlay_h-10' }
};

const ffmpegBinary = ffmpegPath;
const ffprobeBinary = ffprobePath;

const escapeFilterPath = (input: string) =>
  input.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\\\'");

const runProbeCapture = (args: string[]) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(ffprobeBinary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `${ffprobeBinary} exited with code ${code}`));
      }
    });
  });

const probeMedia = async (filePath: string) => {
  const args = ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath];
  const { stdout } = await runProbeCapture(args);
  const parsed = JSON.parse(stdout || '{}');
  const videoStream = Array.isArray(parsed.streams)
    ? parsed.streams.find((stream: Record<string, unknown>) => stream.codec_type === 'video')
    : null;
  const duration = Number(parsed.format?.duration ?? videoStream?.duration ?? 0) || 0;
  const width = Number(videoStream?.width ?? 0) || 0;
  const height = Number(videoStream?.height ?? 0) || 0;
  return { duration, width, height };
};

export type BurnPipelineOptions = {
  taskId: string;
  workspace: string;
  inputVideo: string;
  inputSubtitle?: string | null;
  inputAudio?: string | null;
  resolution: ResolutionId;
  bitrateKbps?: number;
  watermark?: WatermarkConfig | null;
  hwaccel?: 'auto' | 'none';
  onProgress?: (fraction: number, etaSeconds?: number) => Promise<void> | void;
};

export type BurnPipelineResult = {
  outputPath: string;
  durationSeconds: number;
  width: number;
  height: number;
  sizeBytes: number;
  bitrateKbps: number;
};

const buildFilterGraph = (
  resolution: ResolutionId,
  subtitlePath: string | null | undefined,
  watermark: WatermarkConfig | null | undefined,
  watermarkInputLabel?: string
) => {
  const parts: string[] = [];
  let currentLabel = '[0:v]';
  let labelCounter = 0;
  const nextLabel = () => `[v${labelCounter++}]`;

  if (resolution === 'source') {
    const evenLabel = nextLabel();
    parts.push(`${currentLabel}scale=trunc(iw/2)*2:trunc(ih/2)*2${evenLabel}`);
    currentLabel = evenLabel;
  } else {
    const target = RESOLUTION_MAP[resolution];
    const scaledLabel = nextLabel();
    parts.push(
      `${currentLabel}scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease${scaledLabel}`
    );
    const paddedLabel = nextLabel();
    parts.push(
      `${scaledLabel}pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black${paddedLabel}`
    );
    currentLabel = paddedLabel;
  }

  if (subtitlePath) {
    const subLabel = nextLabel();
    parts.push(`${currentLabel}subtitles='${escapeFilterPath(subtitlePath)}'${subLabel}`);
    currentLabel = subLabel;
  }

  if (watermark?.path) {
    const wmLabel = `[wm${labelCounter}]`;
    const overlayLabel = nextLabel();
    const opacity = Math.min(1, Math.max(0, watermark.opacity ?? 1));
    const position = watermarkPositions[watermark.position ?? 'bottom-right'];
    const wmSource = watermarkInputLabel ?? '[1:v]';
    parts.push(`${wmSource}format=rgba,colorchannelmixer=aa=${opacity.toFixed(2)}${wmLabel}`);
    parts.push(`${currentLabel}${wmLabel}overlay=${position.x}:${position.y}${overlayLabel}`);
    currentLabel = overlayLabel;
  }

  const graph = parts.join(';');
  return { filterGraph: graph, outputLabel: currentLabel };
};

const resolvePathInput = async (input: string) => {
  if (isStorageUri(input)) {
    return materializeStorageObject(input);
  }
  return resolvePath(process.cwd(), input);
};

export const runBurnPipeline = async (options: BurnPipelineOptions): Promise<BurnPipelineResult> => {
  const videoAbsolute = await resolvePathInput(options.inputVideo);
  const subtitleAbsolute = options.inputSubtitle ? await resolvePathInput(options.inputSubtitle) : null;
  const audioAbsolute = options.inputAudio ? await resolvePathInput(options.inputAudio) : null;
  const watermarkResolved = options.watermark?.path
    ? {
        ...options.watermark,
        path: await resolvePathInput(options.watermark.path)
      }
    : null;

  const metadata = await probeMedia(videoAbsolute);
  const totalDuration = metadata.duration || 1;
  const resolution = options.resolution;
  const targetBitrate =
    options.bitrateKbps ??
    (resolution === 'source'
      ? DEFAULT_BITRATES['1080p']
      : DEFAULT_BITRATES[resolution as Exclude<ResolutionId, 'source'>]);

  const outputPath = join(options.workspace, 'out.mp4');
  const args: string[] = ['-hide_banner', '-y'];

  if (options.hwaccel !== 'none') {
    args.push('-hwaccel', 'auto');
  }

  args.push('-i', videoAbsolute);
  if (watermarkResolved) {
    args.push('-i', watermarkResolved.path);
  }
  if (audioAbsolute) {
    args.push('-i', audioAbsolute);
  }

  const watermarkInputLabel =
    watermarkResolved && audioAbsolute ? `[1:v]` : watermarkResolved ? '[1:v]' : undefined;

  const { filterGraph, outputLabel } = buildFilterGraph(
    resolution,
    subtitleAbsolute,
    watermarkResolved,
    watermarkInputLabel
  );
  if (filterGraph.length > 0) {
    args.push('-filter_complex', filterGraph, '-map', outputLabel);
  } else {
    args.push('-map', '0:v:0');
  }

  if (audioAbsolute) {
    const audioIndex = watermarkResolved ? 2 : 1;
    args.push('-map', `${audioIndex}:a:0`, '-c:a', 'aac', '-b:a', '192k');
  } else {
    args.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '192k');
  }
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-profile:v', 'high');

  const bitrate = Math.max(1000, Math.round(targetBitrate));
  const maxrate = Math.round(bitrate * 1.15);
  const bufsize = Math.round(bitrate * 2);
  args.push('-b:v', `${bitrate}k`, '-maxrate', `${maxrate}k`, '-bufsize', `${bufsize}k`);
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', outputPath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegBinary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let progressBuffer = '';

    const handleProgress = async (chunk: Buffer) => {
      progressBuffer += chunk.toString();
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key === 'out_time_ms') {
          const currentSeconds = Number(value) / 1_000_000;
          const fraction = Math.min(1, Math.max(0, currentSeconds / totalDuration));
          await options.onProgress?.(fraction, totalDuration - currentSeconds);
        }
      }
    };

    child.stdout.on('data', (chunk) => {
      void handleProgress(chunk).catch((error) => logger.warn({ err: error }, 'progress handler failed'));
    });
    child.stderr.on('data', (chunk) => logger.debug({ taskId: options.taskId }, chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${ffmpegBinary} exited with code ${code}`));
      }
    });
  });

  const stats = await stat(outputPath);
  const finalMeta = await probeMedia(outputPath);
  const durationSeconds = finalMeta.duration || totalDuration;
  const bitrateKbps = Math.round(((stats.size * 8) / (durationSeconds || 1)) / 1000);

  return {
    outputPath,
    durationSeconds,
    width: finalMeta.width || metadata.width,
    height: finalMeta.height || metadata.height,
    sizeBytes: stats.size,
    bitrateKbps
  };
};
