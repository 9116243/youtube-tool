import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error.js';
import { logger } from '../utils/logger.js';

const STANDARD_CODES = new Set([
  'ERR_VALIDATION',
  'ERR_AUTH',
  'ERR_RATE_LIMIT',
  'ERR_NOT_FOUND',
  'ERR_CONFLICT',
  'ERR_DEPENDENCY',
  'ERR_INTERNAL'
]);

const PASSTHROUGH_PREFIXES = ['ERR_', 'GEN_'];

const mapStatusToCode = (status: number) => {
  if (status === 400 || status === 422) return 'ERR_VALIDATION';
  if (status === 401 || status === 403) return 'ERR_AUTH';
  if (status === 404) return 'ERR_NOT_FOUND';
  if (status === 409) return 'ERR_CONFLICT';
  if (status === 424) return 'ERR_DEPENDENCY';
  if (status === 429) return 'ERR_RATE_LIMIT';
  return 'ERR_INTERNAL';
};

const normalizeCode = (status: number, rawCode?: string) => {
  if (rawCode) {
    if (STANDARD_CODES.has(rawCode)) {
      return rawCode;
    }
    if (PASSTHROUGH_PREFIXES.some((prefix) => rawCode.startsWith(prefix))) {
      return rawCode;
    }
  }
  return mapStatusToCode(status);
};

const mergeDetails = (canonical: string, error: HttpError) => {
  if (!error.code || canonical === error.code) {
    return error.details;
  }
  const extra = { originalCode: error.code, details: error.details };
  if (!error.details) {
    return extra;
  }
  if (typeof error.details === 'object' && !Array.isArray(error.details)) {
    return { originalCode: error.code, ...error.details };
  }
  return extra;
};

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    const code = normalizeCode(error.status, error.code);
    const payload: { error: { code: string; message: string; details?: unknown } } = {
      error: {
        code,
        message: error.message,
        details: mergeDetails(code, error)
      }
    };
    if (payload.error.details === undefined) {
      delete payload.error.details;
    }
    res.status(error.status).json(payload);
    return;
  }

  logger.error({ err: error }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'ERR_INTERNAL',
      message: 'Unexpected error'
    }
  });
};
