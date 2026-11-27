import { randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadAuthConfig } from '../src/config/auth.js';
import { requireNamedDatabase } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { webSessionCookies } from '../src/modules/auth/cookies.js';
import { schemas } from '../src/modules/auth/schemas.js';
import { createEmailService } from '../src/services/email.js';
import {
  issueAccessToken,
  verifyAccessToken,
} from '../src/modules/auth/tokens.js';

const origin = 'https://web.example.test';
const config = {
  NODE_ENV: 'production',
  CORS_ORIGINS: [origin, 'https://another.example.test'],
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX: 1000,
};
const environment = {
  JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
  APP_WEB_URL: origin,
};
const authConfig = loadAuthConfig(config, environment);

describe('authentication security', () => {
  it('requires an explicit MongoDB database name and a validated web origin and signing key', () => {
    expect(() =>
      requireNamedDatabase('mongodb://localhost:27017/?retryWrites=true'),
    ).toThrow('intended database');
    expect(() =>
      requireNamedDatabase('mongodb://localhost:27017/fdfs?retryWrites=true'),
    ).not.toThrow();
    expect(() =>
      loadAuthConfig(config, { ...environment, JWT_ACCESS_SECRET: '' }),
    ).toThrow('JWT_ACCESS_SECRET');
    expect(() =>
      loadAuthConfig(config, {
        ...environment,
        APP_WEB_URL: 'http://localhost:5173',
      }),
    ).toThrow('allowed web origin');
    expect(() =>
      loadAuthConfig(config, {
        ...environment,
        SMTP_HOST: 'mail.example.test',
      }),
    ).toThrow('SMTP configuration');
  });

  it('validates JWT signature, algorithm, age, expiration, issuer and audience', () => {
    const user = { publicId: randomUUID() };
    const session = { publicId: randomUUID() };
    const good = issueAccessToken(authConfig, user, session);
    expect(verifyAccessToken(authConfig, good)).toMatchObject({
      sub: user.publicId,
      sid: session.publicId,
    });
    const claims = {
      sid: session.publicId,
      sub: user.publicId,
      iss: authConfig.issuer,
      aud: authConfig.audience,
    };
    const sign = (payload, options) =>
      jwt.sign(payload, authConfig.accessSecret, options);
    for (const token of [
      good.slice(0, -5) + 'wrong',
      sign(claims, { algorithm: 'HS384', expiresIn: 900 }),
      sign(claims, { expiresIn: -5 }),
      sign(claims),
      sign({ ...claims, iss: 'wrong' }, { expiresIn: 900 }),
      sign({ ...claims, aud: 'wrong' }, { expiresIn: 900 }),
    ]) {
      expect(() => verifyAccessToken(authConfig, token)).toThrow(
        'Please sign in',
      );
    }
  });

  it('rejects untrusted credentialed requests and only exposes credentialed CORS on cookie routes', async () => {
    const app = createApp({
      config,
      authConfig,
      logger: createLogger('silent'),
      isDatabaseConnected: () => false,
    });
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-FDFS-CSRF', '1')
      .expect(403);
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .expect(403);
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://another.example.test')
      .set('X-FDFS-CSRF', '1')
      .expect(403);
    await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-fdfs-csrf')
      .expect('Access-Control-Allow-Credentials', 'true')
      .expect(204);
    const health = await request(app)
      .get('/api/v1/health')
      .set('Origin', origin)
      .expect(200);
    expect(health.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('scopes production refresh cookies and rejects ambiguous duplicates', async () => {
    const app = createApp({
      config,
      authConfig,
      logger: createLogger('silent'),
      isDatabaseConnected: () => false,
    });
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('X-FDFS-CSRF', '1')
      .expect(401);
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toMatch(/^__Secure-fdfs_refresh=/);
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Domain=');
    const cookies = webSessionCookies(authConfig);
    expect(
      cookies.read({
        get: () => '__Secure-fdfs_refresh=old; __Secure-fdfs_refresh=new',
      }),
    ).toBeNull();
  });

  it('rejects excessive bcrypt byte length and unexpected permissions fields', () => {
    const registration = {
      fullName: 'Local Fixture',
      email: ' U.SER+TEST@Gmail.com ',
      password: 'long enough phrase',
    };
    expect(schemas.register.parse({ body: registration }).body.email).toBe(
      'user@gmail.com',
    );
    expect(
      schemas.register.safeParse({
        body: { ...registration, password: '🎞️'.repeat(20) },
      }).success,
    ).toBe(false);
    expect(
      schemas.register.safeParse({
        body: { ...registration, roles: ['admin'] },
      }).success,
    ).toBe(false);
    expect(
      schemas.profile.safeParse({
        body: { fullName: 'Changed', roles: ['admin'] },
      }).success,
    ).toBe(false);
  });

  it('limits authentication attempts before password processing', async () => {
    const app = createApp({
      config,
      authConfig,
      logger: createLogger('silent'),
      isDatabaseConnected: () => false,
    });
    const attempt = () =>
      request(app)
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-FDFS-CSRF', '1')
        .send({});
    for (let index = 0; index < 12; index++) await attempt().expect(400);
    const response = await attempt().expect(429);
    expect(response.body.error.code).toBe('AUTH_RATE_LIMIT');
  });

  it('keeps the API available when account email is disabled or delivery fails', async () => {
    const app = createApp({
      config,
      authConfig,
      logger: createLogger('silent'),
      isDatabaseConnected: () => false,
      authOptions: { available: () => true },
    });
    for (const action of [
      'register',
      'resend-verification',
      'forgot-password',
    ]) {
      const response = await request(app)
        .post('/api/v1/auth/' + action)
        .send({ email: 'reader@example.test' })
        .expect(503);
      expect(response.body.error.code).toBe('EMAIL_UNAVAILABLE');
    }
    await request(app).get('/api/v1/health').expect(200);

    const warn = vi.fn();
    const sendMail = vi
      .fn()
      .mockResolvedValueOnce({ accepted: [] })
      .mockRejectedValueOnce(new Error('SMTP connection timed out'))
      .mockResolvedValueOnce({ accepted: ['reader@example.test'] });
    const send = createEmailService(authConfig, { warn }, { sendMail });
    await expect(send('verification', 'reader@example.test')).resolves.toBe(
      false,
    );
    await expect(send('verification', 'reader@example.test')).resolves.toBe(
      false,
    );
    await expect(send('verification', 'reader@example.test')).resolves.toBe(
      true,
    );
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
