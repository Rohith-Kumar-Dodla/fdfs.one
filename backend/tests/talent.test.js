import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { initializePhase22Indexes } from '../src/modules/admin/routes.js';
import { initializeAuthIndexes, User } from '../src/modules/auth/models.js';
import { createSessionService } from '../src/modules/auth/sessions.js';
import { MediaAsset } from '../src/modules/media/assets.js';
import {
  initializeTalentIndexes,
  Personality,
} from '../src/modules/talent/models.js';
import { profileContent } from '../src/modules/talent/schemas.js';

const profile = {
  displayName: 'Ária Test Fixture',
  alternativeName: 'Sample Professional',
  introduction: 'A professional introduction for an isolated fixture.',
  biography: 'Fixture biography.',
  professions: ['actor', 'director'],
  achievements: [
    {
      title: 'Fixture award',
      organization: 'Fixture organization',
      year: 2024,
      source: 'https://example.test/source',
    },
  ],
  website: 'https://example.test/',
};
const uri = process.env.TEST_MONGODB_RS_URI;
const database = 'fdfs_talent_test_' + randomBytes(10).toString('hex');
const webOrigin = 'http://localhost:5173';
const authConfig = {
  webOrigin,
  secure: false,
  accessSecret: randomBytes(48).toString('hex'),
  issuer: 'fdfs-test',
  audience: 'fdfs-api-test',
  accessTtl: 900,
  bcryptCost: 10,
  sessionMs: 30 * 86400000,
};
const app = createApp({
  config: {
    NODE_ENV: 'test',
    CORS_ORIGINS: [webOrigin],
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX: 1000,
  },
  authConfig,
  logger: createLogger('silent'),
  isDatabaseConnected: () => true,
  phase22Options: { mediaProvider: { async remove() {} } },
});
const api = (method, path, account) => {
  const call = request(app)[method]('/api/v1' + path);
  return account ? call.set('Authorization', 'Bearer ' + account.token) : call;
};

it('validates multiple unique professions and safe public links', () => {
  expect(profileContent.parse(profile).professions).toEqual([
    'actor',
    'director',
  ]);
  for (const professions of [['actor', 'actor'], [], ['administrator']]) {
    expect(profileContent.safeParse({ ...profile, professions }).success).toBe(
      false,
    );
  }
  for (const website of [
    'javascript:alert(1)',
    'https://user:secret@example.test/',
    'http://example.test/',
  ]) {
    expect(profileContent.safeParse({ ...profile, website }).success).toBe(
      false,
    );
  }
  expect(
    profileContent.safeParse({ ...profile, associatedUserId: randomUUID() })
      .success,
  ).toBe(false);
});

it('validates the Mongoose personality schema and UUID identity', async () => {
  const base = {
    ...profile,
    sortName: 'aria',
    createdBy: randomUUID(),
    updatedBy: randomUUID(),
  };
  const model = new Personality({ ...base, slug: 'aria-example' });
  expect(model.publicId).toMatch(/^[a-f0-9-]{36}$/);
  await expect(model.validate()).resolves.toBeUndefined();
  await expect(
    new Personality({
      ...base,
      slug: 'Invalid Slug',
      professions: [],
    }).validate(),
  ).rejects.toMatchObject({
    errors: { slug: expect.anything(), professions: expect.anything() },
  });
});

it('rejects unauthenticated mutation and invalid directory filters', async () => {
  await api('post', '/admin/talent').send(profile).expect(401);
  await api('get', '/talent?sort=unknown').expect(400);
  await api('get', '/talent?profession=admin').expect(400);
});

describe.skipIf(!uri)('Talent Profiles with an isolated replica set', () => {
  let admin, owner, other, unverified;
  async function account(roles, verified = true) {
    const user = await User.create({
      fullName: 'Isolated fixture',
      email: randomUUID() + '@example.test',
      passwordHash: 'fixture',
      roles,
      emailVerifiedAt: verified ? new Date() : null,
    });
    const session = await createSessionService(authConfig).open(
      user,
      'Talent tests',
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
    await Promise.all([
      initializeAuthIndexes(),
      initializePhase22Indexes(),
      initializeTalentIndexes(),
    ]);
    [admin, owner, other, unverified] = await Promise.all([
      account(['viewer', 'admin']),
      account(['viewer']),
      account(['viewer']),
      account(['viewer'], false),
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

  const create = async (data = {}) =>
    (
      await api('post', '/admin/talent', admin)
        .send({ ...profile, ...data })
        .expect(201)
    ).body.data;
  const updateStatus = (record, action, actor) =>
    api('post', '/admin/talent/' + record.id + '/status', actor ?? admin).send({
      action,
      revision: record.revision,
    });
  const propose = (proposal, actor) =>
    api('post', '/submissions', actor ?? owner).send({
      category: 'talent',
      title: 'Fixture talent proposal',
      summary: 'Official isolated fixture summary.',
      proposal,
    });
  const moderate = (id, action, reason) =>
    api('post', '/admin/submissions/' + id + '/moderate', admin).send({
      action,
      ...(reason && { reason }),
    });
  async function approve(id) {
    await api('post', '/submissions/' + id + '/submit', owner).expect(200);
    await moderate(id, 'review').expect(200);
    await moderate(id, 'approve').expect(200);
  }

  it('publishes only authorized profiles and supports normalized prefix search, professions, sorting and pagination', async () => {
    const archived = await create({
      displayName: 'Ária Archive',
      slug: 'aria-archive',
    });
    await updateStatus(archived, 'archive').expect(200);
    const draft = await create({
      displayName: 'Ária Draft',
      slug: 'aria-draft',
    });
    const first = await create({ displayName: 'Ária A', slug: 'aria-a' });
    const second = await create({ displayName: 'Ária B', slug: 'aria-b' });
    await api('post', '/admin/talent', admin)
      .send({ ...profile, slug: first.slug })
      .expect(409);
    await api('get', '/talent/' + draft.slug).expect(404);
    await api('get', '/talent/' + archived.slug).expect(404);
    await updateStatus(first, 'publish', owner).expect(403);
    await updateStatus(first, 'publish').expect(200);
    await updateStatus(second, 'publish').expect(200);
    const result = await api(
      'get',
      '/talent?q=aria&profession=actor&sort=-name&page=2&limit=1',
    ).expect(200);
    expect(result.body.pagination).toMatchObject({
      total: 2,
      page: 2,
      totalPages: 2,
    });
    expect(result.body.data.map((record) => record.slug)).toEqual(['aria-a']);
    expect(result.body.data[0]).not.toHaveProperty('biography');
    const detail = (await api('get', '/talent/aria-a').expect(200)).body.data;
    expect(detail).toMatchObject({
      achievements: profile.achievements,
      filmography: [],
      podcastAppearances: [],
    });
    for (const field of [
      '_id',
      'status',
      'createdBy',
      'associatedUser',
      'associatedUserId',
      'revision',
    ])
      expect(detail).not.toHaveProperty(field);
    const sameName = await create({ displayName: first.displayName });
    expect(sameName.slug).not.toBe(first.slug);
  });

  it('enforces admin-only updates and explicit eligible account association', async () => {
    const target = await create();
    const url = '/admin/talent/' + target.id;
    await api('patch', url, owner)
      .send({ ...profile, revision: target.revision })
      .expect(403);
    await api('put', url + '/association', owner)
      .send({ userId: owner.id, revision: target.revision })
      .expect(403);
    await api('put', url + '/association', admin)
      .send({ userId: unverified.id, revision: target.revision })
      .expect(400);
    const linked = (
      await api('put', url + '/association', admin)
        .send({ userId: owner.id, revision: target.revision })
        .expect(200)
    ).body.data;
    expect(linked.associatedUserId).toBe(owner.id);
    const otherProfile = await create();
    await api('put', '/admin/talent/' + otherProfile.id + '/association', admin)
      .send({ userId: owner.id, revision: otherProfile.revision })
      .expect(409);
    await api('patch', url, admin)
      .send({ ...profile, revision: target.revision })
      .expect(409);
    const published = (await updateStatus(linked, 'publish').expect(200)).body
      .data;
    const detail = (await api('get', '/talent/' + linked.slug).expect(200)).body
      .data;
    expect(detail).not.toHaveProperty('associatedUserId');
    const unpublished = (await updateStatus(published, 'unpublish').expect(200))
      .body.data;
    await api('get', '/talent/' + linked.slug).expect(404);
    const archived = (await updateStatus(unpublished, 'archive').expect(200))
      .body.data;
    await updateStatus(archived, 'publish').expect(409);
    await api('patch', url, admin)
      .send({ ...profile, revision: archived.revision })
      .expect(409);
    const audit = await api(
      'get',
      '/admin/audit?action=talent.associate',
      admin,
    ).expect(200);
    expect(audit.body.data[0]).toMatchObject({
      targetId: target.id,
      actorId: admin.id,
      summary: { to: 'associated' },
    });
  });

  it('publishes only approved owner-scoped proposals and protects attached media', async () => {
    const asset = await MediaAsset.create({
      providerId: 'fdfs/talent/fixture',
      owner: owner.id,
      purpose: 'talent',
      status: 'active',
      url: 'https://res.cloudinary.com/test/image/upload/fixture',
      width: 400,
      height: 500,
      bytes: 100,
    });
    const proposal = {
      profile: { ...profile, profileImageId: asset.publicId },
    };
    await propose(proposal, unverified).expect(403);
    await propose(proposal, other).expect(400);
    const made = await propose(proposal).expect(201);
    const id = made.body.data.id;
    await propose(proposal).expect(409);
    await api('get', '/submissions/' + id, other).expect(404);
    await api('post', '/admin/submissions/' + id + '/publish', owner).expect(
      403,
    );
    await api('post', '/admin/submissions/' + id + '/publish', admin).expect(
      409,
    );
    await api('delete', '/admin/media/' + asset.publicId, admin).expect(409);
    await api('post', '/submissions/' + id + '/submit', owner).expect(200);
    await moderate(id, 'approve').expect(409);
    await moderate(id, 'review').expect(200);
    await moderate(id, 'reject', 'Needs a source.').expect(200);
    await approve(id);
    const published = await api(
      'post',
      '/admin/submissions/' + id + '/publish',
      admin,
    ).expect(200);
    const result = published.body.data.publishedResource;
    expect(published.body.data.status).toBe('published');
    const detail = await api('get', '/talent/' + result.slug).expect(200);
    expect(detail.body.data.profileImage).toMatchObject({ width: 400 });
    expect(detail.body.data.profileImage).not.toHaveProperty('id');
    expect((await MediaAsset.findById(asset._id)).references[0]).toMatchObject({
      kind: 'talent-profile',
      targetId: result.id,
    });
    await api('delete', '/admin/media/' + asset.publicId, admin).expect(409);
  });

  it('rejects stale corrections and preserves the stable public identifier when publishing a fresh correction', async () => {
    const draft = await create();
    const active = (await updateStatus(draft, 'publish').expect(200)).body.data;
    const proposal = {
      targetId: active.id,
      profile: { ...profile, displayName: 'Proposed fixture correction' },
    };
    const stale = (await propose(proposal).expect(201)).body.data.id;
    await approve(stale);
    await api('patch', '/admin/talent/' + active.id, admin)
      .send({
        ...profile,
        displayName: 'Administrative fixture edit',
        revision: active.revision,
      })
      .expect(200);
    await api('post', '/admin/submissions/' + stale + '/publish', admin).expect(
      409,
    );
    await moderate(stale, 'archive').expect(200);
    const fresh = (await propose(proposal).expect(201)).body.data.id;
    await approve(fresh);
    await api('post', '/admin/submissions/' + fresh + '/publish', admin).expect(
      200,
    );
    const detail = await api('get', '/talent/' + active.slug).expect(200);
    expect(detail.body.data).toMatchObject({
      id: active.id,
      slug: active.slug,
      displayName: 'Proposed fixture correction',
    });
  });
});
