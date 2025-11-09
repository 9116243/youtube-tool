import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { env } from '../utils/env.js';
import type { LicenseRecord } from './types.js';

const LICENSE_PRESETS: Record<string, LicenseRecord> = {
  mock: {
    provider: 'mock',
    plan: 'Mock Lab',
    watermark: true,
    redistributable: false,
    commercial_use: false,
    attribution: 'none',
    tos_url: 'https://example.com/mock-tos'
  },
  runway_flash: {
    provider: 'runway',
    plan: 'Gen-3 Flash',
    watermark: false,
    redistributable: true,
    commercial_use: true,
    attribution: 'optional',
    tos_url: 'https://runwayml.com/legal/terms-of-service/'
  },
  runway_alpha: {
    provider: 'runway',
    plan: 'Gen-3 Alpha',
    watermark: false,
    redistributable: true,
    commercial_use: true,
    attribution: 'optional',
    tos_url: 'https://runwayml.com/legal/terms-of-service/'
  },
  luma: {
    provider: 'luma',
    plan: 'Dream Machine',
    watermark: false,
    redistributable: true,
    commercial_use: true,
    attribution: 'optional',
    tos_url: 'https://luma.ai/terms-of-service'
  },
  haiper: {
    provider: 'haiper',
    plan: 'Studio',
    watermark: false,
    redistributable: true,
    commercial_use: true,
    attribution: 'optional',
    tos_url: 'https://www.haiper.ai/terms'
  },
  replicate: {
    provider: 'replicate',
    plan: 'Community Hosted',
    watermark: false,
    redistributable: true,
    commercial_use: true,
    attribution: 'required',
    tos_url: 'https://replicate.com/terms'
  },
  domoai: {
    provider: 'domoai',
    plan: 'Effects',
    watermark: false,
    redistributable: true,
    commercial_use: true,
    attribution: 'optional',
    tos_url: 'https://domoai.com/terms-of-service'
  },
  default: {
    provider: 'unknown',
    plan: 'standard',
    watermark: false,
    redistributable: true,
    commercial_use: true,
    attribution: 'optional',
    tos_url: 'https://example.com/terms'
  }
};

const LICENSE_FILENAME = 'license.json';

export const resolveLicenseRecord = (
  providerKey: string,
  overrides?: Partial<LicenseRecord>
): LicenseRecord => {
  const base = LICENSE_PRESETS[providerKey] ?? LICENSE_PRESETS.default;
  return {
    provider: overrides?.provider ?? base.provider,
    plan: overrides?.plan ?? base.plan,
    watermark: overrides?.watermark ?? base.watermark,
    redistributable: overrides?.redistributable ?? base.redistributable,
    commercial_use: overrides?.commercial_use ?? base.commercial_use,
    attribution: overrides?.attribution ?? base.attribution,
    tos_url: overrides?.tos_url ?? base.tos_url
  };
};

export const writeLicenseFile = async (
  taskId: string,
  workspace: string,
  license: LicenseRecord
) => {
  const target = join(workspace, LICENSE_FILENAME);
  await fs.writeFile(target, JSON.stringify(license, null, 2));
  return target;
};

export const readLicenseFile = async (taskId: string): Promise<LicenseRecord | null> => {
  if (!taskId) return null;
  const filePath = join(env.WORK_DIR, taskId, LICENSE_FILENAME);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as LicenseRecord;
    return parsed;
  } catch {
    return null;
  }
};

export const detectLicenseViolation = (
  license?: LicenseRecord | null
): { reason: 'watermark' | 'commercial_use' | 'redistributable'; message: string } | null => {
  if (!license) return null;
  if (license.watermark) {
    return { reason: 'watermark', message: 'Provider watermark must remain in place' };
  }
  if (!license.commercial_use) {
    return { reason: 'commercial_use', message: 'Provider forbids commercial publishing' };
  }
  if (!license.redistributable) {
    return { reason: 'redistributable', message: 'License forbids redistribution' };
  }
  return null;
};

export const evaluateLicenseForTask = async (taskId: string) => {
  const license = await readLicenseFile(taskId);
  const violation = detectLicenseViolation(license);
  return { license, violation };
};

export type { LicenseRecord } from './types.js';
