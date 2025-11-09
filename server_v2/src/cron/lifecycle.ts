import cron from 'node-cron';
import { readdir, readFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { storageUriToAbsolutePath, isStorageUri } from '../storage/uri.js';

const workspaceRoot = join(process.cwd(), env.WORK_DIR);
const skipDirs = new Set(['uploads', '.cache']);
const ttlMs = Math.max(1, env.WORKSPACE_TMP_TTL_HOURS ?? 24) * 60 * 60 * 1000;

const safeParseArtifacts = async (filePath: string) => {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { artifacts?: Array<{ path?: string }> };
    return Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
  } catch {
    return [];
  }
};

const resolveArtifactPath = (value?: string | null) => {
  if (!value) return null;
  if (isStorageUri(value)) {
    try {
      return storageUriToAbsolutePath(value);
    } catch {
      return null;
    }
  }
  return value;
};

const pruneTaskDir = async (taskDir: string) => {
  const keep = new Set<string>();
  const artifactsPath = join(taskDir, 'artifacts.json');
  keep.add(artifactsPath);
  const artifacts = await safeParseArtifacts(artifactsPath);
  for (const artifact of artifacts) {
    const resolved = resolveArtifactPath(artifact.path);
    if (resolved && resolved.startsWith(taskDir)) {
      keep.add(resolved);
    }
  }
  const now = Date.now();

  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (keep.has(fullPath)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(fullPath);
        const remaining = await readdir(fullPath);
        if (!remaining.length) {
          await rm(fullPath, { recursive: true, force: true });
        }
      } else {
        const info = await stat(fullPath);
        if (now - info.mtimeMs > ttlMs) {
          await rm(fullPath, { force: true });
        }
      }
    }
  };

  await walk(taskDir);
};

const runLifecycle = async () => {
  try {
    const entries = await readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (skipDirs.has(entry.name)) continue;
      const dir = join(workspaceRoot, entry.name);
      await pruneTaskDir(dir);
    }
  } catch (error) {
    logger.warn({ err: error }, 'Workspace lifecycle cleanup failed');
  }
};

let lifecycleStarted = false;

export const startLifecycleCron = () => {
  if (lifecycleStarted) return;
  lifecycleStarted = true;
  cron.schedule('0 3 * * *', () => {
    void runLifecycle();
  });
  logger.info('Lifecycle cron scheduled (daily at 03:00)');
};
