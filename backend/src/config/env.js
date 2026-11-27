import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

function isHttpOrigin(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\/[^\s]+$/),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.string().refine(isHttpOrigin))),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1)
    .max(2147483647)
    .default(900000),
  LIVE_CHAT_ENABLED: z.stringbool().default(false),
  YOUTUBE_DATA_API_KEY: z.string().trim().optional(),
  LIVE_REMINDER_LEAD_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(15),
  LIVE_REMINDER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(3600000)
    .default(60000),
  PRESENCE_HEARTBEAT_MS: z.coerce
    .number()
    .int()
    .min(10000)
    .max(120000)
    .default(30000),
  PRESENCE_STALE_MS: z.coerce
    .number()
    .int()
    .min(30000)
    .max(360000)
    .default(90000),
  ANALYTICS_ENABLED: z.stringbool().default(true),
  ANALYTICS_RAW_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  ANALYTICS_AGGREGATE_DAYS: z.coerce
    .number()
    .int()
    .min(90)
    .max(730)
    .default(365),
  ANALYTICS_TIMEZONE: z
    .string()
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    })
    .default('Asia/Kolkata'),
  SUPPORT_ATTACHMENTS: z.stringbool().default(true),
  SUPPORT_ATTACHMENT_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  SUPPORT_EMAIL_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  SUPPORT_STAFF_EMAIL: z.stringbool().default(false),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
});

export function loadConfig() {
  try {
    loadEnvFile(rootEnvPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error('Unable to read the root .env file.', { cause: error });
    }
  }

  const result = envSchema
    .refine(
      (value) => value.PRESENCE_STALE_MS >= value.PRESENCE_HEARTBEAT_MS * 2,
      { path: ['PRESENCE_STALE_MS'] },
    )
    .safeParse(process.env);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path[0]);
    throw new Error(
      `Invalid configuration for ${[...new Set(fields)].join(', ')}. See .env.example and BACKEND.md.`,
    );
  }
  return result.data;
}

export function requireNamedDatabase(uri) {
  if (!/^mongodb(?:\+srv)?:\/\/[^/?#]+\/[^/?#]+(?:\?|$)/.test(uri)) {
    throw new Error(
      'Specify the intended database in the MONGODB_URI path before enabling accounts.',
    );
  }
}
