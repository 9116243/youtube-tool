import { relative, resolve, join } from 'node:path';
import { env } from '../utils/env.js';

const STORAGE_SCHEME = 'storage://';
const workspaceRoot = resolve(process.cwd(), env.WORK_DIR);

const normalizeRelative = (input: string) => input.replace(/\\/g, '/').replace(/^\/+/, '');

export const buildStorageUri = (relativePath: string) =>
  `${STORAGE_SCHEME}${normalizeRelative(relativePath)}`;

export const absoluteToStorageUri = (absolutePath: string) => {
  const rel = normalizeRelative(relative(workspaceRoot, absolutePath));
  if (rel.startsWith('..')) {
    throw new Error(`Path ${absolutePath} is outside of workspace ${workspaceRoot}`);
  }
  return buildStorageUri(rel);
};

export const parseStorageUri = (uri: string) => {
  if (uri.startsWith(STORAGE_SCHEME)) {
    return normalizeRelative(uri.slice(STORAGE_SCHEME.length));
  }
  return normalizeRelative(uri);
};

export const storageUriToAbsolutePath = (uri: string) => join(workspaceRoot, parseStorageUri(uri));

export const isStorageUri = (value: string) => value.startsWith(STORAGE_SCHEME);
