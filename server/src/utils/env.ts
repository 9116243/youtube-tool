import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  JWT_EXPIRES: z.string().default('7d'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  RATE_LIMIT_WINDOW: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  RUNWAY_API_KEY: z.string().optional(),
  RUNWAY_API_BASE: z.string().url().default('https://api.runwayml.com'),
  RUNWAY_PRICE_PER_MIN_FLASH: z.coerce.number().min(0).default(0),
  RUNWAY_PRICE_PER_MIN_ALPHA: z.coerce.number().min(0).default(0),
  RUNWAY_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(4),
  LUMA_API_KEY: z.string().optional(),
  LUMA_API_BASE: z.string().url().default('https://api.luma.ai'),
  LUMA_PRICE_PER_MIN_1080: z.coerce.number().min(0).default(0),
  LUMA_PRICE_PER_MIN_2K: z.coerce.number().min(0).default(0),
  LUMA_PRICE_PER_MIN_4K: z.coerce.number().min(0).default(0),
  LUMA_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  HAIPER_API_KEY: z.string().optional(),
  HAIPER_API_BASE: z.string().url().default('https://api.haiper.ai'),
  HAIPER_PRICE_PER_MIN_1080: z.coerce.number().min(0).default(0),
  HAIPER_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(6),
  DOMOAI_API_KEY: z.string().optional(),
  DOMOAI_API_BASE: z.string().url().default('https://api.domo.ai'),
  DOMOAI_PRICE_PER_MIN_EFFECT: z.coerce.number().min(0).default(0),
  DOMOAI_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(4),
  REPLICATE_API_TOKEN: z.string().optional(),
  REPLICATE_API_BASE: z.string().url().default('https://api.replicate.com'),
  REPLICATE_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(3),
  WORKSPACE_DIR: z.string().default('workspace'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  WORKER_MODE: z.enum(['inline', 'fork']).default('inline'),
  QUEUE_DRIVER: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().optional(),
});

export const appEnv = envSchema.parse(process.env);

export type AppEnv = typeof appEnv;
