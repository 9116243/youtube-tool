import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { appEnv } from '../utils/env';
import { HttpError } from '../utils/http-error';

export interface TokenPayload extends jwt.JwtPayload {
  uid: string;
  email: string;
}

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header) {
      throw new HttpError(401, 'Authorization header missing', 'UNAUTHORIZED');
    }

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new HttpError(401, 'Invalid authorization header', 'UNAUTHORIZED');
    }

    const decoded = jwt.verify(token, appEnv.JWT_SECRET) as TokenPayload;
    req.user = {
      id: decoded.uid,
      email: decoded.email,
    };
    next();
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(new HttpError(401, 'Invalid or expired token', 'UNAUTHORIZED'));
  }
};
