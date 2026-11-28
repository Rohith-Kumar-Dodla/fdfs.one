import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import bcrypt from 'bcrypt';
import express from 'express';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { handleError } from '../src/middlewares/errors.js';
import { requestContext } from '../src/middlewares/request-context.js';
import {
  requireActiveAccount,
  requireAuthentication,
  requireOwner,
  requireRoles,
  requireVerifiedEmail,
} from '../src/modules/auth/authorization.js';
import {
  initializeAuthIndexes,
  Session,
  User,
} from '../src/modules/auth/models.js';
import { createSessionService } from '../src/modules/auth/sessions.js';

const uri = process.env.TEST_MONGODB_URI;
const database = `fdfs_auth_test_${randomUUID().replaceAll('-', '')}`;
const webOrigin = 'http://localhost:5173';
const logger = createLogger('silent');
const config = {
  NODE_ENV: 'test',
  CORS_ORIGINS: [webOrigin],
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX: 1000,
};
const authConfig = {
  webOrigin,
  secure: false,
  accessSecret: randomBytes(48).toString('hex'),
  issuer: 'fdfs-test',
  audience: 'fdfs-api-test',
  accessTtl: 900,
  bcryptCost: 10,
  sessionMs: 30 * 86400000,
  smtp: { from: 'FDFS <mail@example.test>' },
};
const registration = {
  fullName: 'Test Account',
  email: 'fixture@gmail.com',
  password: 'isolated test phrase',
};
const newPassword = 'another isolated phrase';
const prefix = '/api/v1/auth/';
const agent = (app) => request(app);
const send = (app, path, data) =>
  agent(app)
    .post(prefix + path)
    .send(data);
const withBrowser = (operation) =>
  operation.set('Origin', webOrigin).set('X-FDFS-CSRF', '1');
const protectedRequest = (operation, token) =>
  operation.set('Authorization', `Bearer ${token}`);
const cookieOf = (response) => response.headers['set-cookie'][0].split(';')[0];

let app;
let outbox;
let failDelivery;
const mailer = nodemailer.createTransport({ jsonTransport: true });
const mailTransport = {
  async sendMail(message) {
    if (failDelivery) return { accepted: [] };
    const result = await mailer.sendMail(message);
    outbox.push(JSON.parse(result.message.toString()));
    return { accepted: [message.to] };
  },
};

async function delivered(index = 0) {
  const tokens = () =>
    outbox
      .map(({ text }) => text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1])
      .filter(Boolean);
  await expect.poll(() => tokens()[index]).toBeTruthy();
  return tokens()[index];
}

function verificationCode(index = 0) {
  const messages = outbox.filter(
    ({ subject }) => subject === 'Verify your Gmail — FDFS.ONE',
  );
  return messages[index]?.text.match(/(?:^|\n)([0-9]{6})(?:\n|$)/)?.[1];
}
const startVerification = (email = registration.email) =>
  withBrowser(
    send(app, 'verification-session', {
      email,
      password: registration.password,
    }),
  );
const verificationRequest = (cookie, path, body) => {
  const operation = send(app, path, body);
  return withBrowser(operation.set('Cookie', cookie));
};
const register = async () => {
  await send(app, 'register', registration).expect(202);
  return startVerification().expect(200);
};
const verify = async () => {
  const pending = await login().expect(403);
  return verificationRequest(cookieOf(pending), 'verify-email', {
    code: verificationCode(),
  }).expect(200);
};
const registerVerified = async () => {
  await register();
  await verify();
};
const login = (
  password = registration.password,
  browser = 'Local test device',
) =>
  withBrowser(
    send(app, 'login', { email: registration.email, password }).set(
      'User-Agent',
      browser,
    ),
  );
const me = (token) =>
  protectedRequest(agent(app).get('/api/v1/users/me'), token);
const refresh = (cookie) =>
  withBrowser(
    agent(app)
      .post(prefix + 'refresh')
      .set('Cookie', cookie),
  );

describe.skipIf(!uri)(
  'account and session storage using isolated MongoDB',
  () => {
    beforeAll(async () => {
      const target = new URL(uri);
      if (
        target.protocol !== 'mongodb:' ||
        target.hostname !== '127.0.0.1' ||
        !target.port ||
        target.username ||
        target.password ||
        target.search ||
        target.pathname.includes(',')
      ) {
        throw new Error(
          'TEST_MONGODB_URI must refer to a local, unauthenticated loopback MongoDB server.',
        );
      }
      await mongoose.connect(uri, {
        dbName: database,
        autoIndex: false,
        serverSelectionTimeoutMS: 3000,
      });
      if (mongoose.connection.name !== database)
        throw new Error('Unexpected isolated database name.');
      await initializeAuthIndexes();
    });

    beforeEach(async () => {
      await Promise.all([User.deleteMany({}), Session.deleteMany({})]);
      outbox = [];
      failDelivery = false;
      app = createApp({
        config,
        authConfig,
        logger,
        isDatabaseConnected: () => true,
        authOptions: { mailTransport },
      });
    });
    afterEach(() => vi.restoreAllMocks());

    afterAll(async () => {
      if (mongoose.connection.name === database)
        await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });

    it('registers exactly one normalized viewer under concurrent duplicate submissions', async () => {
      await send(app, 'register', {
        ...registration,
        email: 'fixture@example.test',
      }).expect(400);
      const first = send(app, 'register', {
        ...registration,
        email: ' FIX.TURE+ALIAS@gmail.com ',
      });
      const second = send(app, 'register', registration);
      const results = await Promise.all([
        first.expect(202),
        second.expect(202),
      ]);
      expect(results[0].body).toEqual(results[1].body);
      expect(results[0].body.data).toEqual({});
      await Promise.all([
        startVerification('fix.ture+test@gmail.com').expect(200),
        startVerification().expect(200),
      ]);
      const code = verificationCode();
      expect(code).toMatch(/^[0-9]{6}$/);
      expect(outbox).toHaveLength(1);
      const users = await User.find().select(
        '+passwordHash +emailVerification',
      );
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({
        email: registration.email,
        roles: ['viewer'],
        emailVerifiedAt: null,
      });
      expect(
        await bcrypt.compare(registration.password, users[0].passwordHash),
      ).toBe(true);
      expect(users[0].emailVerification.code.digest).toMatch(/^[a-f0-9]{64}$/);
      expect(users[0].emailVerification.code.digest).not.toBe(code);
    });

    it('logs in valid accounts, rejects invalid credentials and hides private auth fields', async () => {
      await send(app, 'register', { ...registration, fullName: '' }).expect(
        400,
      );
      await register();
      const rejected = await login('incorrect test phrase').expect(401);
      const unknown = await withBrowser(
        send(app, 'login', {
          email: 'unknown@example.test',
          password: 'incorrect test phrase',
        }),
      ).expect(401);
      expect(rejected.body).toEqual(unknown.body);
      await login().expect(403);
      await verify();
      await expect
        .poll(
          () =>
            outbox.filter(({ subject }) => subject === 'Welcome to FDFS.ONE')
              .length,
        )
        .toBe(1);
      const response = await login().expect(200);
      expect(Object.keys(response.body.data).sort()).toEqual([
        'accessToken',
        'sessionId',
      ]);
      expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
      const user = (await me(response.body.data.accessToken).expect(200)).body
        .data;
      expect(user).toMatchObject({
        email: registration.email,
        roles: ['viewer'],
        emailVerified: true,
      });
      for (const field of [
        'passwordHash',
        'passwordReset',
        'refreshHash',
        'verification',
        'emailVerification',
        'authVersion',
        '_id',
      ]) {
        expect(user).not.toHaveProperty(field);
      }
      await agent(app).get('/api/v1/users/me').expect(401);
    });

    it('persists the resend window, rejects concurrent sends and rotates the accepted code', async () => {
      const start = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
      const initial = await register();
      const cookie = cookieOf(initial);
      const resend = () => verificationRequest(cookie, 'resend-verification');
      const status = () =>
        verificationRequest(cookie, 'verification-status').expect(200);
      const verifyCode = (code) =>
        verificationRequest(cookie, 'verify-email', { code });
      const first = verificationCode();
      expect(initial.body.data).toMatchObject({
        delivery: 'accepted',
        remainingRequests: 2,
        expiresAt: start + 600_000,
        retryAt: start + 60_000,
      });
      await refresh(cookie).expect(401);
      const limited = await resend().expect(429);
      expect(limited.headers['retry-after']).toBe('60');
      expect((await status()).body.data).toEqual(initial.body.data);
      clock.mockReturnValue(start + 60_000);
      const concurrent = await Promise.all([resend(), resend()]);
      expect(concurrent.map(({ status }) => status).sort()).toEqual([202, 429]);
      expect(outbox).toHaveLength(2);
      expect(verificationCode(1)).not.toBe(first);
      expect((await verifyCode(first).expect(400)).body.error.code).toBe(
        'INVALID_VERIFICATION_CODE',
      );
      clock.mockReturnValue(start + 120_000);
      await resend().expect(202);
      const max = await resend().expect(429);
      expect(max.headers['retry-after']).toBe('1680');
      expect(max.body.error.details.remainingRequests).toBe(0);
      await login().expect(403);
      await startVerification('fix.ture+again@gmail.com').expect(200);
      expect(outbox).toHaveLength(3);
      const code = verificationCode(2);
      const results = await Promise.all([verifyCode(code), verifyCode(code)]);
      expect(results.map(({ status }) => status).sort()).toEqual([200, 401]);
      await verifyCode(code).expect(401);
      expect(
        outbox.filter(({ subject }) => subject === 'Welcome to FDFS.ONE'),
      ).toHaveLength(1);
      await login().expect(200);
    });

    it('recovers legacy and rejected sends, caps OTP guesses, and reopens a 30 minute window', async () => {
      const start = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
      await send(app, 'register', registration).expect(202);
      await User.updateOne(
        {},
        {
          $set: {
            verification: {
              hash: 'legacy-link-digest',
              issuedAt: new Date(start - 60_000),
              expiresAt: new Date(start + 86_400_000),
            },
          },
        },
      );
      const pending = await login().expect(403);
      expect(outbox).toHaveLength(0);
      const cookie = cookieOf(pending);
      const resend = () => verificationRequest(cookie, 'resend-verification');
      const verifyCode = (code) =>
        verificationRequest(cookie, 'verify-email', { code });
      await verificationRequest('', 'verification-status').expect(401);
      await resend().expect(202);
      const first = verificationCode();
      clock.mockReturnValue(start + 60_000);
      failDelivery = true;
      const rejected = await resend().expect(503);
      expect(rejected.body.error.details).toMatchObject({
        delivery: 'failed',
        expiresAt: start + 600_000,
        remainingRequests: 0,
      });
      const bad = first === '000000' ? '000001' : '000000';
      for (let i = 0; i < 4; i++)
        expect((await verifyCode(bad).expect(400)).body.error.code).toBe(
          'INVALID_VERIFICATION_CODE',
        );
      expect((await verifyCode(bad).expect(400)).body.error.code).toBe(
        'VERIFICATION_ATTEMPTS_EXHAUSTED',
      );
      expect((await verifyCode(first).expect(400)).body.error.code).toBe(
        'VERIFICATION_ATTEMPTS_EXHAUSTED',
      );
      clock.mockReturnValue(start + 600_000);
      expect((await verifyCode(first).expect(400)).body.error.code).toBe(
        'VERIFICATION_CODE_EXPIRED',
      );
      clock.mockReturnValue(start + 1_739_000);
      await resend().expect(429);
      clock.mockReturnValue(start + 1_740_000);
      failDelivery = false;
      await resend().expect(202);
      await verifyCode(verificationCode(1)).expect(200);
      await login().expect(200);
    });

    it('expires password reset links and invalidates every prior session after reset', async () => {
      await registerVerified();
      const session = await login().expect(200);
      const known = await send(app, 'forgot-password', {
        email: 'F.IXTURE+RESET@gmail.com',
      }).expect(202);
      const unknown = await send(app, 'forgot-password', {
        email: 'other@example.test',
      }).expect(202);
      expect(known.body).toEqual(unknown.body);
      const expired = await delivered();
      await User.updateOne(
        {},
        {
          $set: {
            'passwordReset.expiresAt': new Date(0),
            'passwordReset.issuedAt': new Date(0),
          },
        },
      );
      await send(app, 'reset-password', {
        token: expired,
        password: newPassword,
      }).expect(400);
      await send(app, 'forgot-password', { email: registration.email }).expect(
        202,
      );
      const token = await delivered(1);
      await send(app, 'reset-password', {
        token,
        password: newPassword,
      }).expect(200);
      await send(app, 'reset-password', {
        token,
        password: registration.password,
      }).expect(400);
      await me(session.body.data.accessToken).expect(401);
      await refresh(cookieOf(session)).expect(401);
      await login().expect(401);
      await login(newPassword).expect(200);
    });

    it('claims and acknowledges the welcome modal once per verified account', async () => {
      await registerVerified();
      const first = await login().expect(200);
      const second = await login().expect(200);
      const welcome = (session, action) =>
        protectedRequest(
          agent(app).post('/api/v1/users/me/welcome').send({ action }),
          session.body.data.accessToken,
        ).expect(200);
      const responses = await Promise.all([
        welcome(first, 'present'),
        welcome(second, 'present'),
      ]);
      expect(responses.filter(({ body }) => body.data.show)).toHaveLength(1);
      await welcome(first, 'acknowledge');
      expect(
        (await User.findOne({ email: registration.email }))
          .welcomeAcknowledgedAt,
      ).toBeInstanceOf(Date);
      expect((await welcome(second, 'present')).body.data.show).toBe(false);
    });

    it('requires the current password to change passwords and revokes other logged-in devices', async () => {
      await registerVerified();
      const first = await login().expect(200);
      const second = await login(
        registration.password,
        'Second fixture device',
      ).expect(200);
      const change = (currentPassword) =>
        protectedRequest(
          send(app, 'change-password', {
            currentPassword,
            password: newPassword,
          }),
          first.body.data.accessToken,
        );
      await change('incorrect phrase').expect(400);
      await change(registration.password).expect(200);
      await me(first.body.data.accessToken).expect(401);
      await me(second.body.data.accessToken).expect(401);
      await login(newPassword).expect(200);
    });

    it('rotates one concurrent refresh and revokes a recognized replay outside the overlap window', async () => {
      await registerVerified();
      const original = await login().expect(200);
      const otherDevice = await login().expect(200);
      const oldCookie = cookieOf(original);
      const results = await Promise.all([
        refresh(oldCookie),
        refresh(oldCookie),
      ]);
      expect(results.map((reply) => reply.status).sort()).toEqual([200, 409]);
      const rotated = results.find((reply) => reply.status === 200);
      const conflict = results.find((reply) => reply.status === 409);
      expect(conflict.headers['set-cookie']).toBeUndefined();
      expect(cookieOf(rotated)).not.toBe(oldCookie);
      expect(rotated.body.data.sessionId).toBe(original.body.data.sessionId);
      await Session.updateOne(
        { publicId: original.body.data.sessionId },
        { $set: { 'used.0.usedAt': new Date(0) } },
      );
      await refresh(oldCookie).expect(401);
      await refresh(cookieOf(rotated)).expect(401);
      await me(rotated.body.data.accessToken).expect(401);
      await me(otherDevice.body.data.accessToken).expect(200);
    });

    it('enforces expiry in requests and allows a user to revoke only their own sessions', async () => {
      await registerVerified();
      const first = await login().expect(200);
      const second = await login().expect(200);
      const token = first.body.data.accessToken;
      const list = await protectedRequest(
        agent(app).get(prefix + 'sessions'),
        token,
      ).expect(200);
      expect(list.body.data).toHaveLength(2);
      expect(list.body.data.filter(({ current }) => current)).toHaveLength(1);
      const revoke = (id) =>
        protectedRequest(agent(app).delete(prefix + 'sessions/' + id), token);
      await revoke(randomUUID()).expect(404);
      await revoke(second.body.data.sessionId).expect(200);
      await me(second.body.data.accessToken).expect(401);
      await Session.updateOne(
        { publicId: first.body.data.sessionId },
        { $set: { expiresAt: new Date(0) } },
      );
      await me(token).expect(401);
      await refresh(cookieOf(first)).expect(401);
    });

    it('supports current-session logout and invalidates all sessions with logout-all', async () => {
      await registerVerified();
      const first = await login().expect(200);
      const second = await login().expect(200);
      const single = await withBrowser(
        agent(app)
          .post(prefix + 'logout')
          .set('Cookie', cookieOf(first)),
      ).expect(200);
      expect(single.headers['set-cookie'][0]).toContain('fdfs_refresh=;');
      await me(first.body.data.accessToken).expect(401);
      await me(second.body.data.accessToken).expect(200);
      await protectedRequest(
        agent(app).post(prefix + 'logout-all'),
        second.body.data.accessToken,
      ).expect(200);
      await me(second.body.data.accessToken).expect(401);
    });

    it('reads current roles and account status, enforces verified email and prevents profile escalation', async () => {
      await send(app, 'register', { ...registration, roles: ['admin'] }).expect(
        400,
      );
      await register();
      await login().expect(403);
      await verify();
      const session = await login().expect(200);
      const accessToken = session.body.data.accessToken;
      const update = (data) =>
        protectedRequest(
          agent(app).patch('/api/v1/users/me').send(data),
          accessToken,
        );
      await update({ fullName: 'Changed account', roles: ['admin'] }).expect(
        400,
      );
      const profile = await update({
        fullName: 'Changed account',
        preferences: { emailUpdates: true },
      }).expect(200);
      expect(profile.body.data).toMatchObject({
        fullName: 'Changed account',
        roles: ['viewer'],
        preferences: { emailUpdates: true },
      });

      const fixture = express();
      fixture.use(requestContext(logger));
      fixture.get(
        '/verified',
        requireAuthentication(createSessionService(authConfig)),
        requireActiveAccount,
        requireVerifiedEmail,
        requireRoles('admin'),
        requireOwner((req) => req.auth.user._id),
        (req, res) => res.sendStatus(204),
      );
      fixture.use(handleError);
      const authorized = () =>
        protectedRequest(agent(fixture).get('/verified'), accessToken);
      await User.updateOne({}, { $unset: { emailVerifiedAt: 1 } });
      expect((await authorized().expect(403)).body.error.code).toBe(
        'EMAIL_NOT_VERIFIED',
      );
      await User.updateOne({}, { $set: { emailVerifiedAt: new Date() } });
      expect((await authorized().expect(403)).body.error.code).toBe(
        'FORBIDDEN',
      );
      await User.updateOne({}, { $addToSet: { roles: 'admin' } });
      await authorized().expect(204);
      await User.updateOne({}, { $set: { status: 'suspended' } });
      await authorized().expect(403);
      await me(accessToken).expect(403);
      await refresh(cookieOf(session)).expect(401);
      await login().expect(401);
    });

    it('bootstraps a single verified administrator even with competing operators', async () => {
      async function bootstrap(email) {
        const target = new URL(uri);
        target.pathname = '/' + database;
        const child = spawn(
          process.execPath,
          [
            'src/modules/auth/bootstrap-admin.js',
            '--email',
            email,
            '--confirm',
            email,
          ],
          {
            env: {
              ...process.env,
              MONGODB_URI: target.href,
              LOG_LEVEL: 'silent',
            },
            stdio: 'ignore',
          },
        );
        const [code] = await once(child, 'exit');
        return code;
      }

      await register();
      expect(await bootstrap(registration.email)).toBe(1);
      const secondEmail = 'secondadmin@gmail.com';
      await send(app, 'register', {
        ...registration,
        email: secondEmail,
      }).expect(202);
      await User.updateMany({}, { $set: { emailVerifiedAt: new Date() } });
      const codes = await Promise.all([
        bootstrap(registration.email),
        bootstrap(secondEmail),
      ]);
      expect(codes.sort()).toEqual([0, 1]);
      expect(await User.countDocuments({ roles: 'admin' })).toBe(1);
    }, 10000);
  },
);
