import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/http-error.js';

type Role = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';

const ROLE_WEIGHT: Record<Role, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
  OWNER: 4
};

type Resource =
  | 'tasks'
  | 'pipeline'
  | 'publish'
  | 'uploads'
  | 'admin'
  | 'orgs'
  | 'apikeys'
  | 'billing';

type Action = 'read' | 'write' | 'admin';

const ACL: Record<Resource, Partial<Record<Action, Role>>> = {
  tasks: { read: 'VIEWER', write: 'EDITOR', admin: 'ADMIN' },
  pipeline: { read: 'VIEWER', write: 'EDITOR' },
  publish: { read: 'VIEWER', write: 'EDITOR', admin: 'ADMIN' },
  uploads: { write: 'EDITOR' },
  admin: { read: 'ADMIN', write: 'ADMIN', admin: 'OWNER' },
  orgs: { read: 'VIEWER', write: 'ADMIN', admin: 'OWNER' },
  apikeys: { read: 'ADMIN', write: 'ADMIN', admin: 'OWNER' },
  billing: { read: 'ADMIN' }
};

const deriveRole = (req: Request): Role => {
  if (req.auth?.role) {
    return req.auth.role;
  }
  if (req.auth?.actorType === 'service') {
    return 'ADMIN';
  }
  return 'VIEWER';
};

export const requirePermission = (resource: Resource, action: Action) => {
  const required = ACL[resource]?.[action];
  if (!required) {
    throw new Error(`Missing ACL entry for ${resource}:${action}`);
  }
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth?.orgId) {
      throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
    }
    const role = deriveRole(req);
    if (ROLE_WEIGHT[role] >= ROLE_WEIGHT[required]) {
      next();
      return;
    }
    throw new HttpError(403, 'FORBIDDEN', 'Insufficient permissions');
  };
};
