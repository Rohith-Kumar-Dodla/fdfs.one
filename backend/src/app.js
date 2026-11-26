import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { handleError, notFound } from './middlewares/errors.js';
import { isCookieAuthPath } from './modules/auth/cookies.js';
import { createAuthRoutes } from './modules/auth/routes.js';
import { mountPhase22 } from './modules/admin/routes.js';
import { publicTalentRoutes } from './modules/talent/routes.js';
import { publicFilmRoutes } from './modules/films/routes.js';
import { requestContext } from './middlewares/request-context.js';
import { AppError } from './utils/app-error.js';
import { sendError, sendSuccess } from './utils/responses.js';

export function createApp({
  config,
  logger,
  isDatabaseConnected,
  authConfig,
  authOptions,
  phase22Options,
}) {
  const app = express();
  app.set('env', config.NODE_ENV);
  app.disable('x-powered-by');

  app.use(requestContext(logger));
  app.use(helmet());
  app.use(
    cors((req, done) =>
      done(null, {
        origin(origin, callback) {
          if (!origin) return callback(null, false);
          if (config.CORS_ORIGINS.includes(origin)) return callback(null, true);
          return callback(
            new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origin not allowed'),
          );
        },
        exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
        credentials: Boolean(authConfig && isCookieAuthPath(req.path)),
        maxAge: 600,
      }),
    ),
  );

  const api = express.Router();
  api.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, { status: 'ok' });
  });
  api.get('/ready', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!isDatabaseConnected()) {
      return sendError(res, {
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Application is not ready',
        details: { database: 'unavailable' },
      });
    }
    return sendSuccess(res, { status: 'ready', database: 'connected' });
  });

  api.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      limit: config.RATE_LIMIT_MAX,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler(req, res) {
        return sendError(res, {
          status: 429,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
        });
      },
    }),
  );
  api.use(express.json({ limit: '100kb' }));
  api.use('/talent', publicTalentRoutes(isDatabaseConnected));
  api.use('/films', publicFilmRoutes(isDatabaseConnected));

  if (authConfig) {
    const { auth, users } = createAuthRoutes(authConfig, logger, authOptions);
    api.use('/auth', auth);
    mountPhase22(api, authConfig, logger, {
      available: authOptions?.available,
      ...phase22Options,
    });
    api.use('/users', users);
  }

  app.use('/api/v1', api);
  app.use(notFound);
  app.use(handleError);
  return app;
}
