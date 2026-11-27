import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { initializePhase22Indexes } from '../src/modules/admin/routes.js';
import { initializeAuthIndexes, User } from '../src/modules/auth/models.js';
import { createSessionService } from '../src/modules/auth/sessions.js';
import {
  Film,
  FilmCredit,
  initializeFilmIndexes,
} from '../src/modules/films/models.js';
import { filmContent } from '../src/modules/films/schemas.js';
import { MediaAsset } from '../src/modules/media/assets.js';
import {
  initializeTalentIndexes,
  Personality,
} from '../src/modules/talent/models.js';

const base = {
  title: 'Órbital Fixture',
  synopsis: 'An isolated short-film fixture.',
  description: 'Detailed information for the isolated test.',
  genres: ['drama'],
  language: 'te',
  subtitles: ['en'],
  releaseYear: 2026,
  runtimeMinutes: 12,
  mainUrl: 'https://youtu.be/aB2DefGhi-1',
  trailerUrl: 'https://www.youtube.com/watch?v=zY1XwvUts-2',
  extras: [{ title: 'Production notes', url: 'https://youtu.be/aB2DefGhi-3' }],
  rightsConfirmed: true,
  rightsNotes: 'Private fixture documentation.',
};
const verified = { playbackChecked: true };
const uri = process.env.TEST_MONGODB_RS_URI;
const database = 'fdfs_film_test_' + randomBytes(9).toString('hex');
const origin = 'http://localhost:5173';
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
const provider = {
  async upload(id) {
    return {
      assetId: 'isolated-fixture',
      url: 'https://res.cloudinary.com/fixture/image/upload/' + id + '.webp',
    };
  },
  async remove() {},
};
const app = createApp({
  config: {
    NODE_ENV: 'test',
    CORS_ORIGINS: [origin],
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX: 2000,
  },
  authConfig,
  logger: createLogger('silent'),
  isDatabaseConnected: () => true,
  phase22Options: { mediaProvider: provider },
});
function api(method, path, account) {
  const route = request(app)[method]('/api/v1' + path);
  return account
    ? route.set('Authorization', 'Bearer ' + account.token)
    : route;
}

it('validates provider URLs, runtime, unique credits, and draft content', async () => {
  const personalityId = randomUUID();
  expect(
    filmContent.safeParse({
      ...base,
      credits: [
        { personalityId, role: 'actor' },
        { personalityId, role: 'director' },
      ],
    }).success,
  ).toBe(true);
  expect(filmContent.safeParse({ ...base, runtimeMinutes: 0 }).success).toBe(
    false,
  );
  expect(
    filmContent.safeParse({ ...base, mainUrl: 'https://external.test/player' })
      .success,
  ).toBe(false);
  expect(
    filmContent.safeParse({
      ...base,
      trailerUrl: 'https://www.youtube.com/watch?v=aB2DefGhi-1',
    }).success,
  ).toBe(false);
  expect(
    filmContent.safeParse({
      ...base,
      credits: [
        { personalityId, role: 'actor', character: 'Name' },
        { personalityId, role: 'actor', character: ' name ' },
      ],
    }).success,
  ).toBe(false);
  expect(
    filmContent.safeParse({ ...base, genres: ['drama', 'drama'] }).success,
  ).toBe(false);
  await expect(
    new Film({
      title: 'Fixture',
      classification: 'invalid',
      slug: 'Invalid',
      runtimeMinutes: -3,
    }).validate(),
  ).rejects.toMatchObject({
    errors: {
      classification: expect.anything(),
      slug: expect.anything(),
      runtimeMinutes: expect.anything(),
    },
  });
});

it('rejects invalid filters and anonymous management', async () => {
  await api('get', '/films?classification=other').expect(400);
  await api('get', '/films?year=2026.5').expect(400);
  await api('get', '/films?availability=scheduled').expect(400);
  await api('post', '/admin/films').send(base).expect(401);
  await api('get', '/submissions/films').expect(401);
});

describe.skipIf(!uri)('film workflow on an isolated replica set', () => {
  let admin, creator, viewer, other, person;
  async function account(roles) {
    const user = await User.create({
      fullName: 'Isolated account fixture',
      email: randomUUID() + '@example.test',
      passwordHash: 'fixture',
      roles,
      emailVerifiedAt: new Date(),
    });
    const session = await createSessionService(authConfig).open(
      user,
      'Film fixture',
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
      initializeFilmIndexes(),
    ]);
    [admin, creator, viewer, other] = await Promise.all([
      account(['viewer', 'admin']),
      account(['viewer', 'creator']),
      account(['viewer']),
      account(['viewer', 'creator']),
    ]);
    person = await Personality.create({
      displayName: 'Isolation fixture',
      slug: 'isolated-film-credit',
      sortName: 'isolation fixture',
      introduction: 'An isolated talent fixture.',
      professions: ['actor', 'writer'],
      status: 'published',
      updatedBy: admin.id,
      createdBy: admin.id,
    });
  }, 20000);
  afterAll(async () => {
    try {
      if (mongoose.connection.name === database)
        await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });

  const original = (overrides = {}, actor = admin) =>
    api('post', '/admin/films', actor).send({
      ...base,
      classification: 'original',
      productionCompany: 'Isolated authorized fixture',
      ...overrides,
    });
  const status = (record, action, release) =>
    api('post', '/admin/films/' + record.id + '/status', admin).send({
      action,
      revision: record.revision,
      ...(release && { release }),
    });
  const propose = (film, actor = creator, targetId) =>
    api('post', '/submissions', actor).send({
      category: 'film',
      title: 'Isolated film submission',
      summary: 'An isolated proposal for a short film.',
      filmProposal: { film, targetId },
    });
  async function review(id, assessment = 'approve') {
    await api('post', '/submissions/' + id + '/submit', creator).expect(200);
    await api('post', '/admin/submissions/' + id + '/moderate', admin)
      .send({ action: 'review' })
      .expect(200);
    await api('post', '/admin/submissions/' + id + '/moderate', admin)
      .send({
        action: assessment,
        ...(assessment === 'reject' && { reason: 'Isolated review reason.' }),
      })
      .expect(200);
  }
  const publish = (id, release = verified, actor = admin) =>
    api('post', '/admin/submissions/' + id + '/publish', actor).send({
      release,
    });

  it('enforces Original administrator classification, slug uniqueness and rights confirmation', async () => {
    await original({}, creator).expect(403);
    await original({ classification: 'independent' }).expect(400);
    const {
      body: { data: draft },
    } = await original({
      slug: 'isolated-original',
      rightsConfirmed: false,
    }).expect(201);
    await original({ slug: draft.slug }).expect(409);
    await api('get', '/films/' + draft.slug).expect(404);
    await status(draft, 'publish', verified).expect(400);
    await api('patch', '/admin/films/' + draft.id, admin)
      .send({
        ...base,
        classification: 'independent',
        revision: draft.revision,
      })
      .expect(400);
  });

  it('filters published discovery, separates classifications, and withholds upcoming video metadata', async () => {
    const {
      body: { data: draft },
    } = await original({
      title: 'Órbital Upcoming',
      slug: 'isolated-upcoming',
    }).expect(201);
    const future = new Date(Date.now() + 600000).toISOString();
    const {
      body: { data: scheduled },
    } = await status(draft, 'publish', {
      ...verified,
      releaseAt: future,
      announce: true,
    }).expect(200);
    expect(scheduled.status).toBe('published');
    const upcoming = await api(
      'get',
      '/films/' + draft.slug + '?classification=original',
    ).expect(200);
    expect(upcoming.body.data).toMatchObject({
      availability: 'upcoming',
      releaseAt: future,
      trailer: { playbackType: 'on_demand' },
    });
    for (const privateField of [
      'mainVideo',
      'mainUrl',
      'extras',
      'rightsNotes',
      'creatorId',
      'authorizedBy',
    ])
      expect(upcoming.body.data).not.toHaveProperty(privateField);
    expect(JSON.stringify(upcoming.body.data)).not.toContain('aB2DefGhi-1');
    expect(JSON.stringify(upcoming.body.data)).not.toContain('zY1XwvUts-2');
    const playback = '/playback/original/' + draft.slug;
    await api('get', playback).expect(401);
    const allowed = await api('get', playback, admin)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(allowed.body.data.trailer.providerVideoId).toBe('zY1XwvUts-2');
    expect(allowed.body.data).not.toHaveProperty('mainVideo');
    await api(
      'get',
      '/films/' + draft.slug + '?classification=independent',
    ).expect(404);
    const search = await api(
      'get',
      '/films?classification=original&availability=upcoming&q=orbital&genre=drama&language=te&year=2026&limit=1',
    ).expect(200);
    expect(search.body.pagination).toMatchObject({ total: 1, limit: 1 });
    expect(search.body.data[0]).toMatchObject({
      id: draft.id,
      hasTrailer: true,
    });
    expect(search.body.data[0]).not.toHaveProperty('trailer');
    const hidden = (
      await original({ slug: 'isolated-hidden-schedule' }).expect(201)
    ).body.data;
    await status(hidden, 'publish', {
      ...verified,
      releaseAt: future,
      announce: false,
    }).expect(200);
    await api('get', '/films/' + hidden.slug).expect(404);
    await Film.updateOne(
      { publicId: draft.id },
      { releaseAt: new Date(Date.now() - 1000) },
    );
    const released = await api('get', '/films/' + draft.slug).expect(200);
    expect(released.body.data).toMatchObject({
      availability: 'released',
      mainVideo: { playbackType: 'on_demand' },
    });
    expect(JSON.stringify(released.body.data)).not.toContain('aB2DefGhi-1');
    expect(
      (await api('get', playback, admin).expect(200)).body.data.mainVideo
        .providerVideoId,
    ).toBe('aB2DefGhi-1');
  });

  it('requires creator rights, protects ownership and shared assets, and publishes approved credits into filmography', async () => {
    const bytes = await sharp({
      create: { width: 12, height: 18, channels: 3, background: '#111827' },
    })
      .png()
      .toBuffer();
    await api('post', '/submissions/film-images', viewer)
      .set('Content-Type', 'image/png')
      .send(bytes)
      .expect(403);
    const {
      body: { data: asset },
    } = await api('post', '/submissions/film-images', creator)
      .set('Content-Type', 'image/png')
      .send(bytes)
      .expect(201);
    const film = {
      ...base,
      posterId: asset.id,
      credits: [
        {
          personalityId: person.publicId,
          role: 'actor',
          character: 'Fixture role',
        },
        { personalityId: person.publicId, role: 'writer' },
      ],
    };
    await propose(film, viewer).expect(403);
    await propose(film, other).expect(400);
    await propose({ ...film, classification: 'original' }).expect(400);
    const id = (await propose({ ...film, rightsConfirmed: false }).expect(201))
      .body.data.id;
    await api('get', '/submissions/' + id, other).expect(404);
    await api('post', '/submissions/' + id + '/submit', creator).expect(400);
    await api('patch', '/submissions/' + id, creator)
      .send({
        title: 'Film fixture',
        summary: base.synopsis,
        filmProposal: { film },
      })
      .expect(200);
    await api('delete', '/admin/media/' + asset.id, admin).expect(409);
    await publish(id, verified, creator).expect(403);
    await publish(id).expect(409);
    await review(id, 'reject');
    await review(id);
    await api('post', '/admin/submissions/' + id + '/publish', admin).expect(
      400,
    );
    const released = (await publish(id).expect(200)).body.data
      .publishedResource;
    expect(released.classification).toBe('independent');
    const detail = await api(
      'get',
      '/films/' + released.slug + '?classification=independent',
    ).expect(200);
    expect(detail.body.data.credits.map(({ role }) => role)).toEqual([
      'actor',
      'writer',
    ]);
    expect(detail.body.data.poster).toMatchObject({ width: 12, height: 18 });
    expect(detail.body.data).not.toHaveProperty('rightsNotes');
    const related = await api('get', '/talent/' + person.slug).expect(200);
    expect(
      related.body.data.filmography.find((item) => item.id === released.id),
    ).toMatchObject({
      slug: released.slug,
      classification: 'independent',
      credits: [
        { role: 'actor', character: 'Fixture role' },
        { role: 'writer' },
      ],
    });
    const record = await Film.findOne({ publicId: released.id });
    expect(await FilmCredit.countDocuments({ film: record._id })).toBe(2);
    expect(
      (await MediaAsset.findOne({ publicId: asset.id })).references,
    ).toMatchObject([{ kind: 'film', targetId: released.id }]);
    await api('delete', '/admin/media/' + asset.id, admin).expect(409);
    await api('get', '/submissions/films/' + released.id, other).expect(404);
    await propose(film, other, released.id).expect(404);
    const correctionId = (
      await propose(
        { ...film, title: 'Fixture correction' },
        creator,
        released.id,
      ).expect(201)
    ).body.data.id;
    await review(correctionId);
    expect(
      (await publish(correctionId).expect(200)).body.data.publishedResource,
    ).toMatchObject({ id: released.id, slug: released.slug });
    const updated = (
      await api('get', '/admin/films/' + released.id, admin).expect(200)
    ).body.data;
    expect(updated.title).toBe('Fixture correction');
    await status(updated, 'archive').expect(200);
    await api('get', '/films/' + released.slug).expect(404);
    const after = await api('get', '/talent/' + person.slug).expect(200);
    expect(
      after.body.data.filmography.some((item) => item.id === released.id),
    ).toBe(false);
    expect(await FilmCredit.countDocuments({ film: record._id })).toBe(2);
  });

  it('unpublishes without deleting film records and hides unavailable talent credit links', async () => {
    const draft = (
      await original({
        credits: [{ personalityId: person.publicId, role: 'director' }],
      }).expect(201)
    ).body.data;
    const published = (await status(draft, 'publish', verified).expect(200))
      .body.data;
    await Personality.updateOne({ _id: person._id }, { status: 'archived' });
    expect(
      (await api('get', '/films/' + draft.slug).expect(200)).body.data.credits,
    ).toEqual([]);
    const unpublished = (await status(published, 'unpublish').expect(200)).body
      .data;
    await api('get', '/films/' + draft.slug).expect(404);
    expect(unpublished.status).toBe('draft');
    await status(unpublished, 'archive').expect(200);
    await api('patch', '/admin/films/' + draft.id, admin)
      .send({ ...base, revision: unpublished.revision + 1 })
      .expect(409);
  });
});
