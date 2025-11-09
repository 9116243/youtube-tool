import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(8),
  DATABASE_URL: z.string().min(1),
  ORG_DEFAULT_NAME: z.string().default('Default Organization'),
  API_KEY_PREFIX: z.string().default('ytb_'),
  ASR_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  TTS_PROVIDER: z.enum(['mock', 'elevenlabs', 'azure']).default('mock'),
  CONCURRENCY: z.coerce.number().int().min(1).default(2),
  FAIL_RATE: z.coerce.number().min(0).max(100).default(0),
  QUEUE_DRIVER: z.enum(['memory', 'redis']).default('memory'),
  WORKER_MODE: z.enum(['inline', 'fork']).default('inline'),
  REDIS_URL: z.string().optional(),
  QUEUE_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  QUEUE_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  QUEUE_RETRY_BASE_MS: z.coerce.number().int().min(100).default(1000),
  QUEUE_RETRY_MAX_MS: z.coerce.number().int().min(1000).default(30000),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
  DEFAULT_RENDER_PRESET: z.string().default('2160p:h264:auto'),
  RATE_LIMIT_PER_ORG: z.coerce.number().int().min(1).default(300),
  GEN_QUOTA_MIN_PER_DAY: z.coerce.number().int().min(1).default(120),
  GEN_QUOTA_CONCURRENCY: z.coerce.number().int().min(1).default(2)
});

export const env = envSchema.parse(process.env);
