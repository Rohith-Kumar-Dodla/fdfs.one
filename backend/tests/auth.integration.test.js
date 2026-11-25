import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import bcrypt from 'bcrypt';
import express from 'express';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  email: 'fixture@example.test',
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
const mailer = nodemailer.createTransport({ jsonTransport: true });
const mailTransport = {
  async sendMail(message) {
    const result = await mailer.sendMail(message);
    outbox.push(JSON.parse(result.message.toString()));
  },
};

async function delivered(index = 0) {
  await expect.poll(() => outbox[index]?.text).toBeTruthy();
  return outbox[index].text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
}

const register = () => send(app, 'register', registration).expect(202);
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
      app = createApp({
        config,
        authConfig,
        logger,
        isDatabaseConnected: () => true,
        authOptions: { mailTransport },
      });
    });

    afterAll(async () => {
      if (mongoose.connection.name === database)
        await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });

    it('registers exactly one normalized viewer under concurrent duplicate submissions', async () => {
      const first = send(app, 'register', {
        ...registration,
        email: ' FIXTURE@example.test ',
      });
      const second = send(app, 'register', registration);
      const results = await Promise.all([
        first.expect(202),
        second.expect(202),
      ]);
      expect(results[0].body).toEqual(results[1].body);
      expect(results[0].body.data).toEqual({});
      const token = await delivered();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(outbox).toHaveLength(1);
      const users = await User.find().select('+passwordHash +verification');
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({
        email: registration.email,
        roles: ['viewer'],
        emailVerifiedAt: null,
      });
      expect(
        await bcrypt.compare(registration.password, users[0].passwordHash),
      ).toBe(true);
      expect(users[0].verification.hash).not.toBe(token);
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
        emailVerified: false,
      });
      for (const field of [
        'passwordHash',
        'passwordReset',
        'refreshHash',
        'verification',
        'authVersion',
        '_id',
      ]) {
        expect(user).not.toHaveProperty(field);
      }
      await agent(app).get('/api/v1/users/me').expect(401);
    });

    it('rejects expired and replayed verification links and throttles resends', async () => {
      await register();
      const expired = await delivered();
      await User.updateOne(
        {},
        { $set: { 'verification.expiresAt': new Date(0) } },
      );
      await send(app, 'verify-email', {
        token: expired,
        password: registration.password,
      }).expect(400);
      await send(app, 'resend-verification', {
        email: registration.email,
      }).expect(202);
      expect(outbox).toHaveLength(1);
      await User.updateOne(
        {},
        { $set: { 'verification.issuedAt': new Date(0) } },
      );
      await send(app, 'resend-verification', {
        email: registration.email,
      }).expect(202);
      const token = await delivered(1);
      expect(token).not.toBe(expired);
      await send(app, 'verify-email', {
        token,
        password: 'wrong phrase',
      }).expect(400);
      await send(app, 'verify-email', {
        token,
        password: registration.password,
      }).expect(200);
      await send(app, 'verify-email', {
        token,
        password: registration.password,
      }).expect(400);
      const { body } = await login().expect(200);
      expect((await me(body.data.accessToken)).body.data.emailVerified).toBe(
        true,
      );
    });

    it('expires password reset links and invalidates every prior session after reset', async () => {
      await register();
      const session = await login().expect(200);
      const known = await send(app, 'forgot-password', {
        email: registration.email,
      }).expect(202);
      const unknown = await send(app, 'forgot-password', {
        email: 'other@example.test',
      }).expect(202);
      expect(known.body).toEqual(unknown.body);
      const expired = await delivered(1);
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
      const token = await delivered(2);
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

    it('requires the current password to change passwords and revokes other logged-in devices', async () => {
      await register();
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
      await register();
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
      await register();
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
      await register();
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
      expect((await authorized().expect(403)).body.error.code).toBe(
        'EMAIL_NOT_VERIFIED',
      );
      await send(app, 'verify-email', {
        token: await delivered(),
        password: registration.password,
      }).expect(200);
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
      const secondEmail = 'second-admin@example.test';
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
