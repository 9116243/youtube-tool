import { readFileSync } from 'node:fs';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { LangMeta } from '../types/lang-meta.js';

const languagesFile = new URL('../data/languages.json', import.meta.url);
const LANGUAGES: LangMeta[] = JSON.parse(readFileSync(languagesFile, 'utf8'));

const router = Router();

router.get(
  '/languages',
  requireAuth,
  requirePermission('tasks', 'read'),
  (_req, res) => {
    res.json({
      items: LANGUAGES,
      count: LANGUAGES.length
    });
  }
);

export const languagesRouter = router;
