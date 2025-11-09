import type { NextFunction, Request, Response } from 'express';
import { isDraining } from '../state/shutdown.js';
import { HttpError } from '../utils/http-error.js';

export const shutdownGuard = (req: Request, _res: Response, next: NextFunction) => {
  if (!isDraining()) {
    next();
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    next();
    return;
  }
  next(new HttpError(503, 'ERR_SHUTTING_DOWN', 'Server is shutting down'));
};
