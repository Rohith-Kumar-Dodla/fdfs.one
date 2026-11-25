import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { handleError } from '../src/middlewares/errors.js';
import { requestContext } from '../src/middlewares/request-context.js';
import { validate } from '../src/middlewares/validate.js';
import { isDatabaseConnected } from '../src/services/database.js';
import { AppError } from '../src/utils/app-error.js';
import { paginationSchema } from '../src/utils/pagination.js';
import { sendSuccess } from '../src/utils/responses.js';

const config = {
  NODE_ENV: 'production',
  CORS_ORIGINS: ['http://localhost:5173'],
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX: 2,
};
const logger = createLogger('silent');

describe('application', () => {
  let app;
  beforeEach(() => {
    app = createApp({ config, logger, isDatabaseConnected });
  });

  it('reports liveness independently of the database', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Request completed successfully',
      data: { status: 'ok' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns 503 when the database is disconnected', async () => {
    const response = await request(app).get('/api/v1/ready').expect(503);
    expect(response.body).toEqual({
      success: false,
      message: 'Application is not ready',
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        details: { database: 'unavailable' },
      },
    });
  });

  it('shows the readiness success contract with an injected dependency state', async () => {
    const readyApp = createApp({
      config,
      logger,
      isDatabaseConnected: () => true,
    });
    const response = await request(readyApp).get('/api/v1/ready').expect(200);
    expect(response.body.data).toEqual({
      status: 'ready',
      database: 'connected',
    });
  });

  it('returns a standardized response for unknown routes', async () => {
    const response = await request(app).get('/api/v1/missing').expect(404);
    expect(response.body).toEqual({
      success: false,
      message: 'Route not found',
      error: { code: 'NOT_FOUND' },
    });
  });

  it('preserves a valid request ID and generates IDs for missing and invalid values', async () => {
    const id = 'a431590e-d62b-4671-b67f-ac5381028069';
    const first = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', id);
    const second = await request(app).get('/api/v1/health');
    const third = await request(app)
      .get('/api/v1/ready')
      .set('X-Request-Id', 'invalid');
    expect(first.headers['x-request-id']).toBe(id);
    for (const response of [second, third]) {
      expect(response.headers['x-request-id']).toMatch(
        /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
      );
    }
    expect(second.headers['x-request-id']).not.toBe(
      third.headers['x-request-id'],
    );
  });

  it('normalizes malformed JSON and oversized request errors', async () => {
    const malformed = await request(app)
      .post('/api/v1/missing')
      .type('json')
      .send('{"value":')
      .expect(400);
    const oversized = await request(app)
      .post('/api/v1/missing')
      .send({ value: 'a'.repeat(102401) })
      .expect(413);
    expect(malformed.body.error).toEqual({ code: 'INVALID_JSON' });
    expect(oversized.body.error).toEqual({ code: 'BODY_TOO_LARGE' });
  });

  it('enforces the origin allowlist while exposing request IDs to approved browsers', async () => {
    const approved = await request(app)
      .get('/api/v1/health')
      .set('Origin', config.CORS_ORIGINS[0])
      .expect(200);
    expect(approved.headers['access-control-allow-origin']).toBe(
      config.CORS_ORIGINS[0],
    );
    expect(approved.headers['access-control-expose-headers']).toContain(
      'X-Request-Id',
    );
    const rejected = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://unlisted.example')
      .expect(403);
    expect(rejected.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('rate limits versioned routes with a standardized error and keeps health probeable', async () => {
    await request(app).get('/api/v1/missing').expect(404);
    await request(app).get('/api/v1/missing').expect(404);
    const response = await request(app).get('/api/v1/missing').expect(429);
    expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(response.headers.ratelimit).toBeDefined();
    await request(app).get('/api/v1/health').expect(200);
  });
});

describe('validation and error middleware', () => {
  let app;
  beforeEach(() => {
    app = express();
    app.set('env', 'production');
    app.use(requestContext(logger));
    app.get(
      '/validation',
      validate(z.object({ query: paginationSchema })),
      (req, res) => sendSuccess(res, res.locals.validated.query),
    );
    app.get('/expected-error', async () => {
      throw new AppError(409, 'CONFLICT', 'Resource already exists');
    });
    app.get('/unexpected-error', async () => {
      throw new Error('Internal database credentials');
    });
    app.use(handleError);
  });

  it('returns field paths and validation codes without echoing inputs', async () => {
    const response = await request(app)
      .get('/validation?limit=private-input')
      .expect(400);
    expect(response.body).toEqual({
      success: false,
      message: 'Request validation failed',
      error: {
        code: 'VALIDATION_ERROR',
        details: [{ path: 'query.limit', code: 'invalid_format' }],
      },
    });
    expect(response.text).not.toContain('private-input');
  });

  it('applies pagination defaults and coerces valid query parameters', async () => {
    const defaults = await request(app).get('/validation').expect(200);
    const supplied = await request(app)
      .get('/validation?page=3&limit=15')
      .expect(200);
    expect(defaults.body.data).toEqual({ page: 1, limit: 20 });
    expect(supplied.body.data).toEqual({ page: 3, limit: 15 });
    await request(app).get('/validation?limit=101').expect(400);
    await request(app).get('/validation?page=1&page=2').expect(400);
  });

  it('handles rejected route promises with a known application error', async () => {
    const response = await request(app).get('/expected-error').expect(409);
    expect(response.body).toEqual({
      success: false,
      message: 'Resource already exists',
      error: { code: 'CONFLICT' },
    });
  });

  it('sanitizes unexpected errors in production', async () => {
    const response = await request(app).get('/unexpected-error').expect(500);
    expect(response.body).toEqual({
      success: false,
      message: 'An internal server error occurred',
      error: { code: 'INTERNAL_ERROR' },
    });
  });
});
