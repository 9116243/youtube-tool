import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { requireAuth } from '../middleware/auth';
import { protectedLimiter } from '../middleware/rate-limit';
import { HttpError } from '../utils/http-error';
import { getStorage } from '../storage';

const tempDir = path.join(os.tmpdir(), 'youtube-tool-upload');
fs.mkdir(tempDir, { recursive: true }).catch(() => undefined);

const upload = multer({
  dest: tempDir,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB cap for now
  },
});

export const uploadsRouter = Router();

uploadsRouter.post(
  '/uploads',
  requireAuth,
  protectedLimiter,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new HttpError(400, 'File payload missing', 'UPLOAD_FILE_REQUIRED');
      }

      const adapter = getStorage();
      const stored = await adapter.saveFile({
        tempFilePath: req.file.path,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });

      res.status(201).json(stored);
    } catch (error) {
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => undefined);
      }
      next(error);
    }
  },
);
