import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { google } from 'googleapis';
import { createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { env } from '../utils/env.js';
import { HttpError } from '../utils/http-error.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { encrypt, secureCompare } from '../services/crypto.js';
import { logger } from '../utils/logger.js';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube'
];

const router = Router();

const createOAuthClient = () => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(500, 'GOOGLE_OAUTH_DISABLED', 'Google OAuth credentials are not configured');
  }
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URL);
};

const stateSchema = z.object({
  orgId: z.string().min(1),
  nonce: z.string().min(8),
  exp: z.number().int()
});

const encodeState = (payload: z.infer<typeof stateSchema>) => {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', env.KMS_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
};

const decodeState = (state: string) => {
  const [data, signature] = state.split('.');
  if (!data || !signature) {
    throw new HttpError(400, 'INVALID_STATE', 'Missing OAuth state signature');
  }
  const expected = createHmac('sha256', env.KMS_SECRET).update(data).digest('base64url');
  if (!secureCompare(signature, expected)) {
    throw new HttpError(400, 'INVALID_STATE', 'State signature mismatch');
  }
  const parsed = stateSchema.safeParse(
    JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
  );
  if (!parsed.success) {
    throw new HttpError(400, 'INVALID_STATE', 'Malformed OAuth state', parsed.error.flatten());
  }
  if (parsed.data.exp < Date.now()) {
    throw new HttpError(400, 'STATE_EXPIRED', 'OAuth session expired, restart binding');
  }
  return parsed.data;
};

const ensureOrgContext = (req: Request) => {
  const orgId = req.auth?.orgId;
  if (!orgId) {
    throw new HttpError(403, 'ORG_REQUIRED', 'Organization context required');
  }
  return orgId;
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

router.get(
  '/oauth/google/init',
  requireAuth,
  requirePermission('publish', 'admin'),
  asyncHandler(async (req, res) => {
    const orgId = ensureOrgContext(req);
    const oauth2 = createOAuthClient();
    const state = encodeState({
      orgId,
      nonce: randomBytes(12).toString('hex'),
      exp: Date.now() + 10 * 60 * 1000
    });
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state
    });
    res.json({ url });
  })
);

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

router.get(
  '/oauth/google/callback',
  asyncHandler(async (req, res) => {
    if (typeof req.query.error === 'string') {
      res.status(400).send(`OAuth error: ${req.query.error_description ?? req.query.error}`);
      return;
    }
    const parsed = callbackQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_CALLBACK', 'Invalid OAuth callback payload', parsed.error.flatten());
    }
    const state = decodeState(parsed.data.state);
    const oauth2 = createOAuthClient();
    const { tokens } = await oauth2.getToken(parsed.data.code);
    oauth2.setCredentials(tokens);
    const youtube = google.youtube('v3');
    const channels = await youtube.channels.list({
      auth: oauth2,
      part: ['snippet'],
      mine: true
    });
    const channel = channels.data.items?.[0];
    if (!channel?.id) {
      throw new HttpError(400, 'CHANNEL_NOT_FOUND', 'Unable to resolve YouTube channel for this account');
    }
    const scopes = tokens.scope ? tokens.scope.split(' ') : SCOPES;
    const cipher = encrypt(JSON.stringify(tokens));
    const binding = await prisma.channelBinding.upsert({
      where: {
        organizationId_provider_channelId: {
          organizationId: state.orgId,
          provider: 'youtube',
          channelId: channel.id
        }
      },
      update: {
        channelTitle: channel.snippet?.title ?? null,
        tokensRef: cipher,
        scopes: JSON.stringify(scopes),
        status: 'active',
        notes: `Updated at ${new Date().toISOString()}`
      },
      create: {
        organizationId: state.orgId,
        provider: 'youtube',
        channelId: channel.id,
        channelTitle: channel.snippet?.title ?? null,
        tokensRef: cipher,
        scopes: JSON.stringify(scopes),
        status: 'active',
        notes: `Connected at ${new Date().toISOString()}`
      }
    });
    logger.info({ channelId: channel.id, orgId: state.orgId }, 'YouTube channel bound');
    res.send(`
      <html>
        <body style="font-family: system-ui; text-align:center; padding:2rem;">
          <h2>Channel Connected</h2>
          <p>${binding.channelTitle ?? 'YouTube channel'} is now linked.</p>
          <script>setTimeout(() => window.close(), 1500);</script>
        </body>
      </html>
    `);
  })
);

export const oauthGoogleRouter = router;
