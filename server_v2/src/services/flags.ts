import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

const overrideSchema = z.record(z.boolean());

type FlagRecord = {
  key: string;
  defaultValue: boolean;
  overrides: Record<string, boolean>;
};

const cache = new Map<string, { expiresAt: number; value: FlagRecord | null }>();
const TTL_MS = 60 * 1000;

const parseFlag = (record?: { key: string; defaultValue: string; orgOverrides: string | null }) => {
  if (!record) return null;
  let overrides: Record<string, boolean> = {};
  if (record.orgOverrides) {
    try {
      overrides = overrideSchema.parse(JSON.parse(record.orgOverrides));
    } catch (error) {
      logger.warn({ err: error, key: record.key }, 'Failed to parse flag overrides');
    }
  }
  return {
    key: record.key,
    defaultValue: record.defaultValue === 'true',
    overrides
  };
};

const fetchFlag = async (key: string) => {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const record = await prisma.featureFlag.findUnique({ where: { key } });
  const parsed = parseFlag(record ?? undefined);
  cache.set(key, { value: parsed, expiresAt: Date.now() + TTL_MS });
  return parsed;
};

export const invalidateFlag = (key: string) => cache.delete(key);

export const getFlag = async (key: string, orgId: string | undefined | null, fallback: boolean) => {
  const record = await fetchFlag(key);
  if (!record) return fallback;
  if (orgId && record.overrides[orgId] !== undefined) {
    return record.overrides[orgId];
  }
  return record.defaultValue;
};

export const upsertFlag = async (key: string, defaultValue: boolean) => {
  await prisma.featureFlag.upsert({
    where: { key },
    update: { defaultValue: String(defaultValue) },
    create: { key, defaultValue: String(defaultValue) }
  });
  invalidateFlag(key);
};

export const setOrgOverride = async (key: string, orgId: string, value: boolean) => {
  const record = await prisma.featureFlag.findUnique({ where: { key } });
  const overrides = record?.orgOverrides ? overrideSchema.parse(JSON.parse(record.orgOverrides)) : {};
  overrides[orgId] = value;
  await prisma.featureFlag.upsert({
    where: { key },
    update: { orgOverrides: JSON.stringify(overrides) },
    create: { key, defaultValue: String(value), orgOverrides: JSON.stringify(overrides) }
  });
  invalidateFlag(key);
};

export const deleteOrgOverride = async (key: string, orgId: string) => {
  const record = await prisma.featureFlag.findUnique({ where: { key } });
  if (!record?.orgOverrides) return;
  const overrides = overrideSchema.parse(JSON.parse(record.orgOverrides));
  delete overrides[orgId];
  await prisma.featureFlag.update({
    where: { key },
    data: { orgOverrides: JSON.stringify(overrides) }
  });
  invalidateFlag(key);
};

export const listFlags = async () => {
  const flags = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  return flags.map((flag) => ({
    key: flag.key,
    defaultValue: flag.defaultValue === 'true',
    overrides: parseFlag(flag)?.overrides ?? {}
  }));
};
