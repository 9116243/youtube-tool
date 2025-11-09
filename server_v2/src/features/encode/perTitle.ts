import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../../utils/env.js';

export type LadderEntry = {
  bitrate: number;
  vmaf: number;
  resolution: '1080p' | '1440p' | '2160p' | 'source';
  met: boolean;
};

export type PerTitleResult = {
  targetVmaf: number;
  recommendedBitrate: number;
  ladder: LadderEntry[];
};

const ensureDir = async (path: string) => {
  await mkdir(path, { recursive: true });
};

const resolveFloor = (resolution: LadderEntry['resolution']) => {
  if (resolution === '1440p') {
    return env.BITRATE_FLOOR_1440P;
  }
  if (resolution === '2160p') {
    return env.BITRATE_FLOOR_2160P;
  }
  if (resolution === 'source') {
    return env.BITRATE_FLOOR_SOURCE;
  }
  return env.BITRATE_FLOOR_1080P;
};

const attemptVmaf = (bitrate: number, floor: number, target: number) => {
  const headroom = bitrate / Math.max(floor, 1);
  const variation = Math.log2(headroom) * 1.5;
  return Math.min(100, target + variation * 0.5);
};

export const generatePerTitleLadder = async (options: {
  taskId: string;
  workspace: string;
  resolution: LadderEntry['resolution'];
  sourceBitrate?: number;
  targetVmaf?: number;
}) => {
  const dir = join(options.workspace);
  await ensureDir(dir);
  const floor = resolveFloor(options.resolution);
  const targetVmaf = options.targetVmaf ?? env.PER_TITLE_VMAF_TARGET;
  const ladder: LadderEntry[] = [];
  for (let i = 0; i < 5; i += 1) {
    const bitrate = floor + i * Math.round(floor * 0.2);
    const vmaf = attemptVmaf(bitrate, floor, targetVmaf);
    const met = vmaf >= targetVmaf;
    ladder.push({ bitrate, vmaf: Number(vmaf.toFixed(2)), resolution: options.resolution, met });
  }
  const recommended = ladder.reduce(
    (prev, curr) => (curr.met && curr.bitrate < prev.bitrate ? curr : prev),
    ladder[ladder.length - 1]
  );
  const result: PerTitleResult = {
    targetVmaf,
    recommendedBitrate: recommended.bitrate,
    ladder
  };
  const outputPath = join(dir, 'ladder.json');
  await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
  return result;
};
