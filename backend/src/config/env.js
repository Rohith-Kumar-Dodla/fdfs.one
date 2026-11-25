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

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path[0]);
    throw new Error(
      `Invalid configuration for ${[...new Set(fields)].join(', ')}. See .env.example and BACKEND.md.`,
    );
  }
  return result.data;
}
