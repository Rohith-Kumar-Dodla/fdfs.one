import { z } from 'zod';

const envSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(43).max(1024),
  JWT_ISSUER: z.string().trim().min(1).default('fdfs.one'),
  JWT_AUDIENCE: z.string().trim().min(1).default('fdfs-api'),
  JWT_ACCESS_TTL: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(12),
  APP_WEB_URL: z.url().default('http://localhost:5173'),
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().trim().optional(),
});

export function loadAuthConfig(config, env = process.env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path[0]);
    throw new Error(
      `Invalid authentication configuration for ${[...new Set(fields)].join(', ')}. See .env.example.`,
    );
  }

  const values = result.data;
  const web = new URL(values.APP_WEB_URL);
  const secure = config.NODE_ENV === 'production';
  if (
    web.origin !== values.APP_WEB_URL ||
    !['http:', 'https:'].includes(web.protocol) ||
    (secure && web.protocol !== 'https:') ||
    !config.CORS_ORIGINS.includes(web.origin)
  ) {
    throw new Error(
      'APP_WEB_URL must be an allowed web origin, with HTTPS in production.',
    );
  }

  if (
    Boolean(values.SMTP_HOST) !== Boolean(values.EMAIL_FROM) ||
    Boolean(values.SMTP_USER) !== Boolean(values.SMTP_PASS) ||
    ((values.SMTP_USER || values.SMTP_PASS) && !values.SMTP_HOST)
  ) {
    throw new Error(
      'SMTP configuration requires SMTP_HOST and EMAIL_FROM, and both SMTP_USER and SMTP_PASS when authenticating.',
    );
  }

  return {
    secure,
    webOrigin: web.origin,
    accessSecret: values.JWT_ACCESS_SECRET,
    issuer: values.JWT_ISSUER,
    audience: values.JWT_AUDIENCE,
    accessTtl: values.JWT_ACCESS_TTL,
    sessionMs: values.REFRESH_TOKEN_TTL_DAYS * 86400000,
    bcryptCost: values.BCRYPT_COST,
    smtp: values.SMTP_HOST
      ? {
          host: values.SMTP_HOST,
          port: values.SMTP_PORT,
          secure: values.SMTP_SECURE,
          from: values.EMAIL_FROM,
          auth: values.SMTP_USER
            ? { user: values.SMTP_USER, pass: values.SMTP_PASS }
            : undefined,
        }
      : null,
  };
}
