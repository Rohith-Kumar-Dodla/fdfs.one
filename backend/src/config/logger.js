import pino from 'pino';

export function createLogger(level) {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'password',
        'token',
        'passwordHash',
        'accessToken',
        'refreshToken',
        'JWT_ACCESS_SECRET',
        'SMTP_PASS',
        'mongoUri',
        'MONGODB_URI',
        '*.password',
        '*.token',
        '*.currentPassword',
        '*.passwordHash',
        '*.accessToken',
        '*.refreshToken',
        '*.JWT_ACCESS_SECRET',
        '*.SMTP_PASS',
        '*.mongoUri',
        '*.MONGODB_URI',
      ],
      remove: true,
    },
  });
}
