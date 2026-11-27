import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { initializeAuthIndexes, User } from '../src/modules/auth/models.js';
import { createSessionService } from '../src/modules/auth/sessions.js';
import { Film, FilmCredit } from '../src/modules/films/models.js';
import { LiveEvent } from '../src/modules/live/models.js';
import { Notice } from '../src/modules/operations/support-models.js';
import { PodcastShow, PodcastEpisode } from '../src/modules/podcasts/models.js';
import { Movie } from '../src/modules/reviews/models.js';
import { SiteConfig } from '../src/modules/site/service.js';
import { Personality } from '../src/modules/talent/models.js';
import {
  Following,
  initializePersonalIndexes,
  Playback,
  Watchlist,
} from '../src/modules/personal/models.js';
import { scanReleaseNotices } from '../src/modules/personal/notices.js';
import { podcastBrand } from '../../shared/podcasts.js';

const uri = process.env.TEST_MONGODB_RS_URI;
const origin = 'http://localhost:5173';
const authConfig = {
  webOrigin: origin,
  accessSecret: randomBytes(48).toString('hex'),
  issuer: 'personal-test',
  audience: 'personal-api-test',
  accessTtl: 900,
  bcryptCost: 10,
  sessionMs: 86400000,
  secure: false,
};
const config = {
  NODE_ENV: 'test',
  CORS_ORIGINS: [origin],
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX: 1000,
};
const app = createApp({
  authConfig,
  config,
  logger: createLogger('silent'),
  isDatabaseConnected: () => true,
});
const sessions = createSessionService(authConfig);
const data = (result) => result.body.data;
const videoId = 'Wb8Tq_HD4E8';
const video = {
  provider: 'youtube',
  providerVideoId: videoId,
  availability: 'available',
};
const past = new Date(Date.now() - 86400000);
const future = new Date(Date.now() + 86400000);

describe.skipIf(!uri)('Phase 6.2 private library', () => {
  let a, b, linkedFilm, secret, talent, secondTalent;
  const content = {};
  const api = (method, path, actor) => {
    const req = request(app)[method]('/api/v1' + path);
    return actor ? req.set('Authorization', 'Bearer ' + actor.token) : req;
  };
  const call = (method, path, actor = a) =>
    api(method, '/personal' + path, actor);
  const getState = (type, id, actor = a) =>
    call('get', '/progress/' + type + '/' + id, actor);
  const put = (type, id, state, patch = {}, actor = a) =>
    call('put', '/progress/' + type + '/' + id, actor).send({
      revision: state.revision,
      epoch: state.epoch,
      source: state.source,
      videoId,
      position: 30,
      duration: 100,
      ...patch,
    });
  const refs = () =>
    Object.entries(content).map(([module, row]) => ({
      module,
      id: row.publicId,
    }));
  const path = (row) => '/' + row.module + '/' + row.id;

  beforeAll(async () => {
    await mongoose.connect(uri, {
      dbName: 'fdfs_personal_' + randomBytes(8).toString('hex'),
      autoIndex: false,
    });
    await Promise.all([
      initializeAuthIndexes(),
      initializePersonalIndexes(),
      Notice.createIndexes(),
    ]);
    async function create(title, roles = ['viewer']) {
      const user = await User.create({
        fullName: title,
        email: randomUUID() + '@example.test',
        roles,
        passwordHash: 'isolated',
        emailVerifiedAt: new Date(),
      });
      const issued = await sessions.open(
        await User.findById(user._id).select('+authVersion'),
      );
      return { user, token: issued.accessToken };
    }
    [a, b] = await Promise.all([
      create('Viewer A'),
      create('Viewer B', ['viewer', 'admin']),
    ]);
    const show = await PodcastShow.collection.insertOne({
      slug: podcastBrand.slug,
      status: 'published',
    });
    async function seed(model, title, options = {}) {
      const row = {
        publicId: randomUUID(),
        slug: title.toLowerCase().replaceAll(' ', '-'),
        title,
        status: 'published',
        releaseAt: past,
        publishedAt: past,
        publicationAt: past,
        ...options,
      };
      return {
        ...row,
        _id: (await model.collection.insertOne(row)).insertedId,
      };
    }
    content.independent = await seed(Film, 'Private Cinema fixture', {
      classification: 'independent',
      genres: ['drama'],
      mainVideo: video,
    });
    content.original = await seed(Film, 'Original fixture', {
      classification: 'original',
      genres: ['action'],
      mainVideo: video,
    });
    content.podcasts = await seed(PodcastEpisode, 'Podcast fixture', {
      show: show.insertedId,
      mainVideo: video,
    });
    content.movies = await seed(Movie, 'Movie fixture', {
      genres: ['drama'],
      releaseDate: past,
      trailer: video,
    });
    content.live = await seed(LiveEvent, 'Replay fixture', {
      broadcast: 'ended',
      moderation: 'approved',
      replay: video,
      actualEndAt: past,
    });
    content.event = await seed(LiveEvent, 'Active fixture', {
      broadcast: 'live',
      moderation: 'approved',
      video,
      startAt: past,
    });
    content.upcoming = await seed(Film, 'Announced fixture', {
      classification: 'independent',
      announce: true,
      releaseAt: future,
      mainVideo: video,
    });
    secret = await seed(Film, 'Restricted fixture title', {
      classification: 'independent',
      status: 'draft',
      mainVideo: video,
    });
    linkedFilm = await seed(Film, 'Talent release fixture', {
      classification: 'independent',
      genres: ['drama'],
      mainVideo: video,
    });
    talent = await seed(Personality, 'Talent fixture', {
      displayName: 'Talent fixture',
    });
    secondTalent = await seed(Personality, 'Another profile', {
      displayName: 'Another profile',
    });
    await FilmCredit.create([
      {
        personality: talent._id,
        film: linkedFilm._id,
        role: 'actor',
        position: 1,
      },
      {
        personality: secondTalent._id,
        film: linkedFilm._id,
        role: 'actor',
        position: 2,
      },
    ]);
  }, 20000);

  afterAll(async () => {
    if (mongoose.connection.readyState === 1)
      await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('uses owner-only idempotent saves across five modules and handles concurrent operations', async () => {
    await api('get', '/personal/watchlist')
      .expect(401)
      .expect('Cache-Control', 'no-store');
    for (const ref of refs().filter(
      (row) => !['event', 'upcoming'].includes(row.module),
    ))
      await call('put', '/watchlist' + path(ref)).expect(200);
    const ref = '/watchlist/independent/' + content.independent.publicId;
    await Promise.all(
      Array.from({ length: 6 }, () => call('put', ref).expect(200)),
    );
    expect(await Watchlist.countDocuments({ owner: a.user._id })).toBe(5);
    const responses = await Promise.all([
      call('delete', ref),
      call('put', ref),
      call('delete', ref),
    ]);
    expect(responses.every((result) => result.status === 200)).toBe(true);
    await call('put', ref).expect(200);
    await call('put', '/watchlist/independent/' + secret.publicId).expect(404);
    expect(
      data(await call('get', '/watchlist?module=movies&limit=1').expect(200))
        .items[0].id,
    ).toBe(content.movies.publicId);
    expect(data(await call('get', '/watchlist', b).expect(200)).items).toEqual(
      [],
    );
    await call('delete', ref, b).expect(200);
    expect(await Watchlist.countDocuments({ owner: a.user._id })).toBe(5);
    await Movie.updateOne(
      { _id: content.movies._id },
      { $set: { status: 'archived' } },
    );
    const filtered = await call('get', '/watchlist?module=movies').expect(200);
    expect(filtered.text).not.toContain(content.movies.title);
    expect(data(filtered).items[0]).toMatchObject({ unavailable: true });
    await Movie.updateOne(
      { _id: content.movies._id },
      { $set: { status: 'published' } },
    );
  });

  it('saves only opted-in released full content with revision and time guards', async () => {
    const id = content.independent.publicId;
    const unset = data(await getState('independent', id).expect(200));
    expect(unset.enabled).toBe(false);
    await put('independent', id, unset).expect(403);
    await call('patch', '/preferences').send({ history: true }).expect(200);
    const initial = data(await getState('independent', id).expect(200));
    await put('independent', id, initial, { position: -1 }).expect(400);
    await put('independent', id, initial, { position: 110 }).expect(400);
    await put('independent', id, initial, { videoId: 'aBCDef123_-' }).expect(
      409,
    );
    const next = data(await put('independent', id, initial).expect(200));
    expect(next).toMatchObject({
      revision: 1,
      progress: { position: 30, completed: false },
    });
    await put('independent', id, initial, { position: 40 }).expect(409);
    expect(
      data(
        await put(
          'independent',
          id,
          { ...initial, revision: 1 },
          { position: 40 },
        ).expect(200),
      ).throttled,
    ).toBe(true);
    const secondSession = {
      token: (
        await sessions.open(
          await User.findById(a.user._id).select('+authVersion'),
        )
      ).accessToken,
    };
    expect(
      data(await getState('independent', id, secondSession).expect(200))
        .progress.position,
    ).toBe(30);
    expect(
      data(await getState('independent', id, b).expect(200)).progress,
    ).toBeNull();
    await getState('movies', content.movies.publicId).expect(400);
    await getState('live', content.event.publicId).expect(404);
    await getState('independent', content.upcoming.publicId).expect(404);
    await getState('live', content.live.publicId).expect(200);
    await getState('podcasts', content.podcasts.publicId).expect(200);
  });

  it('invalidates changed video and suppresses complete and dismissed items', async () => {
    const ref = content.independent.publicId;
    const prior = data(await getState('independent', ref).expect(200));
    await Film.collection.updateOne(
      { _id: content.independent._id },
      { $set: { 'mainVideo.providerVideoId': 'aBCDef123_-' } },
    );
    const changed = data(await getState('independent', ref).expect(200));
    expect(changed.progress).toBeNull();
    expect(changed.source).not.toBe(prior.source);
    await put('independent', ref, prior).expect(409);
    expect(
      data(await call('get', '/continue').expect(200)).items.map(
        (row) => row.id,
      ),
    ).not.toContain(ref);
    await Film.collection.updateOne(
      { _id: content.independent._id },
      { $set: { 'mainVideo.providerVideoId': videoId } },
    );
    expect(data(await call('get', '/continue').expect(200)).items[0].id).toBe(
      ref,
    );
    await call('delete', '/continue/independent/' + ref).expect(200);
    expect(await Playback.countDocuments({ owner: a.user._id })).toBe(1);
    expect(await Watchlist.countDocuments({ owner: a.user._id })).toBe(5);
    expect(data(await call('get', '/continue').expect(200)).items).toHaveLength(
      0,
    );
    const original = content.original.publicId;
    const fresh = data(await getState('original', original).expect(200));
    await put('original', original, fresh, { position: 95 }).expect(200);
    expect(
      data(await getState('original', original).expect(200)).progress.completed,
    ).toBe(true);
    expect(data(await call('get', '/continue').expect(200)).items).toHaveLength(
      0,
    );
  });

  it('keeps history private and prevents stale saves after deletion and opt-out', async () => {
    const id = content.independent.publicId;
    await call('delete', '/history/independent/' + id, b).expect(200);
    expect(
      data(await call('get', '/history', b).expect(200)).items,
    ).toHaveLength(0);
    expect(data(await call('get', '/history').expect(200)).items).toHaveLength(
      2,
    );
    const old = data(await getState('independent', id).expect(200));
    await call('delete', '/history/independent/' + id).expect(200);
    await put('independent', id, old).expect(409);
    await call('patch', '/preferences').send({ history: false }).expect(200);
    const disabled = data(await getState('independent', id).expect(200));
    await put('independent', id, disabled).expect(403);
    await call('delete', '/history').expect(200);
    expect(await Playback.countDocuments({ owner: a.user._id })).toBe(0);
    expect(await Watchlist.countDocuments({ owner: a.user._id })).toBe(5);
  });

  it('follows only published profiles and deduplicates notifications across overlapping credits', async () => {
    const id = talent.publicId;
    await call('patch', '/preferences')
      .send({ talentNotices: true })
      .expect(200);
    await Promise.all(
      Array.from({ length: 4 }, () =>
        call('put', '/following/' + id).expect(200),
      ),
    );
    await call('put', '/following/' + secondTalent.publicId).expect(200);
    await Following.collection.updateMany(
      { owner: a.user._id },
      { $set: { createdAt: new Date(+past - 86400000) } },
    );
    expect(await Following.countDocuments({ owner: a.user._id })).toBe(2);
    expect(
      data(await call('get', '/following', b).expect(200)).items,
    ).toHaveLength(0);
    const delivered = [];
    await scanReleaseNotices({ notify: (id) => delivered.push(id) });
    await scanReleaseNotices({ notify: (id) => delivered.push(id) });
    expect(delivered).toEqual([a.user.publicId]);
    const notices = data(
      await api('get', '/notifications?kind=releases&unread=true', a).expect(
        200,
      ),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      type: 'talent_release',
      destination: '/cinema/' + linkedFilm.slug,
    });
    await api('patch', '/notifications/' + notices[0].id + '/read', b).expect(
      404,
    );
    await api('patch', '/notifications/' + notices[0].id + '/read', a).expect(
      200,
    );
    expect(
      data(await api('get', '/notifications/unread', a).expect(200)).count,
    ).toBe(0);
    await Personality.updateOne(
      { _id: talent._id },
      { $set: { status: 'archived' } },
    );
    await call('put', '/following/' + id, b).expect(404);
    expect((await call('get', '/following').expect(200)).text).not.toContain(
      talent.displayName + '"',
    );
    await call('delete', '/following/' + id).expect(200);
    await call('delete', '/following/' + secondTalent.publicId).expect(200);
  });

  it('isolates homepage rails and applies recommendation preferences, public fallback and related filtering', async () => {
    await api('get', '/personal/homepage').expect(401);
    const before = data(
      await call('get', '/homepage')
        .expect('Cache-Control', 'no-store')
        .expect(200),
    );
    expect(before.personalized).toBe(false);
    expect(
      before.sections.find((row) => row.kind === 'watchlist').items,
    ).toHaveLength(5);
    expect(
      data(await call('get', '/homepage', b).expect(200)).sections.some(
        (row) => row.kind === 'watchlist',
      ),
    ).toBe(false);
    await call('patch', '/preferences')
      .send({
        recommendations: true,
        genres: ['drama'],
        types: ['independent'],
      })
      .expect(200);
    const home = data(await call('get', '/homepage').expect(200));
    expect(home.personalized).toBe(true);
    expect(
      home.sections.find((row) => row.kind === 'recommended').items[0].id,
    ).toBe(linkedFilm.publicId);
    await call('patch', '/preferences')
      .send({ recommendations: false })
      .expect(200);
    expect(data(await call('get', '/homepage').expect(200)).personalized).toBe(
      false,
    );
    const related = await api(
      'get',
      '/related/independent/' + content.independent.publicId,
    ).expect(200);
    expect(data(related).map((row) => row.id)).toContain(linkedFilm.publicId);
    expect(related.text).not.toContain(secret.title);
    expect(data(related).map((row) => row.id)).not.toContain(
      content.independent.publicId,
    );
    expect(data(await call('get', '/dashboard').expect(200)).counts.saved).toBe(
      5,
    );
    expect(
      data(await call('get', '/dashboard', b).expect(200)).counts.saved,
    ).toBe(0);
    const { value } = data(
      await api('get', '/admin/site/settings', b).expect(200),
    );
    await api('put', '/admin/site/settings', b)
      .send({
        revision: 0,
        settings: {
          ...value,
          personalization: {
            sections: ['watchlist'],
            position: 'after-hero',
            recommendations: false,
            recommendationLimit: 4,
          },
        },
      })
      .expect(200);
    expect(data(await call('get', '/homepage').expect(200))).toMatchObject({
      position: 'after-hero',
      sections: [{ kind: 'watchlist' }],
    });
    await SiteConfig.deleteOne({ _id: 'settings' });
  });
});
