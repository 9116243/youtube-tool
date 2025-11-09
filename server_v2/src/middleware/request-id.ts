import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '../observability/context.js';

export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header('x-request-id')?.trim();
  const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader('x-request-id', requestId);
  runWithRequestContext({ requestId }, () => next());
};
