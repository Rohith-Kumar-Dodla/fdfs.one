import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { siteDefaults } from '../../shared/site.js';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { initializePhase22Indexes } from '../src/modules/admin/routes.js';
import { bootstrapSuper } from '../src/modules/admin/roles.js';
import { initializeAuthIndexes, User } from '../src/modules/auth/models.js';
import { createSessionService } from '../src/modules/auth/sessions.js';
import { initializeFilmIndexes } from '../src/modules/films/models.js';
import { initializeLiveIndexes } from '../src/modules/live/routes.js';
import { MediaAsset } from '../src/modules/media/assets.js';
import { initializePodcastIndexes } from '../src/modules/podcasts/routes.js';
import { initializeTalentIndexes } from '../src/modules/talent/models.js';

const uri = process.env.TEST_MONGODB_RS_URI;
const origin = 'http://localhost:5173';
const authConfig = {
  webOrigin: origin,
  accessSecret: randomBytes(48).toString('hex'),
  issuer: 'fdfs-test',
  audience: 'fdfs-api-test',
  accessTtl: 900,
  bcryptCost: 10,
  sessionMs: 86400000,
  secure: false,
};
const app = createApp({
  config: {
    NODE_ENV: 'test',
    CORS_ORIGINS: [origin],
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX: 1000,
  },
  authConfig,
  logger: createLogger('silent'),
  isDatabaseConnected: () => true,
  phase22Options: {
    available: () => true,
    mediaProvider: { async remove() {} },
  },
});
const sessions = createSessionService(authConfig);
const take = (result) => result.body.data;
const video = 'https://youtu.be/aBCDef123_-';
const filmInput = {
  title: 'Isolated Cinema',
  synopsis: 'Isolated short synopsis.',
  description: 'Isolated complete description.',
  genres: ['drama'],
  language: 'en',
  runtimeMinutes: 5,
  releaseYear: 2026,
  mainUrl: video,
  rightsConfirmed: true,
};
const stage = (publicId) => '/admin/users/' + publicId + '/staff';

describe.skipIf(!uri)('Phase 4A.1 isolated CMS', () => {
  let admin,
    governor,
    manager,
    moderator,
    viewer,
    asset,
    film,
    original,
    talent,
    podcast,
    live;
  const api = (method, path, actor) => {
    const result = request(app)[method]('/api/v1' + path);
    return actor
      ? result.set('Authorization', 'Bearer ' + actor.accessToken)
      : result;
  };
  const open = async (user) => ({
    user,
    ...(await sessions.open(
      await User.findById(user._id).select('+authVersion'),
    )),
  });
  const publish = async (path, record, release) =>
    take(
      await api('post', path + '/status', admin)
        .send({
          action: 'publish',
          revision: record.revision,
          ...(release && { release }),
        })
        .expect(200),
    );

  beforeAll(async () => {
    await mongoose.connect(uri, {
      dbName: 'fdfs_cms_test_' + randomBytes(8).toString('hex'),
      autoIndex: false,
    });
    await Promise.all([
      initializeAuthIndexes(),
      initializePhase22Indexes(),
      initializeFilmIndexes(),
      initializeTalentIndexes(),
      initializeLiveIndexes(),
      initializePodcastIndexes(),
    ]);
    async function account(fullName, roles, verified = true) {
      return open(
        await User.create({
          fullName,
          email: randomUUID() + '@example.test',
          passwordHash: 'fixture',
          roles,
          emailVerifiedAt: verified ? new Date() : null,
        }),
      );
    }
    admin = await account('Legacy operator', ['viewer', 'admin']);
    governor = await account('Initial owner', ['viewer', 'admin']);
    manager = await account('Scoped manager', ['viewer']);
    moderator = await account('Moderator', ['viewer', 'moderator']);
    viewer = await account('Viewer', ['viewer'], false);
    asset = await MediaAsset.create({
      owner: admin.user.publicId,
      providerId: 'isolated/cms-art',
      purpose: 'library',
      status: 'active',
      url: 'https://example.test/image/upload/test.jpg',
      width: 800,
      height: 450,
      bytes: 1200,
    });
  }, 20000);

  afterAll(async () => {
    if (mongoose.connection.readyState === 1)
      await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('preserves legacy administrator access, bootstraps one owner, and restricts role assignment immediately', async () => {
    await api('get', '/admin/overview', admin).expect(200);
    await api('get', '/admin/overview', viewer).expect(403);
    const grant = {
      role: 'content_manager',
      enabled: true,
      modules: ['independent'],
      reason: 'Assign Cinema workflow',
    };
    await api('patch', stage(manager.user.publicId), admin)
      .send(grant)
      .expect(403);
    const before = governor;
    expect((await bootstrapSuper(governor.user.email)).roles).toContain(
      'super_admin',
    );
    await expect(bootstrapSuper(admin.user.email)).rejects.toMatchObject({
      code: 'SUPER_BOOTSTRAPPED',
    });
    await api('get', '/admin/overview', before).expect(401);
    governor = await open(governor.user);
    await api('patch', stage(governor.user.publicId), governor)
      .send({
        role: 'super_admin',
        enabled: false,
        reason: 'Attempt to remove own role',
      })
      .expect(403);
    await api(
      'patch',
      '/admin/users/' + governor.user.publicId + '/status',
      admin,
    )
      .send({ status: 'suspended' })
      .expect(403);
    await api('patch', stage(manager.user.publicId), governor)
      .send(grant)
      .expect(200);
    await api('get', '/admin/overview', manager).expect(401);
    manager = await open(manager.user);
    expect(
      take(await api('get', '/admin/overview', manager).expect(200)),
    ).toMatchObject({ cinema: 0 });
    expect(
      take(await api('get', '/admin/overview', manager).expect(200)),
    ).not.toHaveProperty('users');
    await api('get', '/admin/films?classification=original', manager).expect(
      403,
    );
    await api('get', '/admin/site/settings', manager).expect(403);
    await api('get', '/admin/moderation/live-reports', moderator).expect(200);
    await api('get', '/admin/audit', moderator).expect(403);
    const result = await api(
      'get',
      '/admin/audit?action=user.staff_changed&target=' + manager.user.publicId,
      governor,
    ).expect(200);
    expect(take(result)[0].summary.reason).toBe(grant.reason);
  });

  it('creates and publishes Cinema and Originals directly with scoped draft access and stale-edit protection', async () => {
    const input = {
      ...filmInput,
      classification: 'independent',
      posterId: asset.publicId,
    };
    film = take(
      await api('post', '/admin/cinema', manager).send(input).expect(201),
    );
    const path = '/admin/films/' + film.id;
    await api('get', path, moderator).expect(403);
    await api('get', '/films/' + film.slug).expect(404);
    await api('post', path + '/status', manager)
      .send({
        action: 'publish',
        revision: film.revision,
        release: { playbackChecked: false },
      })
      .expect(400);
    film = await publish(path, film, { playbackChecked: true });
    expect(
      take(
        await api(
          'get',
          '/films/' + film.slug + '?classification=independent',
        ).expect(200),
      ).mainVideo.providerVideoId,
    ).toBe('aBCDef123_-');
    await api('get', '/films/' + film.slug + '?classification=original').expect(
      404,
    );
    await api('patch', path, admin)
      .send({ ...filmInput, keepPublished: true, revision: film.revision - 1 })
      .expect(409);
    const revised = {
      ...filmInput,
      posterId: asset.publicId,
      title: 'Isolated Cinema updated',
    };
    film = take(
      await api('patch', path, admin)
        .send({ ...revised, keepPublished: true, revision: film.revision })
        .expect(200),
    );
    expect(
      take(await api('get', '/films/' + film.slug).expect(200)).title,
    ).toBe(revised.title);
    await api('patch', path, admin)
      .send({
        ...revised,
        rightsConfirmed: false,
        keepPublished: true,
        revision: film.revision,
      })
      .expect(409);
    original = take(
      await api('post', '/admin/films', admin)
        .send({
          ...filmInput,
          classification: 'original',
          title: 'Isolated Original',
          productionCompany: 'Authorized test fixture',
        })
        .expect(201),
    );
    await api('get', '/admin/films/' + original.id, manager).expect(403);
    const future = new Date(Date.now() + 600000).toISOString();
    original = await publish('/admin/films/' + original.id, original, {
      playbackChecked: true,
      releaseAt: future,
      announce: true,
    });
    expect(
      take(
        await api(
          'get',
          '/films/' + original.slug + '?classification=original',
        ).expect(200),
      ),
    ).not.toHaveProperty('mainVideo');
    expect(
      take(
        await api('get', '/films?classification=independent').expect(200),
      ).map(({ id }) => id),
    ).not.toContain(original.id);
  });

  it('publishes Talent, podcasts and live events using their existing domain workflows', async () => {
    talent = take(
      await api('post', '/admin/talent', admin)
        .send({
          displayName: 'Isolation Profile',
          introduction: 'Isolated talent for CMS validation.',
          professions: ['actor', 'podcast_guest'],
        })
        .expect(201),
    );
    talent = await publish('/admin/talent/' + talent.id, talent);
    expect(
      take(await api('get', '/talent/' + talent.slug).expect(200)).displayName,
    ).toBe(talent.displayName);
    const show = take(
      await api('put', '/admin/podcasts/show', admin)
        .send({
          name: 'Isolated podcast',
          introduction: 'An isolated fixture.',
          description: 'Authorized fixture summary.',
          languages: ['en'],
          rightsConfirmed: true,
        })
        .expect(200),
    );
    await publish('/admin/podcasts/show', show);
    podcast = take(
      await api('post', '/admin/podcasts/episodes', admin)
        .send({
          title: 'Isolated podcast episode',
          synopsis: 'Isolated episode synopsis.',
          language: 'en',
          number: 1,
          duration: 120,
          mainUrl: video,
          rightsConfirmed: true,
          commentsEnabled: false,
          participants: [{ personalityId: talent.id, role: 'guest' }],
        })
        .expect(201),
    );
    podcast = await publish('/admin/podcasts/episodes/' + podcast.id, podcast, {
      playbackChecked: true,
    });
    const episodePath = '/podcasts/episodes/' + podcast.slug;
    expect(take(await api('get', episodePath).expect(200))).toMatchObject({
      commentsEnabled: false,
    });
    await api('get', episodePath + '/comments').expect(404);
    expect(
      take(await api('get', '/talent/' + talent.slug).expect(200))
        .podcastAppearances[0].id,
    ).toBe(podcast.id);
    live = take(
      await api('post', '/admin/live', admin)
        .send({
          title: 'Isolated live listing',
          summary: 'An isolated event listing.',
          description: 'An authorized isolated event fixture.',
          category: 'community',
          language: 'en',
          startAt: new Date(Date.now() + 1200000).toISOString(),
          timeZone: 'Asia/Kolkata',
          posterId: asset.publicId,
          rightsConfirmed: true,
          videoUrl: video,
        })
        .expect(201),
    );
    const liveAdmin = '/admin/live/' + live.id;
    const draft = live;
    await api('get', '/live/' + live.slug).expect(404);
    live = take(
      await api('patch', liveAdmin + '/status', admin)
        .send({
          action: 'publish',
          revision: live.revision,
          publicationAt: new Date(Date.now() + 600000).toISOString(),
        })
        .expect(200),
    );
    await api('get', '/live/' + draft.slug).expect(404);
    await api('patch', liveAdmin + '/status', admin)
      .send({ action: 'start', revision: live.revision, broadcasting: true })
      .expect(409);
    live = take(
      await api('patch', liveAdmin + '/status', admin)
        .send({ action: 'unpublish', revision: live.revision })
        .expect(200),
    );
    live = take(
      await api('patch', liveAdmin + '/status', admin)
        .send({ action: 'publish', revision: live.revision })
        .expect(200),
    );
    expect(
      take(await api('get', '/live/' + live.slug).expect(200)),
    ).not.toHaveProperty('video');
    expect(
      take(await api('get', '/admin/overview', admin).expect(200)),
    ).toMatchObject({
      users: 5,
      verified: 4,
      unverified: 1,
      suspended: 0,
      cinema: 1,
      originals: 0,
      episodes: 1,
      talent: 1,
      scheduled: 1,
      live: 0,
      replays: 0,
      reviewQueue: 0,
      reports: 0,
    });
  }, 12000);

  it('validates homepage revisions and prevents unpublished content and private settings exposure', async () => {
    const path = '/admin/site/homepage';
    await api('get', path + '/preview', moderator).expect(403);
    const reference = { module: 'independent', id: film.id };
    const homepage = {
      hero: {
        title: 'CMS test heading',
        imageId: asset.publicId,
        featured: reference,
      },
      sections: [
        {
          id: randomUUID(),
          type: 'latest',
          module: 'podcasts',
          limit: 3,
          heading: 'Latest',
          visible: true,
        },
      ],
    };
    await api('put', path, admin)
      .send({
        revision: 0,
        homepage: {
          ...homepage,
          hero: {
            ...homepage.hero,
            featured: { module: 'original', id: original.id },
          },
        },
      })
      .expect(400);
    const saved = take(
      await api('put', path, admin).send({ revision: 0, homepage }).expect(200),
    );
    await api('put', path, admin).send({ revision: 0, homepage }).expect(409);
    expect(
      take(await api('get', path + '/preview', admin).expect(200)).sections[0]
        .module,
    ).toBe('podcasts');
    expect(
      take(await api('get', '/site/homepage').expect(200)),
    ).not.toHaveProperty('hero');
    await api('post', path + '/publish', admin)
      .send({ revision: saved.revision })
      .expect(200);
    expect(
      take(await api('get', '/site/homepage').expect(200)).hero.featured.id,
    ).toBe(film.id);
    await api('delete', '/admin/media/' + asset.publicId, admin).expect(409);
    const media = take(
      await api('patch', '/admin/media/' + asset.publicId, admin)
        .send({
          title: 'CMS approved art',
          alt: 'Isolated stage photograph',
          category: 'branding',
        })
        .expect(200),
    );
    expect(media.usage.map(({ kind }) => kind)).toContain('homepage-published');
    expect(
      take(
        await api(
          'get',
          '/admin/media?q=approved&category=branding&usage=used',
          admin,
        ).expect(200),
      ),
    ).toHaveLength(1);
    await api('post', '/admin/films/' + film.id + '/status', admin)
      .send({ action: 'unpublish', revision: film.revision })
      .expect(200);
    const publicHome = take(await api('get', '/site/homepage').expect(200));
    expect(publicHome.hero).not.toHaveProperty('featured');
    expect(publicHome).not.toHaveProperty('sections');
  });

  it('enforces maintenance, registration and community flags while preserving administrator access', async () => {
    const url = '/admin/site/settings';
    const proposed = {
      ...siteDefaults,
      name: 'Isolated settings',
      legal: { privacy: '<script>plain text</script>' },
      logoId: asset.publicId,
      links: [{ label: 'Public link', url: 'https://example.test' }],
      registrationOpen: false,
      communityOpen: false,
    };
    await api('put', url, admin)
      .send({
        revision: 0,
        settings: {
          ...proposed,
          links: [{ label: 'Unsafe', url: 'javascript:alert(1)' }],
        },
      })
      .expect(400);
    await api('put', url, admin)
      .send({
        revision: 0,
        settings: { ...proposed, infrastructureSecret: 'unknown field' },
      })
      .expect(400);
    const applied = take(
      await api('put', url, admin)
        .send({ revision: 0, settings: proposed })
        .expect(200),
    );
    const settings = take(await api('get', '/site/settings').expect(200));
    expect(settings.legal.privacy).toBe('<script>plain text</script>');
    expect(settings.logo).toHaveProperty('url');
    for (const key of [
      'revision',
      'logoId',
      'references',
      'uploadedBy',
      'owner',
    ])
      expect(settings).not.toHaveProperty(key);
    expect(
      take(await api('post', '/auth/register').send({}).expect(403)),
    ).toBeUndefined();
    await api('post', '/live/' + live.slug + '/chat/reports', admin)
      .send({})
      .expect(403);
    await api('put', url, admin)
      .send({
        revision: applied.revision,
        settings: { ...proposed, maintenance: true },
      })
      .expect(200);
    await api('get', '/live/' + live.slug).expect(503);
    await api('get', '/health').expect(200);
    await api('get', '/ready').expect(200);
    await api('get', '/admin/overview', admin).expect(200);
    await api('get', url, admin).expect(200);
  });
});
