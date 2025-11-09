import path from 'node:path';
import { fileTypeFromBuffer, type FileTypeResult } from 'file-type';
import { env } from '../utils/env.js';

const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;
const allowedMimes = new Set(
  env.ALLOWED_MIME.split(',').map((item) => item.trim()).filter(Boolean)
);

export const sanitizeFilename = (name?: string | null) => {
  const fallback = 'upload.bin';
  if (!name) return fallback;
  const base = path.basename(name).replace(CONTROL_CHARS, '_').trim();
  return base || fallback;
};

export const getAllowedMimes = () => new Set(allowedMimes);

export const detectMime = async (
  buffer: Buffer,
  declaredMime?: string | null
): Promise<{ mime: string; ext?: string; fromMagic: boolean; magic?: FileTypeResult | null }> => {
  const magic = await fileTypeFromBuffer(buffer);
  if (magic?.mime) {
    return { mime: magic.mime, ext: magic.ext, fromMagic: true, magic };
  }
  if (declaredMime) {
    return { mime: declaredMime, ext: undefined, fromMagic: false, magic: null };
  }
  return { mime: 'application/octet-stream', ext: undefined, fromMagic: false, magic: null };
};

export const isAllowedMime = (mime: string) => allowedMimes.has(mime);
