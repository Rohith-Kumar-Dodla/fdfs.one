import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultSections } from '../../shared/homepage.js';
import { podcastBrand } from '../../shared/podcasts.js';
import { siteDefaults } from '../../shared/site.js';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { initializePhase22Indexes } from '../src/modules/admin/routes.js';
import { bootstrapSuper } from '../src/modules/admin/roles.js';
import {
  bootstrapFailure,
  bootstrapOptions,
  hiddenPassword,
} from '../src/modules/auth/bootstrap-config.js';
import { initializeAuthIndexes, User } from '../src/modules/auth/models.js';
import { createSessionService } from '../src/modules/auth/sessions.js';
import { Film } from '../src/modules/films/models.js';
import { LiveEvent } from '../src/modules/live/models.js';
import { MediaAsset } from '../src/modules/media/assets.js';
import {
  analyticsModels,
  AnalyticsClock,
  AnalyticsEvent,
} from '../src/modules/operations/analytics.js';
import { PodcastEpisode, PodcastShow } from '../src/modules/podcasts/models.js';
import { Movie, Review } from '../src/modules/reviews/models.js';
import { normalizedName, Personality } from '../src/modules/talent/models.js';
import { assembledHomepage } from '../src/modules/site/homepage.js';
import { Promotion } from '../src/modules/site/promotions.js';

const uri = process.env.TEST_MONGODB_RS_URI;
const origin = 'http://localhost:5173';
const config = {
  NODE_ENV: 'test',
  CORS_ORIGINS: [origin],
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX: 1000,
  ANALYTICS_ENABLED: true,
  ANALYTICS_TIMEZONE: 'UTC',
};
const env = {
  JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
  BCRYPT_COST: '10',
  APP_WEB_URL: origin,
};
const authConfig = {
  webOrigin: origin,
  accessSecret: env.JWT_ACCESS_SECRET,
  issuer: 'fdfs-test',
  audience: 'fdfs-api-test',
  accessTtl: 900,
  bcryptCost: 10,
  sessionMs: 86400000,
  secure: false,
};
const password = 'Isolated command account phrase';
const email = 'owner-phase61@example.test';
const data = (res) => res.body.data;
const home = '/admin/site/homepage';
const promos = '/admin/promotions';
const fromNow = (milliseconds) => new Date(Date.now() + milliseconds);
const apiApp = createApp({
  config,
  authConfig,
  logger: createLogger('silent'),
  isDatabaseConnected: () => true,
  phase22Options: { available: () => true },
});
const api = (method, path, token) => {
  const req = request(apiApp)[method]('/api/v1' + path);
  return token ? req.set('Authorization', 'Bearer ' + token) : req;
};
const browser = (req) => req.set('Origin', origin).set('X-FDFS-CSRF', '1');
const cookie = (res) => res.headers['set-cookie'][0].split(';')[0];
const cta = (label = 'Open event guide') => ({
  kind: 'external',
  label,
  url: 'https://example.test/guide',
});

it('gets bootstrap bcrypt from auth config and closes failures without echoing driver data', async () => {
  expect(config).not.toHaveProperty('BCRYPT_COST');
  const options = bootstrapOptions(config, password, env);
  const hashed = await bcrypt.hash(options.password, options.bcryptCost);
  expect(bcrypt.getRounds(hashed)).toBe(10);
  expect(await bcrypt.compare(password, hashed)).toBe(true);
  expect(bootstrapFailure({ code: 13, message: 'mongodb://private' })).toMatch(
    /denied access/i,
  );
  expect(
    bootstrapFailure({ code: 13, message: 'mongodb://private' }),
  ).not.toContain('mongodb://');
  const duplicate = {
    code: 11000,
    message: 'duplicate value private@example.test',
  };
  expect(bootstrapFailure(duplicate, 'write')).toMatch(/unique index/i);
  expect(bootstrapFailure(duplicate, 'write')).not.toContain(
    'private@example.test',
  );
  expect(() =>
    bootstrapOptions(config, password, { ...env, BCRYPT_COST: 'invalid' }),
  ).toThrow('Invalid bootstrap configuration');
});

it('reads Windows terminal carriage returns without echo and restores the terminal on cancel', async () => {
  const mode = [];
  const output = [];
  const stdin = Object.assign(new EventEmitter(), {
    isRaw: false,
    setRawMode(raw) {
      this.isRaw = raw;
      mode.push(raw);
    },
    setEncoding() {},
    pause() {},
    resume() {},
  });
  const terminal = { stdin, stderr: { write: (value) => output.push(value) } };
  const entered = hiddenPassword('New password: ', terminal);
  stdin.emit(
    'data',
    'phraseX' + String.fromCharCode(8) + '!' + String.fromCharCode(13),
  );
  expect(await entered).toBe('phrase!');
  expect(output).toEqual(['New password: ', String.fromCharCode(10)]);
  const cancelled = hiddenPassword('Confirm: ', terminal);
  stdin.emit('data', 'discarded' + String.fromCharCode(3));
  await expect(cancelled).rejects.toMatchObject({
    code: 'BOOTSTRAP_CANCELLED',
  });
  expect(mode).toEqual([true, false, true, false]);
  expect(stdin.listenerCount('data')).toBe(0);
  expect(output.join('')).not.toContain('discarded');
});

describe.skipIf(!uri)('Phase 6.1 isolated discovery and promotions', () => {
  let owner, scoped, legacy, viewer, asset, movie, hidden, late, upcoming, refs;
  beforeAll(async () => {
    await mongoose.connect(uri, {
      dbName: 'fdfs_homepage_test_' + randomBytes(8).toString('hex'),
      autoIndex: false,
    });
    await Promise.all([
      initializeAuthIndexes(),
      initializePhase22Indexes(),
      Promotion.createIndexes(),
      ...analyticsModels.map((model) => model.createIndexes()),
    ]);
    await bootstrapSuper(email, bootstrapOptions(config, password, env));
    const saved = await User.findOne({ email });
    const sessions = createSessionService(authConfig);
    async function account(roles, cmsModules) {
      const user = await User.create({
        fullName: 'Isolated user',
        email: randomUUID() + '@example.test',
        passwordHash: 'fixture',
        roles,
        cmsModules,
        emailVerifiedAt: new Date(),
      });
      return (
        await sessions.open(
          await User.findById(user._id).select('+authVersion'),
        )
      ).accessToken;
    }
    [scoped, legacy, viewer] = await Promise.all([
      account(['viewer', 'content_manager'], ['promotions']),
      account(['viewer', 'admin']),
      account(['viewer']),
    ]);
    asset = await MediaAsset.create({
      owner: saved.publicId,
      providerId: 'isolated/home-art',
      purpose: 'library',
      status: 'active',
      url: 'https://example.test/image/upload/home.jpg',
      width: 800,
      height: 450,
      bytes: 1200,
    });
    async function seed(model, label, extra = {}) {
      const slug = 'lantern-' + label.toLowerCase().replaceAll(' ', '-');
      const title = 'Lantern ' + label;
      const words = normalizedName(title).split(' ');
      const doc = {
        publicId: randomUUID(),
        title,
        slug,
        titlePrefixes:
          model === Movie
            ? words.flatMap((word) =>
                Array.from({ length: word.length }, (_, i) =>
                  word.slice(0, i + 1),
                ),
              )
            : words.map((_, i) => words.slice(i).join(' ')),
        status: 'published',
        synopsis: 'Safe public synopsis',
        publishedAt: fromNow(-3600000),
        releaseAt: fromNow(-3600000),
        createdAt: fromNow(-3600000),
        ...extra,
      };
      return {
        ...doc,
        _id: (await model.collection.insertOne(doc)).insertedId,
      };
    }
    const cinema = await seed(Film, 'Cinema', {
      classification: 'independent',
      genres: ['drama'],
      poster: asset._id,
      mainVideo: {
        provider: 'youtube',
        providerVideoId: 'private-video-fixture',
      },
    });
    const original = await seed(Film, 'Original', {
      classification: 'original',
      genres: ['drama'],
    });
    const show = await PodcastShow.collection.insertOne({
      slug: podcastBrand.slug,
      status: 'published',
    });
    const podcast = await seed(PodcastEpisode, 'Podcast', {
      show: show.insertedId,
      publicationAt: fromNow(-3600000),
    });
    const event = await seed(LiveEvent, 'Live', {
      moderation: 'approved',
      broadcast: 'live',
      startAt: fromNow(-3600000),
    });
    upcoming = await seed(LiveEvent, 'Upcoming', {
      moderation: 'approved',
      broadcast: 'scheduled',
      startAt: fromNow(86400000),
      remindersEnabled: true,
      video: { provider: 'youtube', providerVideoId: 'private-video-fixture' },
    });
    movie = await seed(Movie, 'Movie', {
      ratingCount: 5,
      genres: ['drama'],
      releaseDate: fromNow(-3600000),
    });
    const name = 'Lantern Talent';
    const talent = await seed(Personality, 'Talent', {
      displayName: name,
      searchNames: [normalizedName(name)],
    });
    const review = await seed(Review, 'Review', {
      targetType: 'movie',
      target: movie._id,
      author: saved._id,
      spoiler: false,
      body: 'Separate review body',
    });
    await seed(Review, 'Private Spoiler', {
      targetType: 'movie',
      target: movie._id,
      author: new mongoose.Types.ObjectId(),
      spoiler: true,
      body: 'Secret ending fixture',
    });
    hidden = await seed(Film, 'Hidden', {
      classification: 'independent',
      status: 'draft',
    });
    late = await seed(Film, 'Embargo', {
      classification: 'independent',
      releaseAt: fromNow(86400000),
      announce: false,
      mainVideo: { providerVideoId: 'private-video-fixture' },
    });
    refs = {
      independent: cinema,
      original,
      podcasts: podcast,
      live: event,
      movies: movie,
      talent,
      reviews: review,
    };
  }, 25000);
  afterAll(async () => {
    if (mongoose.connection.readyState === 1)
      await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  it('lists only canonical public pages in the sitemap and never includes protected sources', async () => {
    const result = await api('get', '/site/sitemap.xml').expect(200);
    expect(result.headers['cache-control']).toContain('s-maxage=60');
    expect(result.headers['content-type']).toContain('application/xml');
    for (const [key, path] of Object.entries({
      independent: '/cinema/',
      original: '/originals/',
      podcasts: '/podcasts/',
      live: '/live/',
      movies: '/movies/',
      talent: '/talent/',
      reviews: '/reviews/',
    }))
      expect(result.text).toContain(
        origin +
          path +
          (key === 'reviews' ? refs[key].publicId : refs[key].slug),
      );
    for (const excluded of [
      hidden.slug,
      late.slug,
      '/account',
      '/dashboard',
      '/support',
      '/admin',
      'private-video-fixture',
    ])
      expect(result.text).not.toContain(excluded);
  });

  it('signs in the isolated permanent owner, refreshes, logs out and restricts campaign access', async () => {
    const login = await browser(api('post', '/auth/login'))
      .send({ email, password })
      .expect(200);
    owner = data(login).accessToken;
    expect(
      data(await api('get', '/users/me', owner).expect(200)),
    ).toMatchObject({
      roles: ['viewer', 'admin', 'super_admin'],
      emailVerified: true,
      status: 'active',
    });
    await api('get', '/admin/overview', owner).expect(200);
    const refreshed = await browser(api('post', '/auth/refresh'))
      .set('Cookie', cookie(login))
      .expect(200);
    owner = data(refreshed).accessToken;
    await api('get', '/admin/overview', owner).expect(200);
    await api('get', promos, legacy).expect(403);
    await api('get', promos, viewer).expect(403);
    await api('get', promos, scoped).expect(200);
    await api('get', home, scoped).expect(403);
    await browser(api('post', '/auth/logout'))
      .set('Cookie', cookie(refreshed))
      .expect(200);
    await browser(api('post', '/auth/refresh'))
      .set('Cookie', cookie(refreshed))
      .expect(401);
    owner = data(
      await browser(api('post', '/auth/login'))
        .send({ email, password })
        .expect(200),
    ).accessToken;
    await expect(
      bootstrapSuper(
        'other-owner@example.test',
        bootstrapOptions(config, password, env),
      ),
    ).rejects.toMatchObject({ code: 'SUPER_BOOTSTRAPPED' });
  });
  it('assembles published module feeds with real genres and never returns embargoed IDs or sources', async () => {
    const result = await api('get', '/homepage')
      .expect('Cache-Control', 'no-store')
      .expect(200);
    const value = data(result);
    expect(
      value.slides.some(
        (item) => item.live && item.primary.label === 'Watch Live',
      ),
    ).toBe(true);
    const future = value.sections
      .find((row) => row.type === 'upcoming')
      .items.find((item) => item.id === upcoming.publicId);
    expect(future).toMatchObject({ upcoming: true, reminder: true });
    expect(
      value.sections.find((row) => row.type === 'genres').items,
    ).toContainEqual(
      expect.objectContaining({
        id: 'drama',
        count: 3,
        path: '/search?genre=drama',
      }),
    );
    expect(result.text).not.toContain(hidden.publicId);
    expect(result.text).not.toContain(late.publicId);
    expect(result.text).not.toContain('private-video-fixture');
    const published = [
      'independent',
      'original',
      'podcasts',
      'live',
      'movies',
      'talent',
    ];
    expect(
      value.sections.flatMap((row) => row.items.map((item) => item.module)),
    ).toEqual(expect.arrayContaining(published));
  });
  it('searches all channels, filters genres and layout and excludes drafts, embargoes and spoilers', async () => {
    const result = await api('get', '/search?q=Lantern&limit=4').expect(200);
    const groups = Object.fromEntries(
      data(result).groups.map((row) => [row.module, row]),
    );
    for (const [module, record] of Object.entries(refs))
      expect(groups[module].items).toContainEqual(
        expect.objectContaining({ id: record.publicId }),
      );
    expect(result.text).not.toMatch(
      /Secret ending fixture|Separate review body|Private Spoiler|private-video-fixture/,
    );
    expect(result.text).not.toContain(hidden.publicId);
    expect(result.text).not.toContain(late.publicId);
    for (const [module, partial] of [
      ['independent', 'Lantern Ci'],
      ['original', 'Ori'],
      ['podcasts', 'Lantern Pod'],
      ['movies', 'Lantern Mo'],
    ]) {
      const match = data(
        await api(
          'get',
          '/search?' + new URLSearchParams({ module, q: partial }),
        ).expect(200),
      );
      expect(match.groups[0].items[0].id).toBe(refs[module].publicId);
    }
    const suggested = data(
      await api('get', '/search/suggestions?q=Lan').expect(200),
    );
    expect(suggested.groups.every((group) => group.items.length <= 2)).toBe(
      true,
    );
    const filtered = data(
      await api('get', '/search?genre=drama&module=movies').expect(200),
    );
    expect(filtered.groups).toHaveLength(1);
    expect(filtered.groups[0].items[0].id).toBe(movie.publicId);
    await api('get', '/search?q=Lantern&page=101').expect(400);
  });
  it('keeps draft sections separate and publishes ordering, artwork and authorized upcoming slides', async () => {
    const target = { id: upcoming.publicId, module: 'live', upcoming: true };
    const slide = {
      id: randomUUID(),
      target,
      imageId: asset.publicId,
      mobileId: asset.publicId,
      focal: 'left',
    };
    const sections = [
      { ...defaultSections[8], heading: 'Selected language and genre' },
      { ...defaultSections[0], visible: false },
      {
        id: randomUUID(),
        type: 'featured',
        heading: 'Editor picks',
        layout: 'grid',
        visible: true,
        items: Object.entries(refs).map(([module, item]) => ({
          module,
          id: item.publicId,
        })),
      },
    ];
    const saved = data(
      await api('put', home, owner)
        .send({
          revision: 0,
          homepage: {
            sections,
            heroSlides: [slide],
            rotationSeconds: 6,
            releaseDays: 20,
            genres: [{ genre: 'drama', imageId: asset.publicId }],
          },
        })
        .expect(200),
    );
    expect(
      data(await api('get', '/homepage').expect(200)).sections.some(
        (section) => section.heading === 'Editor picks',
      ),
    ).toBe(false);
    const preview = data(
      await api('get', home + '/assembly', owner).expect(200),
    );
    expect(preview.slides[0]).toMatchObject({
      title: upcoming.title,
      primary: { label: 'View Event' },
      secondary: { label: 'Set Reminder' },
      image: { id: asset.publicId },
    });
    await api('post', home + '/publish', owner)
      .send({ revision: saved.revision })
      .expect(200);
    const publicHome = data(await api('get', '/homepage').expect(200));
    expect(publicHome.sections.map((row) => row.heading)).toEqual([
      'Selected language and genre',
      'Editor picks',
    ]);
    expect(publicHome.sections[1]).toMatchObject({
      layout: 'grid',
      items: expect.arrayContaining([
        { ...publicHome.sections[1].items[0], module: 'independent' },
      ]),
    });
    expect(publicHome.sections[1].items).toHaveLength(7);
  });
  it('enforces secured placements and lifecycle and aggregates only consented, eligible events', async () => {
    const section = defaultSections[8].id;
    const placements = [
      { slot: 'hero' },
      { slot: 'footer' },
      { slot: 'between', sectionId: section },
    ];
    const input = {
      name: 'Isolated partnership',
      title: 'Fixture sponsor event',
      type: 'sponsored',
      sponsor: 'Fixture sponsor',
      primary: cta(),
      alt: 'Fixture artwork',
      desktopId: asset.publicId,
      timezone: 'Asia/Kolkata',
      startAt: fromNow(60000).toISOString(),
      endAt: fromNow(120000).toISOString(),
      placements,
    };
    await api('post', promos, scoped)
      .send({ ...input, primary: { ...cta(), url: 'javascript:alert(1)' } })
      .expect(400);
    await api('post', promos, scoped)
      .send({ ...input, placements: [{ slot: 'rail', sectionId: section }] })
      .expect(400);
    let campaign = data(
      await api('post', promos, scoped).send(input).expect(201),
    );
    expect(campaign.state).toBe('draft');
    const path = promos + '/' + campaign.id;
    const transition = async (action) =>
      data(
        await api('post', path + '/status', scoped)
          .send({ action, revision: campaign.revision })
          .expect(200),
      );
    campaign = await transition('publish');
    expect(campaign.state).toBe('scheduled');
    expect(data(await api('get', '/homepage').expect(200)).footer).toHaveLength(
      0,
    );
    const future = await assembledHomepage({ now: fromNow(90000) });
    expect(future.slides[0]).toMatchObject({
      sponsor: input.sponsor,
      placement: 'hero',
    });
    expect(future.sections[0].between[0].id).toBe(campaign.id);
    expect(
      (await assembledHomepage({ now: fromNow(120001) })).footer,
    ).toHaveLength(0);
    const result = await api('get', promos + '?state=scheduled', scoped).expect(
      200,
    );
    expect(result.body.counts.scheduled).toBe(1);
    campaign = data(
      await api('patch', path, scoped)
        .send({
          ...input,
          startAt: fromNow(-60000).toISOString(),
          revision: campaign.revision,
        })
        .expect(200),
    );
    expect(campaign.state).toBe('active');
    const event = {
      campaign: campaign.id,
      placement: 'hero',
      visit: randomUUID(),
      kind: 'impression',
      consent: true,
    };
    const collect = async (input) =>
      data(
        await api('post', '/homepage/campaign-events').send(input).expect(202),
      );
    expect(await collect({ ...event, consent: false })).toEqual({
      collected: false,
    });
    expect(await collect({ ...event, placement: 'rail:' + section })).toEqual({
      collected: false,
    });
    expect(await collect(event)).toEqual({ collected: true });
    expect(await collect(event)).toEqual({ collected: false, duplicate: true });
    expect(await collect({ ...event, kind: 'click' })).toEqual({
      collected: true,
    });
    const report = data(
      await api('get', path + '/metrics?days=7', scoped).expect(200),
    );
    expect(report).toMatchObject({
      impressions: 1,
      clicks: 1,
      ctr: 100,
      placements: [{ placement: 'hero', impressions: 1, clicks: 1, ctr: 100 }],
    });
    expect(await AnalyticsClock.countDocuments()).toBe(0);
    expect(
      (await AnalyticsEvent.find().lean()).every(
        (row) =>
          row.expiresAt instanceof Date &&
          !JSON.stringify(row).includes(event.visit),
      ),
    ).toBe(true);
    await api('put', '/admin/site/settings', owner)
      .send({
        revision: 0,
        settings: { ...siteDefaults, analyticsOpen: false },
      })
      .expect(200);
    expect(await collect({ ...event, visit: randomUUID() })).toEqual({
      collected: false,
    });
    campaign = await transition('pause');
    expect(campaign.state).toBe('paused');
    expect(data(await api('get', '/homepage').expect(200)).footer).toHaveLength(
      0,
    );
    campaign = await transition('resume');
    expect(campaign.state).toBe('active');
    const internal = {
      ...input,
      startAt: fromNow(-60000).toISOString(),
      type: 'content',
      primary: {
        kind: 'internal',
        label: 'View the movie',
        target: { module: 'movies', id: movie.publicId },
      },
      revision: campaign.revision,
    };
    campaign = data(
      await api('patch', path, scoped).send(internal).expect(200),
    );
    expect(
      data(await api('get', '/homepage').expect(200)).footer[0].primary.href,
    ).toBe('/movies/' + movie.slug);
    await Movie.collection.updateOne(
      { _id: movie._id },
      { $set: { status: 'archived' } },
    );
    expect(data(await api('get', '/homepage').expect(200)).footer).toHaveLength(
      0,
    );
    campaign = await transition('archive');
    expect(campaign.state).toBe('archived');
    expect(
      data(await api('get', path + '/audit', scoped).expect(200)).map(
        (row) => row.action,
      ),
    ).toEqual(
      expect.arrayContaining([
        'promotion.create',
        'promotion.publish',
        'promotion.pause',
        'promotion.resume',
        'promotion.archive',
      ]),
    );
    expect(
      (await MediaAsset.findById(asset._id).lean()).references,
    ).toContainEqual(
      expect.objectContaining({ kind: 'promotion', targetId: campaign.id }),
    );
  });
  it('orders competing campaigns by priority and order and caps the hero placement', async () => {
    const guide = (title, priority, order) => ({
      title,
      name: title,
      type: 'announcement',
      primary: cta(),
      placements: [{ slot: 'hero' }],
      priority,
      order,
      startAt: fromNow(-60000).toISOString(),
      endAt: fromNow(60000).toISOString(),
    });
    const labels = [
      'Low priority',
      'Priority with higher display order',
      'Priority with lower display order',
      'Highest priority',
    ];
    for (const [i, [priority, order]] of [
      [0, 0],
      [50, 2],
      [50, 1],
      [90, 10],
    ].entries()) {
      const row = data(
        await api('post', promos, scoped)
          .send(guide(labels[i], priority, order))
          .expect(201),
      );
      await api('post', promos + '/' + row.id + '/status', scoped)
        .send({ revision: row.revision, action: 'publish' })
        .expect(200);
    }
    const result = data(await api('get', '/homepage').expect(200));
    expect(
      result.slides
        .filter((row) => row.placement === 'hero')
        .map((row) => row.title),
    ).toEqual([labels[3], labels[2], labels[1]]);
  });
  it('keeps configured hero order and renders a campaign once in the entertainment preview and published feed', async () => {
    const row = data(
      await api('post', promos, owner)
        .send({
          name: 'Managed campaign fixture',
          title: 'Managed campaign fixture',
          type: 'announcement',
          primary: cta(),
          startAt: fromNow(-60000).toISOString(),
          endAt: fromNow(60000).toISOString(),
          placements: [
            { slot: 'hero' },
            { slot: 'below', sectionId: defaultSections[2].id },
          ],
        })
        .expect(201),
    );
    await api('post', promos + '/' + row.id + '/status', owner)
      .send({ revision: row.revision, action: 'publish' })
      .expect(200);
    const current = data(await api('get', home, owner).expect(200));
    const cinema = { module: 'independent', id: refs.independent.publicId };
    const target = { module: 'live', id: upcoming.publicId, upcoming: true };
    const slides = [
      { id: randomUUID(), target: cinema },
      { id: randomUUID(), campaignId: row.id },
      { id: randomUUID(), target },
    ];
    const config = {
      ...current.value,
      managedHero: true,
      heroSlides: slides,
      featuredPicks: { independent: [cinema] },
    };
    await api('put', home, owner)
      .send({
        revision: current.revision,
        homepage: {
          ...config,
          heroSlides: [...slides, { ...slides[0], id: randomUUID() }],
        },
      })
      .expect(400);
    const draft = data(
      await api('put', home, owner)
        .send({ revision: current.revision, homepage: config })
        .expect(200),
    );
    const preview = data(
      await api('get', home + '/assembly?view=entertainment', owner).expect(
        200,
      ),
    );
    expect(preview.slides.map(({ id }) => id)).toEqual([
      cinema.id,
      row.id,
      target.id,
    ]);
    expect(
      preview.sections.find(({ key }) => key === 'independent').between,
    ).toEqual([]);
    await api('post', home + '/publish', owner)
      .send({ revision: draft.revision })
      .expect(200);
    const published = data(
      await api('get', '/homepage?view=entertainment').expect(200),
    );
    expect(published.slides.map(({ id }) => id)).toEqual(
      preview.slides.map(({ id }) => id),
    );
    expect(
      published.sections.find(({ key }) => key === 'independent').items[0].id,
    ).toBe(cinema.id);
  });
});
