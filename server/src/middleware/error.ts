import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

export interface ErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    if (err.status >= 500) {
      logger.error('%s %s -> %d %s', req.method, req.originalUrl, err.status, err.message);
    } else {
      logger.warn('%s %s -> %d %s', req.method, req.originalUrl, err.status, err.message);
    }
    const payload: ErrorPayload = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    if (!err.details) {
      delete payload.error.details;
    }
    return res.status(err.status).json(payload);
  }

  logger.error('Unhandled error for %s %s', req.method, req.originalUrl, err);

  const payload: ErrorPayload = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
    },
  };

  return res.status(500).json(payload);
};
