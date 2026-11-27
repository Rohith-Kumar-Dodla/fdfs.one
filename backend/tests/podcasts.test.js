import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
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
import { MediaAsset } from '../src/modules/media/assets.js';
import {
  PodcastEpisode,
  EpisodeParticipant,
} from '../src/modules/podcasts/models.js';
import { initializePodcastIndexes } from '../src/modules/podcasts/routes.js';
import {
  episodeContent,
  showContent,
} from '../src/modules/podcasts/schemas.js';
import {
  Personality,
  initializeTalentIndexes,
} from '../src/modules/talent/models.js';

const podcast = {
  introduction: 'An isolated show introduction.',
  description: 'An isolated show description.',
  languages: ['en'],
  rightsConfirmed: true,
};
const episode = {
  title: 'Épisode Fixture',
  synopsis: 'An isolated podcast episode.',
  notes: 'Test-only episode notes.',
  number: 1,
  season: 1,
  language: 'en',
  topics: ['cinema-craft'],
  duration: 180,
  rightsConfirmed: true,
  rightsNotes: 'Private fixture rights record',
  mainUrl: 'https://youtu.be/aB2DefGhi-1',
  teaserUrl: 'https://youtu.be/aB2DefGhi-2',
  chapters: [
    { title: 'Second topic', start: 22 },
    { title: 'Opening', start: 0 },
  ],
};
const release = { playbackChecked: true };
const uri = process.env.TEST_MONGODB_RS_URI;
const dbName = 'fdfs_podcast_test_' + randomBytes(8).toString('hex');
const origin = 'http://localhost:5173';
const config = {
  NODE_ENV: 'test',
  CORS_ORIGINS: [origin],
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX: 1000,
};
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
const app = createApp({
  config,
  authConfig,
  logger: createLogger('silent'),
  isDatabaseConnected: () => true,
  phase22Options: { mediaProvider: { async remove() {} } },
});
function api(method, path, account) {
  const result = request(app)[method]('/api/v1' + path);
  return account
    ? result.set('Authorization', 'Bearer ' + account.token)
    : result;
}

it('validates show links and audio-independent episode metadata', () => {
  expect(showContent.safeParse(podcast).success).toBe(true);
  expect(
    showContent.safeParse({
      ...podcast,
      languages: [],
      links: [{ label: 'No', url: 'javascript:alert(1)' }],
    }).success,
  ).toBe(false);
  expect(
    episodeContent.parse(episode).chapters.map(({ start }) => start),
  ).toEqual([0, 22]);
  expect(
    episodeContent.safeParse({
      ...episode,
      chapters: [{ title: 'Invalid', start: -1 }],
    }).success,
  ).toBe(false);
  expect(episodeContent.safeParse({ ...episode, duration: 22 }).success).toBe(
    false,
  );
  expect(
    episodeContent.safeParse({
      ...episode,
      chapters: [
        { title: 'A', start: 0 },
        { title: 'B', start: 0 },
      ],
    }).success,
  ).toBe(false);
  expect(
    episodeContent.safeParse({
      ...episode,
      teaserUrl: 'https://www.youtube.com/watch?v=aB2DefGhi-1',
    }).success,
  ).toBe(false);
  const roles = { personalityId: randomUUID(), role: 'guest' };
  expect(
    episodeContent.safeParse({ ...episode, participants: [roles, roles] })
      .success,
  ).toBe(false);
});

it('protects management routes and validates discovery filters', async () => {
  await api('get', '/admin/podcasts/show').expect(401);
  await api('post', '/admin/podcasts/episodes').send(episode).expect(401);
  await api('post', '/podcasts/episodes/fixture/comments')
    .send({ text: 'No session' })
    .expect(401);
  await api('get', '/podcasts/episodes?season=0&sort=popularity').expect(400);
});

describe.skipIf(!uri)('isolated Podcast API and moderation', () => {
  let admin, author, other, unverified, suspended, person, show;
  async function account(roles, verified = true) {
    const user = await User.create({
      fullName: 'Isolated commenter',
      email: randomUUID() + '@example.test',
      passwordHash: 'fixture',
      roles,
      emailVerifiedAt: verified ? new Date() : null,
    });
    const session = await createSessionService(authConfig).open(
      user,
      'Podcast tests',
    );
    return { id: user.publicId, token: session.accessToken };
  }
  beforeAll(async () => {
    if (!/^mongodb:\/\/127\.0\.0\.1:\d+\/?(?:\?replicaSet=[\w-]+)?$/.test(uri))
      throw Error('Use a disposable loopback replica set.');
    await mongoose.connect(uri, {
      dbName,
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
    });
    if (mongoose.connection.name !== dbName)
      throw Error('Unexpected fixture database');
    await Promise.all([
      initializePodcastIndexes(),
      initializeFilmIndexes(),
      initializeTalentIndexes(),
      initializePhase22Indexes(),
      initializeAuthIndexes(),
    ]);
    [admin, author, other, unverified, suspended] = await Promise.all([
      account(['viewer', 'admin']),
      account(['viewer']),
      account(['viewer', 'creator']),
      account(['viewer'], false),
      account(['viewer']),
    ]);
    await User.updateOne({ publicId: suspended.id }, { status: 'suspended' });
    person = await Personality.create({
      displayName: 'Isolated guest',
      slug: 'isolated-guest',
      sortName: 'isolated guest',
      introduction: 'A fixture biography.',
      professions: ['podcast_guest'],
      status: 'published',
      createdBy: admin.id,
      updatedBy: admin.id,
    });
  }, 25000);
  afterAll(async () => {
    try {
      if (mongoose.connection.name === dbName)
        await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  const create = (data, actor = admin) =>
    api('post', '/admin/podcasts/episodes', actor).send({
      ...episode,
      ...data,
    });
  const state = (record, action, schedule, actor = admin) =>
    api(
      'post',
      '/admin/podcasts/episodes/' + record.id + '/status',
      actor,
    ).send({
      action,
      revision: record.revision,
      ...(schedule && { release: schedule }),
    });
  const publicPath = (slug) => '/podcasts/episodes/' + slug;

  it('publishes the configured brand with actual host references and private fields excluded', async () => {
    expect((await api('get', '/podcasts').expect(200)).body.data).toBeNull();
    await api('put', '/admin/podcasts/show', other).send(podcast).expect(403);
    show = (
      await api('put', '/admin/podcasts/show', admin)
        .send({ ...podcast, hostIds: [person.publicId] })
        .expect(200)
    ).body.data;
    expect(show).toMatchObject({
      name: '404 Reality Not Found',
      status: 'draft',
    });
    await api('get', '/podcasts/shows/' + show.slug).expect(404);
    show = (
      await api('post', '/admin/podcasts/show/status', admin)
        .send({ action: 'publish', revision: show.revision })
        .expect(200)
    ).body.data;
    const detail = (
      await api('get', '/podcasts/shows/' + show.slug).expect(200)
    ).body.data;
    expect(detail.hosts).toMatchObject([
      { id: person.publicId, slug: person.slug },
    ]);
    expect(detail).not.toHaveProperty('revision');
    expect(detail).not.toHaveProperty('rightsConfirmed');
  });

  it('enforces episode numbering, holds scheduled media, and filters discovery', async () => {
    const item = (await create({ slug: 'upcoming-fixture' }).expect(201)).body
      .data;
    await create({ slug: 'other-number-conflict' }).expect(409);
    await create({ season: 2 }).expect(201);
    await api('get', publicPath(item.slug)).expect(404);
    await state(item, 'publish', release, other).expect(403);
    const future = new Date(Date.now() + 7200000).toISOString();
    const announced = (
      await state(item, 'publish', {
        ...release,
        releaseAt: future,
        announce: true,
      }).expect(200)
    ).body.data;
    expect(announced.status).toBe('published');
    const detail = (await api('get', publicPath(item.slug)).expect(200)).body
      .data;
    expect(detail).toMatchObject({
      availability: 'upcoming',
      teaser: { playbackType: 'on_demand' },
      releaseAt: future,
    });
    for (const key of [
      'mainVideo',
      'mainUrl',
      'chapters',
      'rightsNotes',
      'updatedBy',
    ])
      expect(detail).not.toHaveProperty(key);
    expect(JSON.stringify(detail)).not.toContain('aB2DefGhi-1');
    const list = (
      await api(
        'get',
        '/podcasts/episodes?q=episode&topic=cinema-craft&language=en&season=1&availability=upcoming&limit=1',
      ).expect(200)
    ).body;
    expect(list.pagination).toMatchObject({ total: 1, limit: 1 });
    expect(list.data[0].slug).toBe(item.slug);
    await api('get', publicPath(item.slug) + '/comments').expect(404);
    const hidden = (
      await create({ number: 2, slug: 'hidden-fixture' }).expect(201)
    ).body.data;
    await state(hidden, 'publish', {
      ...release,
      announce: true,
      releaseAt: future,
      publicationAt: future,
    }).expect(200);
    await api('get', publicPath(hidden.slug)).expect(404);
  });

  it('publishes participant appearances, preserves filmography, and protects media references', async () => {
    const image = await MediaAsset.create({
      providerId: 'fdfs/library/podcast-fixture',
      owner: admin.id,
      purpose: 'library',
      status: 'active',
      url: 'https://res.cloudinary.com/fixture/image/upload/test.webp',
      width: 480,
      height: 270,
      bytes: 50,
    });
    const draft = (
      await create({
        number: 3,
        thumbnailId: image.publicId,
        participants: [
          { personalityId: person.publicId, role: 'host' },
          {
            personalityId: person.publicId,
            role: 'guest',
            introduction: 'Fixture guest intro.',
          },
        ],
      }).expect(201)
    ).body.data;
    expect(draft.chapters.map(({ start }) => start)).toEqual([0, 22]);
    await api('delete', '/admin/media/' + image.publicId, admin).expect(409);
    expect(await EpisodeParticipant.countDocuments()).toBe(2);
    const film = await Film.create({
      slug: 'preserved-filmography-fixture',
      classification: 'independent',
      title: 'An isolated film',
      titleKey: 'an isolated film',
      synopsis: 'Filmography fixture.',
      genres: ['drama'],
      language: 'en',
      runtimeMinutes: 4,
      releaseYear: 2026,
      status: 'published',
      releaseAt: new Date(),
      createdBy: admin.id,
      updatedBy: admin.id,
    });
    await FilmCredit.create({
      film: film._id,
      personality: person._id,
      role: 'actor',
      position: 0,
    });
    const active = (await state(draft, 'publish', release).expect(200)).body
      .data;
    const detail = (await api('get', publicPath(draft.slug)).expect(200)).body
      .data;
    expect(detail.participants.map(({ role }) => role)).toEqual([
      'host',
      'guest',
    ]);
    expect(JSON.stringify(detail)).not.toContain('aB2DefGhi-1');
    const playback = '/playback/podcasts/' + draft.slug;
    await api('get', playback).expect(401);
    expect(
      (await api('get', playback, admin).expect(200)).body.data.mainVideo
        .providerVideoId,
    ).toBe('aB2DefGhi-1');
    const talent = (await api('get', '/talent/' + person.slug).expect(200)).body
      .data;
    expect(talent.podcastAppearances).toMatchObject([
      { slug: draft.slug, roles: ['host', 'guest'] },
    ]);
    expect(talent.filmography).toMatchObject([{ slug: film.slug }]);
    await state(active, 'archive').expect(200);
    await api('get', publicPath(draft.slug)).expect(404);
    expect(
      (await api('get', '/talent/' + person.slug).expect(200)).body.data
        .podcastAppearances,
    ).toEqual([]);
    await api('delete', '/admin/media/' + image.publicId, admin).expect(409);
  });

  it('enforces comment eligibility and ownership and moderates reports without public identities', async () => {
    const draft = (await create({ number: 4 }).expect(201)).body.data;
    const active = (await state(draft, 'publish', release).expect(200)).body
      .data;
    const path = publicPath(draft.slug) + '/comments';
    await api('post', path, unverified)
      .send({ text: 'Unverified' })
      .expect(403);
    await api('post', path, suspended).send({ text: 'Suspended' }).expect(403);
    await api('post', path, author).send({ text: ' ' }).expect(400);
    const comment = (
      await api('post', path, author)
        .send({ text: '<b>Plain text</b>' })
        .expect(201)
    ).body.data;
    expect(comment).toMatchObject({ text: '<b>Plain text</b>', mine: true });
    await api('post', path, author)
      .send({ text: '<b>Plain text</b>' })
      .expect(409);
    const guest = (await api('get', path).expect(200)).body.data[0];
    expect(guest.author).toBe('Isolated commenter');
    expect(guest).not.toHaveProperty('mine');
    expect(JSON.stringify(guest)).not.toContain(author.id);
    await api('patch', path + '/' + comment.id, other)
      .send({ text: 'Unauthorized edit' })
      .expect(404);
    await api('delete', path + '/' + comment.id, other).expect(404);
    const edited = (
      await api('patch', path + '/' + comment.id, author)
        .send({ text: 'Edited comment' })
        .expect(200)
    ).body.data;
    expect(edited.editedAt).toBeTruthy();
    await api('post', path + '/' + comment.id + '/report', other)
      .send({ reason: 'spam' })
      .expect(201);
    await api('post', path + '/' + comment.id + '/report', other)
      .send({ reason: 'spam' })
      .expect(409);
    await api('get', '/admin/podcasts/reports', other).expect(403);
    const report = (
      await api('get', '/admin/podcasts/reports', admin).expect(200)
    ).body.data[0];
    expect(report.comment.id).toBe(comment.id);
    expect(report).not.toHaveProperty('reporter');
    const moderation = '/admin/podcasts/comments/' + comment.id + '/moderate';
    await api('post', moderation, other)
      .send({ action: 'hide', reason: 'Denied requester' })
      .expect(403);
    await api('post', moderation, admin)
      .send({ action: 'hide', reason: 'Isolated moderation fixture' })
      .expect(200);
    expect((await api('get', path).expect(200)).body.data).toEqual([]);
    await api('post', moderation, admin)
      .send({ action: 'restore', reason: 'Isolated restoration fixture' })
      .expect(200);
    await api(
      'post',
      '/admin/podcasts/reports/' + report.id + '/resolve',
      admin,
    )
      .send({ reason: 'Fixture resolution' })
      .expect(200);
    await api('delete', path + '/' + comment.id, author).expect(200);
    expect((await api('get', path).expect(200)).body.data).toEqual([]);
    await state(active, 'unpublish').expect(200);
    await api('get', path).expect(404);
    expect(await PodcastEpisode.countDocuments({ publicId: active.id })).toBe(
      1,
    );
    expect(
      (
        await api(
          'get',
          '/admin/audit?action=podcast.comment_hide',
          admin,
        ).expect(200)
      ).body.data[0].targetId,
    ).toBe(comment.id);
  });
});
