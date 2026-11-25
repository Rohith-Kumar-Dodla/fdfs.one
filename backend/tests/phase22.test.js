import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { initializePhase22Indexes } from '../src/modules/admin/routes.js';
import { User, initializeAuthIndexes } from '../src/modules/auth/models.js';
import { createSessionService } from '../src/modules/auth/sessions.js';
import { normalizeImage } from '../src/modules/media/images.js';
import { videoSource } from '../src/modules/media/video.js';

const uri = process.env.TEST_MONGODB_RS_URI;
const database = 'fdfs_phase22_test_' + randomBytes(12).toString('hex');
const origin = 'http://localhost:5173';
const logger = createLogger('silent');
const authConfig = {
  webOrigin: origin,
  secure: false,
  accessSecret: randomBytes(48).toString('hex'),
  issuer: 'fdfs-test',
  audience: 'fdfs-api-test',
  accessTtl: 900,
  bcryptCost: 10,
  sessionMs: 30 * 86400000,
};
const config = {
  NODE_ENV: 'test',
  CORS_ORIGINS: [origin],
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX: 1000,
};
const image = () =>
  sharp({ create: { width: 12, height: 20, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
const options = {
  mediaProvider: {
    upload: vi.fn(async (id) => ({
      url: 'https://res.cloudinary.com/test/image/upload/' + id,
      assetId: 'fixture',
    })),
    remove: vi.fn(async () => {}),
  },
  publishers: { talent: vi.fn(async () => {}) },
};
const app = createApp({
  config,
  authConfig,
  logger,
  phase22Options: options,
  isDatabaseConnected: () => true,
});
const api = (method, path, credential) => {
  const call = request(app)[method]('/api/v1' + path);
  return credential ? call.set('Authorization', 'Bearer ' + credential) : call;
};

it('rejects disguised, corrupt and mismatched image bytes and normalizes decoded image metadata', async () => {
  const bytes = await image();
  await expect(
    normalizeImage(Buffer.from('not an image'), 'image/png'),
  ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  await expect(
    normalizeImage(bytes.subarray(0, 20), 'image/png'),
  ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  await expect(normalizeImage(bytes, 'image/jpeg')).rejects.toMatchObject({
    code: 'INVALID_IMAGE',
  });
  await expect(normalizeImage(bytes, 'image/png')).resolves.toMatchObject({
    width: 12,
    height: 20,
  });
});

it.each([
  'https://www.youtube.com/watch?v=AbCdEf123_-',
  'https://youtu.be/AbCdEf123_-?si=fixture',
  'https://m.youtube.com/live/AbCdEf123_-',
  'https://www.youtube-nocookie.com/embed/AbCdEf123_-',
])('canonicalizes %s', (sourceUrl) => {
  expect(
    videoSource.parse({
      provider: 'youtube',
      playbackType: 'scheduled_live',
      sourceUrl,
    }),
  ).toMatchObject({
    providerVideoId: 'AbCdEf123_-',
    sourceUrl: 'https://www.youtube.com/watch?v=AbCdEf123_-',
    availability: 'unknown',
  });
});

it.each([
  'https://youtube.com.example.test/watch?v=AbCdEf123_-',
  'https://www.youtube.com@evil.test/watch?v=AbCdEf123_-',
  'http://youtu.be/AbCdEf123_-',
  'https://youtu.be/bad',
  'https://youtu.be:8080/AbCdEf123_-',
  'https://youtube.com/watch?v=AbCdEf123_-&v=AbCdEf123_-',
])('rejects %s', (sourceUrl) => {
  expect(
    videoSource.safeParse({
      provider: 'youtube',
      playbackType: 'on_demand',
      sourceUrl,
    }).success,
  ).toBe(false);
});

it('requires bearer authentication for administration and uploading', async () => {
  await api('get', '/admin/users').expect(401);
  await api('get', '/admin/audit').expect(401);
  await api('post', '/admin/media').expect(401);
  await api('put', '/users/me/image').expect(401);
});

describe.skipIf(!uri)('Phase 2.2 isolated replica set', () => {
  let admin;
  let viewer;
  let other;
  async function account(name, roles) {
    const user = await User.create({
      fullName: name,
      email: name.toLowerCase() + '@example.test',
      passwordHash: 'unused fixture',
      roles,
      emailVerifiedAt: new Date(),
    });
    const session = await createSessionService(authConfig).open(
      user,
      'Test device',
    );
    return { id: user.publicId, token: session.accessToken };
  }

  beforeAll(async () => {
    if (!/^mongodb:\/\/127\.0\.0\.1:\d+\/?(?:\?replicaSet=[\w-]+)?$/.test(uri))
      throw Error('Use a disposable loopback replica set.');
    await mongoose.connect(uri, {
      dbName: database,
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
    });
    if (mongoose.connection.name !== database)
      throw Error('Unexpected fixture database');
    await Promise.all([initializeAuthIndexes(), initializePhase22Indexes()]);
    [admin, viewer, other] = await Promise.all([
      account('Administrator', ['viewer', 'admin']),
      account('Viewer', ['viewer']),
      account('Other', ['viewer']),
    ]);
  }, 20000);

  afterAll(async () => {
    try {
      if (mongoose.connection.name === database)
        await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });

  it('enforces admin access and filters paginated user data', async () => {
    await api('get', '/admin/overview', viewer.token).expect(403);
    await api('get', '/admin/audit', viewer.token).expect(403);
    await api('post', '/admin/media', viewer.token).expect(403);
    const response = await api(
      'get',
      '/admin/users?q=iew&role=viewer&verified=true&status=active&limit=1',
      admin.token,
    ).expect(200);
    expect(response.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 1,
    });
    expect(response.body.data[0]).toMatchObject({
      id: viewer.id,
      emailVerified: true,
    });
    expect(response.body.data[0]).not.toHaveProperty('passwordHash');
    await api('get', '/admin/users?role=superuser', admin.token).expect(400);
  });

  it('blocks escalation, protects the only administrator, and revokes sessions on suspension', async () => {
    const path = '/admin/users/' + viewer.id;
    await api('patch', path + '/role', admin.token)
      .send({ role: 'admin', enabled: true })
      .expect(400);
    await api('patch', path + '/role', admin.token)
      .send({ role: 'creator', enabled: true, roles: ['admin'] })
      .expect(400);
    await api('patch', '/admin/users/' + admin.id + '/status', admin.token)
      .send({ status: 'suspended' })
      .expect(403);
    for (const role of ['creator', 'organizer']) {
      const grant = await api('patch', path + '/role', admin.token)
        .send({ role, enabled: true })
        .expect(200);
      expect(grant.body.data.roles).toContain(role);
      const revoke = await api('patch', path + '/role', admin.token)
        .send({ role, enabled: false })
        .expect(200);
      expect(revoke.body.data.roles).not.toContain(role);
    }
    await api('patch', path + '/status', admin.token)
      .send({ status: 'suspended' })
      .expect(200);
    await api('get', '/users/me', viewer.token).expect(401);
    await api('patch', path + '/status', admin.token)
      .send({ status: 'active' })
      .expect(200);
    await api('get', '/users/me', viewer.token).expect(401);
    await api('post', path + '/revoke-sessions', admin.token).expect(200);
    const audit = await api(
      'get',
      '/admin/audit?action=user.status_changed',
      admin.token,
    ).expect(200);
    expect(audit.body.data).toHaveLength(2);
    expect(audit.body.data[0]).toMatchObject({
      actorId: admin.id,
      targetId: viewer.id,
      outcome: 'success',
    });
    expect(audit.body.data[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('enforces ownership, review order, rejection reasons and authorized publishing', async () => {
    const draft = {
      category: 'talent',
      title: 'Fixture submission',
      summary: 'Isolated test details.',
    };
    await api('post', '/submissions', other.token)
      .send({ ...draft, status: 'published' })
      .expect(400);
    await api('post', '/submissions', other.token)
      .send({ ...draft, category: 'film' })
      .expect(403);
    const made = await api('post', '/submissions', other.token)
      .send(draft)
      .expect(201);
    const path = '/submissions/' + made.body.data.id;
    const adminPath = '/admin' + path;
    await api('get', path, admin.token).expect(404);
    await api('patch', path, admin.token)
      .send({ title: draft.title, summary: draft.summary })
      .expect(404);
    await api('post', adminPath + '/publish', other.token).expect(403);
    await api('post', adminPath + '/publish', admin.token).expect(409);
    await api('post', path + '/submit', other.token).expect(200);
    const moderate = (action, reason) =>
      api('post', adminPath + '/moderate', admin.token).send({
        action,
        ...(reason && { reason }),
      });
    await moderate('approve').expect(409);
    await moderate('review').expect(200);
    await moderate('reject').expect(400);
    const rejected = await moderate('reject', 'Update the details.').expect(
      200,
    );
    expect(rejected.body.data).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Update the details.',
    });
    await api('patch', path, other.token)
      .send({ title: draft.title, summary: 'Updated isolated details.' })
      .expect(200);
    await api('post', path + '/submit', other.token).expect(200);
    await moderate('review').expect(200);
    await moderate('approve').expect(200);
    const disabled = createApp({
      config,
      authConfig,
      logger,
      isDatabaseConnected: () => true,
    });
    const response = await request(disabled)
      .post('/api/v1' + adminPath + '/publish')
      .set('Authorization', 'Bearer ' + admin.token)
      .expect(409);
    expect(response.body.error.code).toBe('PUBLICATION_UNAVAILABLE');
    const published = await api(
      'post',
      adminPath + '/publish',
      admin.token,
    ).expect(200);
    expect(published.body.data.status).toBe('published');
    expect(options.publishers.talent).toHaveBeenCalledTimes(1);
    await moderate('archive').expect(200);
  });

  it('protects referenced images and tracks audited replacement and deletion', async () => {
    const bytes = await image();
    const send = (method, path, credential, payload = bytes) =>
      api(method, path, credential)
        .set('Content-Type', 'image/png')
        .send(payload);
    const profile = await send('put', '/users/me/image', other.token).expect(
      200,
    );
    const id = profile.body.data.image.id;
    await api('delete', '/admin/media/' + id, admin.token).expect(409);
    await send('put', '/admin/media/' + id, admin.token).expect(409);
    await send(
      'post',
      '/admin/media',
      admin.token,
      Buffer.from('invalid'),
    ).expect(415);
    const created = await send('post', '/admin/media', admin.token).expect(201);
    const replacement = await send(
      'put',
      '/admin/media/' + created.body.data.id,
      admin.token,
    ).expect(200);
    const result = await api(
      'delete',
      '/admin/media/' + replacement.body.data.id,
      admin.token,
    ).expect(200);
    expect(result.body.data.deleted).toBe(true);
    await send('put', '/users/me/image', other.token).expect(200);
    const library = await api('get', '/admin/media', admin.token).expect(200);
    expect(library.body.pagination.total).toBe(1);
    expect(library.body.data[0].id).not.toBe(id);
    const audit = await api(
      'get',
      '/admin/audit?action=media.replace',
      admin.token,
    ).expect(200);
    expect(audit.body.data[0].targetId).toBe(created.body.data.id);
  });
});
