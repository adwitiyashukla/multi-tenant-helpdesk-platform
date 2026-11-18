import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

function loadEnvFiles() {
  let directory = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    for (const file of ['.env.local', '.env']) {
      const path = resolve(directory, file);
      if (existsSync(path)) {
        process.loadEnvFile(path);
        return;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return;
    }
    directory = parent;
  }
}

loadEnvFiles();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(16),
  SESSION_COOKIE_NAME: z.string().default('helpdesk_session'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(168),
  COOKIE_SAMESITE: z.enum(['lax', 'none', 'strict']).default('lax'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  COOKIE_DOMAIN: z.string().optional(),
  INBOUND_EMAIL_SECRET: z.string().min(8),
  INBOUND_EMAIL_DOMAIN: z.string().default('inbox.helpdesk.test'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('helpdesk-attachments'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(600),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`invalid environment configuration\n${issues}`);
}

export const env = parsed.data;
export const billingEnabled = Boolean(
  env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID && env.STRIPE_WEBHOOK_SECRET,
);
export const storageEnabled = Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY);
