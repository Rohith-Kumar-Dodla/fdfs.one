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
        'mongoUri',
        'MONGODB_URI',
        '*.password',
        '*.token',
        '*.mongoUri',
        '*.MONGODB_URI',
      ],
      remove: true,
    },
  });
}
