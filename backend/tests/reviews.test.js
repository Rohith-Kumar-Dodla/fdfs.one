import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { bootstrapSuper } from '../src/modules/admin/roles.js';
import { AuditLog } from '../src/modules/admin/audit.js';
import { initializePhase22Indexes } from '../src/modules/admin/routes.js';
import { User, initializeAuthIndexes } from '../src/modules/auth/models.js';
import { createSessionService } from '../src/modules/auth/sessions.js';
import { Film } from '../src/modules/films/models.js';
import { MediaAsset } from '../src/modules/media/assets.js';
import { initializeOperationsIndexes } from '../src/modules/operations/routes.js';
import { SiteConfig } from '../src/modules/site/service.js';
import {
  initializeTalentIndexes,
  Personality,
} from '../src/modules/talent/models.js';
import {
  Movie,
  Rating,
  Review,
  ReviewLike,
  initializeReviewsIndexes,
} from '../src/modules/reviews/models.js';
import { movieCreate } from '../src/modules/reviews/schemas.js';

const uri = process.env.TEST_MONGODB_RS_URI;
const origin = 'http://localhost:5173';
const email = 'admin@fdfs.one';
const password = 'isolated-new-owner-' + randomUUID();
const fixture = Object.freeze({
  title: 'Isolated screening',
  genres: ['drama'],
  language: 'en',
  releaseDate: '2024-01-05',
});
const id = () => randomUUID();
it('validates movie dates, roles, rates and HTTPS metadata without demanding unknown fields', () => {
  expect(
    movieCreate.safeParse({ body: { title: 'Minimal title' } }).success,
  ).toBe(true);
  for (const more of [
    { releaseYear: 2025 },
    { runtimeMinutes: 0 },
    { genres: ['invented'] },
    { trailerUrl: 'https://youtu.be.example.test/Wb8Tq_HD4E8' },
    { mainUrl: 'https://example.test' },
    { links: [{ label: 'Official', url: 'http://example.test' }] },
    { credits: [{ personalityId: id(), role: 'unrecognized' }] },
    {
      metadata: {
        provider: 'other',
        id: 'item',
        attribution: 'Known source',
        externalRating: 12,
        scale: 10,
      },
    },
  ])
    expect(
      movieCreate.safeParse({ body: { ...fixture, ...more } }).success,
    ).toBe(false);
});
it('refuses non-interactive bootstrap before opening the database', () => {
  const result = spawnSync(
    process.execPath,
    [
      'src/modules/auth/bootstrap-super.js',
      '--email',
      email,
      '--confirm',
      email,
    ],
    { cwd: new URL('../', import.meta.url), encoding: 'utf8' },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('local interactive terminal');
});

describe.skipIf(!uri)('isolated Phase 5.1 HTTP and MongoDB workflows', () => {
  const auth = {
    webOrigin: origin,
    accessSecret: randomBytes(48).toString('hex'),
    issuer: 'reviews-test',
    audience: 'reviews-api',
    accessTtl: 900,
    bcryptCost: 10,
    sessionMs: 86400000,
    secure: false,
  };
  const config = {
    NODE_ENV: 'test',
    CORS_ORIGINS: [origin],
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX: 500,
  };
  const notify = vi.fn();
  const source = {
    id: 'tmdb',
    attribution: 'Isolated provider attribution',
    search: vi.fn(async () => [
      { id: '10', title: 'Imported fixture', year: 2020 },
    ]),
    details: vi.fn(async (id) => {
      if (id === '11') throw Error('private fixture provider error');
      if (id === '12')
        return {
          id,
          fields: {
            title: 'Bad metadata',
            trailerUrl: 'https://not-youtube.example.test',
          },
        };
      return {
        id,
        fields: {
          title: 'Imported fixture',
          genres: ['drama'],
          releaseDate: '2020-03-01',
        },
        people: [{ sourceId: '20', name: 'Unmatched person', credit: 'actor' }],
        images: ['/sample.jpg'],
        externalRating: 7,
        scale: 10,
      };
    }),
  };
  const app = createApp({
    config,
    authConfig: auth,
    logger: createLogger('silent'),
    isDatabaseConnected: () => true,
    phase22Options: { movieMetadataProvider: source, noticeNotify: notify },
  });
  const noProvider = createApp({
    config,
    authConfig: auth,
    logger: createLogger('silent'),
    isDatabaseConnected: () => true,
  });
  const requestFor = (method, path, actor, application = app) => {
    const call = request(application)[method]('/api/v1' + path);
    return actor
      ? call.set('Authorization', 'Bearer ' + actor.accessToken)
      : call;
  };
  const login = async (email, password) => {
    const result = await requestFor('post', '/auth/login')
      .set('Origin', origin)
      .set('X-FDFS-CSRF', '1')
      .send({ email, password })
      .expect(200);
    return result.body.data;
  };
  const data = (response) => response.body.data;
  let operator,
    viewer,
    second,
    third,
    regularAdmin,
    pending,
    reportsStaff,
    manager,
    person,
    artwork,
    movie,
    independent,
    original;
  async function account(
    name,
    roles = ['viewer'],
    emailVerifiedAt = new Date(),
    address,
  ) {
    const user = await User.create({
      fullName: name,
      email: address ?? name.toLowerCase() + '@example.test',
      passwordHash: await bcrypt.hash(password, 10),
      roles,
      emailVerifiedAt,
    });
    return { user, ...(await createSessionService(auth).open(user)) };
  }
  const createMovie = async (value, actor = operator) =>
    data(
      await requestFor('post', '/admin/movies', actor).send(value).expect(201),
    );
  const status = async (row, action) =>
    data(
      await requestFor('post', '/admin/movies/' + row.id + '/status', operator)
        .send({ revision: row.revision, action })
        .expect(200),
    );
  beforeAll(async () => {
    await mongoose.connect(uri, {
      dbName: 'fdfs_reviews_test_' + randomBytes(8).toString('hex'),
      autoIndex: false,
    });
    await Promise.all([
      initializeAuthIndexes(),
      initializePhase22Indexes(),
      initializeOperationsIndexes(),
      initializeReviewsIndexes(),
      initializeTalentIndexes(),
    ]);
    [viewer, second, third, regularAdmin, pending, reportsStaff, manager] =
      await Promise.all([
        account('Viewer'),
        account('Second'),
        account('Third'),
        account('Legacy', ['viewer', 'admin']),
        account('Pending', ['viewer'], null),
        account('Moderator', ['viewer', 'moderator']),
        account('Scoped', ['viewer', 'content_manager']),
      ]);
    await User.updateOne(
      { _id: manager.user._id },
      { $set: { cmsModules: ['movies'] } },
    );
    person = await Personality.create({
      displayName: 'Isolated Actor',
      sortName: 'isolated actor',
      slug: 'isolated-actor',
      status: 'published',
      introduction: 'An isolated profile',
      professions: ['actor'],
      createdBy: regularAdmin.user.publicId,
      updatedBy: regularAdmin.user.publicId,
    });
    artwork = await MediaAsset.create({
      providerId: 'isolated-art-' + id(),
      url: 'https://res.cloudinary.com/demo/image/upload/sample.png',
      purpose: 'library',
      status: 'active',
      owner: regularAdmin.user.publicId,
      width: 48,
      height: 48,
      bytes: 120,
      category: 'poster',
    });
    async function film(classification, title) {
      return Film.create({
        classification,
        title,
        titleKey: title.toLowerCase(),
        slug: title.toLowerCase(),
        synopsis: 'Isolated title',
        genres: ['drama'],
        language: 'en',
        runtimeMinutes: 10,
        releaseYear: 2025,
        createdBy: regularAdmin.user.publicId,
        updatedBy: regularAdmin.user.publicId,
        status: 'published',
        releaseAt: new Date(Date.now() - 1000),
      });
    }
    [independent, original] = await Promise.all([
      film('independent', 'Independent'),
      film('original', 'Original'),
    ]);
  }, 30000);
  afterAll(async () => {
    if (mongoose.connection.readyState === 1)
      await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  it('provisions and hashes a new owner, preserves legacy users and safely handles conflicts and reruns', async () => {
    await expect(
      bootstrapSuper(viewer.user.email, { password, bcryptCost: 10 }),
    ).rejects.toMatchObject({ code: 'SUPER_ACCOUNT_EXISTS' });
    const result = await bootstrapSuper(' ADMIN@FDFS.ONE ', {
      password,
      bcryptCost: 10,
    });
    expect(result).toMatchObject({
      email,
      status: 'active',
      emailVerified: true,
      roles: ['viewer', 'admin', 'super_admin'],
    });
    const stored = await User.findOne({ email }).select('+passwordHash').lean();
    expect(stored.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, stored.passwordHash)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(stored.passwordHash);
    const rerun = await bootstrapSuper(email, {
      password: password + 'a',
      bcryptCost: 10,
    });
    expect(rerun.id).toBe(result.id);
    expect(
      (await User.findOne({ email }).select('+passwordHash')).passwordHash,
    ).toBe(stored.passwordHash);
    await expect(
      bootstrapSuper('different@example.test', { password, bcryptCost: 10 }),
    ).rejects.toMatchObject({ code: 'SUPER_BOOTSTRAPPED' });
    operator = { user: stored, ...(await login(email, password)) };
    await requestFor('get', '/admin/overview', operator).expect(200);
    await requestFor('get', '/admin/overview', regularAdmin).expect(200);
    await requestFor('get', '/admin/movies', viewer).expect(403);
    await requestFor('get', '/admin/movies', manager).expect(200);
    await requestFor('get', '/admin/review-moderation/reports', manager).expect(
      403,
    );
    await requestFor('get', '/admin/movies', reportsStaff).expect(403);
    expect(
      await AuditLog.countDocuments({
        action: 'user.staff_changed',
        targetId: result.id,
      }),
    ).toBe(1);
  });
  it('creates, scopes, publishes, searches and credits movies with independent media rights', async () => {
    const body = {
      ...fixture,
      slug: 'isolated-screening',
      posterId: artwork.publicId,
      credits: [
        {
          personalityId: person.publicId,
          role: 'actor',
          character: 'Traveller',
        },
        { personalityId: person.publicId, role: 'writer' },
      ],
      metadata: {
        provider: 'other',
        id: 'isolated',
        attribution: 'Authorized test source',
        externalRating: 7.5,
        scale: 10,
      },
    };
    const draft = await createMovie(body, manager);
    await requestFor('get', '/movies/' + draft.slug).expect(404);
    await requestFor('get', '/ratings/movie/' + draft.slug).expect(404);
    await requestFor('get', '/admin/movies/' + draft.id, viewer).expect(403);
    await requestFor('post', '/admin/movies', operator)
      .send({ ...body, metadata: undefined })
      .expect(409);
    await requestFor('post', '/admin/movies', operator)
      .send({ ...body, slug: 'different-slug' })
      .expect(409);
    await requestFor('post', '/admin/movies/' + draft.id + '/status', operator)
      .send({ revision: draft.revision, action: 'publish' })
      .expect(400);
    await requestFor('patch', '/admin/movies/' + draft.id, operator)
      .send({ ...body, slug: undefined, revision: 99, artworkAuthorized: true })
      .expect(409);
    const edited = data(
      await requestFor('patch', '/admin/movies/' + draft.id, operator)
        .send({
          ...body,
          slug: undefined,
          revision: draft.revision,
          artworkAuthorized: true,
        })
        .expect(200),
    );
    movie = await status(edited, 'publish');
    const listed = data(
      await requestFor(
        'get',
        '/movies?q=screening&genre=drama&year=2024&language=en&sort=title',
      ).expect(200),
    );
    expect(listed.map((row) => row.id)).toEqual([movie.id]);
    const publicMovie = data(
      await requestFor('get', '/movies/' + movie.slug).expect(200),
    );
    expect(publicMovie.rating).toMatchObject({ average: null, count: 0 });
    expect(publicMovie.metadata.rating).toEqual({ value: 7.5, scale: 10 });
    expect(publicMovie).not.toHaveProperty('artworkAuthorized');
    const refs = await MediaAsset.findOne({
      publicId: artwork.publicId,
    }).lean();
    expect(refs.references).toContainEqual(
      expect.objectContaining({ kind: 'movie', targetId: movie.id }),
    );
    const credits = data(
      await requestFor('get', '/movies/' + movie.slug + '/credits').expect(200),
    );
    expect(credits.map((x) => x.role)).toEqual(['actor', 'writer']);
    const talent = data(
      await requestFor('get', '/talent/' + person.slug).expect(200),
    );
    expect(talent.movieAppearances[0].credits).toHaveLength(2);
    expect(talent.filmography).toEqual([]);
  }, 12000);
  it('validates optional provider previews, confirmation, duplicate identity, safe failures and fill-only refresh', async () => {
    const path = '/admin/movies/metadata';
    expect(
      data(
        await requestFor('get', path + '/search?q=fixture', operator).expect(
          200,
        ),
      )[0].id,
    ).toBe('10');
    await requestFor(
      'get',
      path + '/search?q=fixture',
      operator,
      noProvider,
    ).expect(503);
    await requestFor('get', path + '/11/preview', operator).expect(503);
    await requestFor('get', path + '/12/preview', operator).expect(502);
    const preview = data(
      await requestFor('get', path + '/10/preview', operator).expect(200),
    );
    expect(preview.unmatched).toHaveLength(1);
    expect(preview.draft.credits).toHaveLength(0);
    await requestFor('post', path + '/10/import', operator)
      .send({ confirm: false })
      .expect(400);
    const imported = data(
      await requestFor('post', path + '/10/import', operator)
        .send({ confirm: true })
        .expect(201),
    );
    expect(imported.status).toBe('draft');
    expect(imported.metadata.unmatched[0].sourceId).toBe('20');
    expect(imported.metadata.syncedAt).toBeTruthy();
    await requestFor('post', path + '/10/import', operator)
      .send({ confirm: true })
      .expect(409);
    const manuallyEdited = data(
      await requestFor('patch', '/admin/movies/' + imported.id, operator)
        .send({
          title: 'Staff catalogued title',
          synopsis: 'Staff summary',
          genres: ['drama'],
          releaseDate: '2020-03-01',
          revision: imported.revision,
          metadata: {
            provider: 'tmdb',
            id: '10',
            attribution: 'Isolated provider attribution',
          },
        })
        .expect(200),
    );
    const refreshed = data(
      await requestFor(
        'post',
        '/admin/movies/' + imported.id + '/metadata/refresh',
        operator,
      )
        .send({ confirm: true, revision: manuallyEdited.revision })
        .expect(200),
    );
    expect(refreshed).toMatchObject({
      title: 'Staff catalogued title',
      synopsis: 'Staff summary',
    });
    await requestFor('get', '/movies/' + imported.slug).expect(404);
  }, 12000);
  it('maintains concurrent half-star uniqueness, sums, and independent film targets', async () => {
    const path = '/ratings/movie/' + movie.slug;
    const vote = (account, rating) =>
      requestFor('put', path, account).send({ rating });
    await vote(pending, 5).expect(403);
    await vote(viewer, 0).expect(400);
    await vote(viewer, 0.6).expect(400);
    await Promise.all([
      vote(viewer, 1).expect(200),
      vote(viewer, 2.5).expect(200),
      vote(second, 4.5).expect(200),
      vote(third, 5).expect(200),
    ]);
    await vote(viewer, 3).expect(200);
    expect(await Rating.countDocuments({ targetType: 'movie' })).toBe(3);
    let stats = data(await requestFor('get', path).expect(200));
    expect(stats).toMatchObject({ average: (3 + 4.5 + 5) / 3, count: 3 });
    expect(stats.distribution.filter((bucket) => bucket.count)).toEqual([
      { stars: 3, count: 1 },
      { stars: 4.5, count: 1 },
      { stars: 5, count: 1 },
    ]);
    expect(
      data(await requestFor('get', path + '/mine', viewer).expect(200)).rating,
    ).toBe(3);
    const rank = (await Movie.findOne({ publicId: movie.id })).ratingRank;
    expect(rank).toBeCloseTo((15 + 3 + 4.5 + 5) / 8);
    await requestFor('delete', path, third).expect(200);
    stats = data(await requestFor('get', path).expect(200));
    expect(stats).toMatchObject({ count: 2, average: 3.75 });
    await requestFor('put', '/ratings/cinema/' + independent.slug, viewer)
      .send({ rating: 4 })
      .expect(200);
    await requestFor('put', '/ratings/original/' + original.slug, viewer)
      .send({ rating: 5 })
      .expect(200);
    await requestFor('put', '/ratings/original/' + independent.slug, viewer)
      .send({ rating: 5 })
      .expect(404);
    await Film.updateOne(
      { _id: original._id },
      { $set: { releaseAt: new Date(Date.now() + 60000) } },
    );
    await requestFor('get', '/ratings/original/' + original.slug).expect(404);
  }, 15000);
  it('enforces review ownership, concurrency, report moderation, trending and notification ownership', async () => {
    const base = '/reviews/movie/' + movie.slug;
    await requestFor('post', base, viewer)
      .send({ body: '<script>alert(0)</script>' })
      .expect(400);
    const first = data(
      await requestFor('post', base, viewer)
        .send({
          title: 'The ending',
          body: 'A strong ending with spoilers.',
          spoiler: true,
        })
        .expect(201),
    );
    const secondReview = data(
      await requestFor('post', base, second)
        .send({ body: 'Another legitimate response.' })
        .expect(201),
    );
    const path = base + '/' + first.id;
    await requestFor('post', base, viewer)
      .send({ body: 'Duplicate primary review' })
      .expect(409);
    await requestFor('patch', path, second)
      .send({ body: 'Edit someone else’s content.' })
      .expect(404);
    await requestFor('patch', path, viewer)
      .send({ body: 'An edited review body.', spoiler: true })
      .expect(200);
    let view = data(await requestFor('get', path).expect(200));
    expect(view).toMatchObject({
      spoiler: true,
      body: 'An edited review body.',
      rating: 3,
    });
    expect(view.author).not.toHaveProperty('email');
    expect(
      data(await requestFor('get', base + '?rating=4.5').expect(200)).map(
        (x) => x.id,
      ),
    ).toEqual([secondReview.id]);
    await Review.collection.updateMany(
      {},
      { $set: { createdAt: new Date(Date.now() - 15 * 86400000) } },
    );
    await Promise.all([
      requestFor('put', path + '/like', second).expect(200),
      requestFor('put', path + '/like', second).expect(200),
    ]);
    expect(await ReviewLike.countDocuments()).toBe(1);
    const comment = data(
      await requestFor('post', path + '/comments', second)
        .send({ body: 'A useful follow-up.' })
        .expect(201),
    );
    await requestFor('patch', path + '/comments/' + comment.id, viewer)
      .send({ body: 'Unauthorized follow-up edit.' })
      .expect(404);
    await requestFor('patch', path + '/comments/' + comment.id, second)
      .send({ body: 'A revised follow-up.' })
      .expect(200);
    expect(
      data(await requestFor('get', base + '?sort=trending').expect(200)).map(
        (x) => x.id,
      ),
    ).toEqual([first.id]);
    expect(
      data(await requestFor('get', '/reviews/trending').expect(200)).map(
        (row) => row.id,
      ),
    ).toEqual([first.id]);
    const notice = data(
      await requestFor('get', '/notifications', viewer).expect(200),
    )[0];
    expect(notice).toMatchObject({
      type: 'review_comment',
      destination: '/reviews/' + first.id,
    });
    expect(notify).toHaveBeenCalledWith(viewer.user.publicId);
    await requestFor(
      'patch',
      '/notifications/' + notice.id + '/read',
      second,
    ).expect(404);
    const reportPath = path + '/comments/' + comment.id + '/report';
    const reported = () =>
      requestFor('post', reportPath, third).send({ reason: 'spoiler' });
    expect(data(await reported().expect(202)).duplicate).toBe(false);
    expect(data(await reported().expect(202)).duplicate).toBe(true);
    const queue = '/admin/review-moderation/reports';
    await requestFor('get', queue, viewer).expect(403);
    const report = data(
      await requestFor('get', queue, reportsStaff).expect(200),
    )[0];
    expect(report).not.toHaveProperty('reporter');
    const decide = (id, action) =>
      requestFor('patch', queue + '/' + id, reportsStaff).send({
        action,
        reason: 'Reviewed against community rules.',
      });
    await decide(report.id, 'hide').expect(200);
    expect(
      data(await requestFor('get', path + '/comments').expect(200)),
    ).toEqual([]);
    expect(data(await requestFor('get', path).expect(200)).comments).toBe(0);
    await decide(report.id, 'restore').expect(200);
    expect(
      data(await requestFor('get', path + '/comments').expect(200)),
    ).toHaveLength(1);
    await requestFor('post', path + '/report', third)
      .send({ reason: 'inappropriate' })
      .expect(202);
    const reviewReport = data(
      await requestFor('get', queue + '?type=review', reportsStaff).expect(200),
    )[0];
    await decide(reviewReport.id, 'hide').expect(200);
    await requestFor('get', path).expect(404);
    expect(
      data(await requestFor('get', '/ratings/movie/' + movie.slug).expect(200))
        .count,
    ).toBe(2);
    await decide(reviewReport.id, 'restore').expect(200);
    view = data(await requestFor('get', path).expect(200));
    expect(view.likes).toBe(1);
    await requestFor('delete', path + '/like', second).expect(200);
    await requestFor('delete', path + '/comments/' + comment.id, second).expect(
      200,
    );
    expect(
      data(await requestFor('get', base + '?sort=trending').expect(200)),
    ).toEqual([]);
    await requestFor('delete', path, viewer).expect(200);
    await requestFor('get', path).expect(404);
    await requestFor('post', base, viewer)
      .send({ body: 'Replacement after deleting my own review.' })
      .expect(201);
    const abuse =
      '/admin/review-moderation/ratings/movie/' +
      movie.slug +
      '/' +
      viewer.user.publicId;
    await requestFor('patch', abuse, reportsStaff)
      .send({ action: 'exclude', reason: 'Confirmed duplicate-account abuse.' })
      .expect(200);
    await requestFor('put', '/ratings/movie/' + movie.slug, viewer)
      .send({ rating: 5 })
      .expect(409);
    expect(
      data(await requestFor('get', '/ratings/movie/' + movie.slug).expect(200))
        .count,
    ).toBe(1);
    await requestFor('patch', abuse, reportsStaff)
      .send({
        action: 'restore',
        reason: 'Ownership review resolved the concern.',
      })
      .expect(200);
    expect(
      data(await requestFor('get', '/ratings/movie/' + movie.slug).expect(200))
        .count,
    ).toBe(2);
  }, 18000);
  it('protects spoiler permalinks, owns history and keeps staff moderation scoped', async () => {
    const base = '/reviews/movie/' + movie.slug;
    const ownerBody = 'Another legitimate response.';
    const mine = data(
      await requestFor('get', base + '/mine', second).expect(200),
    );
    await requestFor('patch', base + '/' + mine.id, second)
      .send({ title: 'Hidden title', body: ownerBody, spoiler: true })
      .expect(200);
    const feed = data(
      await requestFor(
        'get',
        '/reviews/feed?type=movie&sort=recent&rating=4.5',
      ).expect(200),
    );
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      id: mine.id,
      spoiler: true,
      target: { slug: movie.slug },
    });
    expect(feed[0]).not.toHaveProperty('title');
    expect(feed[0]).not.toHaveProperty('body');
    const permalink = '/reviews/entry/' + mine.id;
    expect(
      data(await requestFor('get', permalink).expect(200)),
    ).not.toHaveProperty('body');
    expect(
      data(await requestFor('get', permalink + '?reveal=true').expect(200))
        .body,
    ).toBe(ownerBody);
    expect(
      data(
        await requestFor('get', base + '?summary=true&rating=4.5').expect(200),
      )[0],
    ).not.toHaveProperty('title');
    const history = '/account/reviews';
    await requestFor('get', history).expect(401);
    const yours = data(await requestFor('get', history, second).expect(200));
    expect(yours.map((x) => x.id)).toEqual([mine.id]);
    expect(
      data(await requestFor('get', history, viewer).expect(200)).map(
        (x) => x.id,
      ),
    ).not.toContain(mine.id);
    await requestFor('delete', history + '/reviews/' + mine.id, viewer).expect(
      404,
    );
    const [vote] = data(
      await requestFor('get', history + '?kind=ratings', second).expect(200),
    );
    expect(vote.rating).toBe(4.5);
    await requestFor('delete', history + '/ratings/' + vote.id, viewer).expect(
      404,
    );
    const moderation = '/admin/review-moderation/reviews';
    await requestFor('get', moderation, viewer).expect(403);
    const filtered = data(
      await requestFor(
        'get',
        moderation + '?spoiler=true&type=movie&q=Hidden',
        reportsStaff,
      ).expect(200),
    );
    expect(filtered.rows.map((row) => row.id)).toContain(mine.id);
    const url = moderation + '/' + mine.id;
    await requestFor('patch', url, reportsStaff)
      .send({ action: 'hide', reason: 'Verified report fixture.' })
      .expect(200);
    await requestFor('get', permalink + '?reveal=true').expect(404);
    expect(
      data(await requestFor('get', history, second).expect(200))[0].status,
    ).toBe('hidden');
    expect(
      data(await requestFor('get', url + '/audit', reportsStaff).expect(200))[0]
        .summary.reason,
    ).toBe('Verified report fixture.');
    expect(
      data(await requestFor('get', '/ratings/movie/' + movie.slug).expect(200))
        .count,
    ).toBe(2);
    await requestFor('patch', url, reportsStaff)
      .send({ action: 'restore', reason: 'Restored report fixture.' })
      .expect(200);
    await requestFor('put', base + '/' + mine.id + '/like', viewer).expect(200);
    const likedPath = '/reviews/likes?ids=' + mine.id;
    expect(
      data(await requestFor('get', likedPath, viewer).expect(200)),
    ).toEqual([mine.id]);
    expect(
      data(await requestFor('get', likedPath, second).expect(200)),
    ).toEqual([]);
    await requestFor('delete', history + '/reviews/' + mine.id, second).expect(
      200,
    );
    await requestFor('get', permalink).expect(404);
  }, 15000);
  it('uses the same review and discussion workflows for released Cinema and Originals', async () => {
    await Film.updateOne(
      { _id: original._id },
      { $set: { releaseAt: new Date(Date.now() - 1000) } },
    );
    for (const [type, film] of [
      ['cinema', independent],
      ['original', original],
    ]) {
      const path = '/reviews/' + type + '/' + film.slug;
      const review = data(
        await requestFor('post', path, viewer)
          .send({ body: 'A thoughtful discussion of this short film.' })
          .expect(201),
      );
      await requestFor('put', path + '/' + review.id + '/like', second).expect(
        200,
      );
      await requestFor('post', path + '/' + review.id + '/comments', second)
        .send({
          body: 'This discussion works across the short-film catalogue.',
        })
        .expect(201);
      expect(
        data(
          await requestFor('get', '/reviews/feed?type=' + type).expect(200),
        )[0].id,
      ).toBe(review.id);
      expect(
        data(
          await requestFor('get', '/reviews/entry/' + review.id).expect(200),
        ),
      ).toMatchObject({
        likes: 1,
        comments: 1,
        target: { type, slug: film.slug },
      });
    }
  }, 12000);
  it('owns pending movie requests and resolves reviews and aggregate ratings exactly once', async () => {
    const url = '/account/movie-requests';
    const fixture = {
      title: 'Catalogued Fixture',
      year: 2024,
      details: 'English',
      body: 'Written before the movie was catalogued.',
      rating: 3.5,
      spoiler: true,
    };
    const submit = (values = fixture) =>
      requestFor('post', url, third, noProvider).send(values);
    const saved = data(await submit().expect(201));
    expect(saved).toMatchObject({
      status: 'pending',
      body: fixture.body,
      rating: 3.5,
    });
    await submit({ ...fixture, title: 'CATALOGUED—fixture' }).expect(409);
    const otherFilm = data(
      await submit({ ...fixture, year: 1994 }).expect(201),
    );
    expect(data(await requestFor('get', url, second).expect(200))).toEqual([]);
    await requestFor('patch', url + '/' + saved.id, second)
      .send({ ...fixture, revision: saved.revision })
      .expect(404);
    await requestFor('get', '/admin/movie-requests', reportsStaff).expect(403);
    const created = data(
      await requestFor('post', '/admin/movies', operator)
        .send({
          title: fixture.title,
          synopsis: 'Private movie fixture.',
          releaseYear: 2024,
          language: 'en',
          genres: ['drama'],
        })
        .expect(201),
    );
    await requestFor(
      'post',
      '/admin/movies/' + created.id + '/status',
      operator,
    )
      .send({ action: 'publish', revision: created.revision })
      .expect(200);
    const credits =
      '/admin/talent/' + person.publicId + '/credits/movies/' + created.id;
    const state = data(await requestFor('get', credits, operator).expect(200));
    await requestFor('put', credits, operator)
      .send({
        revision: state.revision,
        rows: [
          { role: 'actor', character: 'Lead Investigator' },
          { role: 'director', character: 'Sequence Director' },
        ],
      })
      .expect(200);
    const assigned = data(
      await requestFor('get', '/admin/movies/' + created.id, operator).expect(
        200,
      ),
    );
    expect(assigned.credits).toMatchObject([
      { personalityId: person.publicId, character: 'Lead Investigator' },
      { personalityId: person.publicId, character: 'Sequence Director' },
    ]);
    await requestFor('put', credits, operator)
      .send({ revision: state.revision, rows: [] })
      .expect(409);
    const ratingPath = '/ratings/movie/' + created.slug;
    expect(data(await requestFor('get', ratingPath).expect(200)).count).toBe(0);
    const resolve = (id, body) =>
      requestFor(
        'post',
        '/admin/movie-requests/' + id + '/resolve',
        operator,
      ).send(body);
    const approval = {
      action: 'approve',
      revision: saved.revision,
      movie: created.slug,
    };
    const results = await Promise.all([
      resolve(saved.id, approval).expect(200),
      resolve(saved.id, approval).expect(200),
    ]);
    expect(results.map((response) => data(response).reviewId)).toEqual([
      data(results[0]).reviewId,
      data(results[0]).reviewId,
    ]);
    expect(data(results[0])).toMatchObject({
      status: 'approved',
      movieSlug: created.slug,
    });
    expect(data(await requestFor('get', ratingPath).expect(200))).toMatchObject(
      { count: 1, average: 3.5 },
    );
    const history = data(
      await requestFor('get', '/account/reviews?kind=reviews', third).expect(
        200,
      ),
    );
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: data(results[0]).reviewId,
          body: fixture.body,
          spoiler: true,
        }),
      ]),
    );
    expect(
      data(
        await resolve(otherFilm.id, {
          ...approval,
          revision: otherFilm.revision,
        }).expect(200),
      ),
    ).toMatchObject({ status: 'conflict', open: true, body: fixture.body });
    const rejected = data(
      await resolve(otherFilm.id, {
        action: 'reject',
        revision: otherFilm.revision + 1,
        message: 'The submitted year identifies a different title.',
      }).expect(200),
    );
    expect(rejected).toMatchObject({
      status: 'rejected',
      open: false,
      rating: 3.5,
    });
    expect(data(await requestFor('get', ratingPath).expect(200)).count).toBe(1);
    const notifications = data(
      await requestFor('get', '/notifications?kind=reviews', third).expect(200),
    );
    expect(
      notifications.filter((entry) => entry.type === 'movie_request'),
    ).toHaveLength(3);
    const cancelled = data(
      await submit({ ...fixture, title: 'Withdrawable title' }).expect(201),
    );
    await requestFor('delete', url + '/' + cancelled.id, third).expect(200);
    expect(
      data(await requestFor('get', url, third).expect(200)).map(({ id }) => id),
    ).not.toContain(cancelled.id);
    await status(assigned, 'archive');
  });
  it('checks reviews analytics visibility, supports maintenance and removes archived targets from all public queries', async () => {
    const route = '/analytics/events';
    await requestFor('post', route, viewer)
      .send({
        id: id(),
        kind: 'page',
        module: 'reviews',
        device: 'desktop',
        content: movie.slug,
      })
      .expect(202);
    await requestFor('post', route, viewer)
      .send({
        id: id(),
        kind: 'playback',
        module: 'reviews',
        device: 'desktop',
        content: movie.slug,
      })
      .expect(400);
    await SiteConfig.updateOne(
      { _id: 'settings' },
      { $set: { value: { maintenance: true } } },
      { upsert: true },
    );
    await requestFor('get', '/support/config').expect(200);
    await requestFor('get', '/movies').expect(503);
    await SiteConfig.updateOne(
      { _id: 'settings' },
      { $set: { value: { maintenance: false } } },
    );
    const latest = data(
      await requestFor('get', '/admin/movies/' + movie.id, operator).expect(
        200,
      ),
    );
    const draft = await status(latest, 'unpublish');
    expect(
      data(
        await requestFor(
          'get',
          '/reviews/feed?sort=trending&type=movie',
        ).expect(200),
      ),
    ).toEqual([]);
    await requestFor('get', '/movies/' + movie.slug).expect(404);
    await requestFor('get', '/reviews/movie/' + movie.slug).expect(404);
    await requestFor('get', '/ratings/movie/' + movie.slug).expect(404);
    await requestFor('post', route, viewer)
      .send({
        id: id(),
        kind: 'page',
        module: 'reviews',
        device: 'desktop',
        content: movie.slug,
      })
      .expect(400);
    expect(
      data(await requestFor('get', '/talent/' + person.slug).expect(200))
        .movieAppearances,
    ).toEqual([]);
    expect((await status(draft, 'archive')).status).toBe('archived');
  }, 12000);
});
