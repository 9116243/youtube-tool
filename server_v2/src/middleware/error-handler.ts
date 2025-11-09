import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error.js';

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    const payload = {
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    };
    if (payload.error.details === undefined) {
      delete payload.error.details;
    }
    res.status(error.status).json(payload);
    return;
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected error'
    }
  });
};
