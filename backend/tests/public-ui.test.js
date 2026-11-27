import { randomUUID, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { User } from '../src/modules/auth/models.js';
import { Film, FilmCredit } from '../src/modules/films/models.js';
import { LiveEvent } from '../src/modules/live/models.js';
import { Movie, Review, RatingTotals } from '../src/modules/reviews/models.js';
import {
  PodcastShow,
  PodcastEpisode,
  EpisodeParticipant,
} from '../src/modules/podcasts/models.js';
import { Personality } from '../src/modules/talent/models.js';
import { SiteConfig } from '../src/modules/site/service.js';
import { publicHomeSections } from '../../shared/public-home.js';
import { podcastBrand } from '../../shared/podcasts.js';

const uri = process.env.TEST_MONGODB_RS_URI;
const origin = 'http://localhost:5173';
const authConfig = {
  webOrigin: origin,
  accessSecret: randomBytes(48).toString('hex'),
  issuer: 'public-ui',
  audience: 'public-ui',
  accessTtl: 900,
  bcryptCost: 10,
  sessionMs: 86400000,
  secure: false,
};
const app = createApp({
  authConfig,
  config: {
    NODE_ENV: 'test',
    CORS_ORIGINS: [origin],
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX: 500,
  },
  logger: createLogger('silent'),
  isDatabaseConnected: () => true,
});
const get = (path) => request(app).get('/api/v1' + path);
const homepage = () =>
  get('/homepage?view=entertainment')
    .expect(200)
    .then((result) => result.body.data);
const past = new Date(Date.now() - 86400000);
const future = new Date(Date.now() + 86400000);
const input = (type, heading, items) => ({
  id: randomUUID(),
  type,
  heading,
  items,
  visible: true,
  limit: 8,
});

describe.skipIf(!uri)(
  'Public UI compatibility over isolated published content',
  () => {
    let films, talent, unrelated, movie, episode, spoiler;
    beforeAll(async () => {
      await mongoose.connect(uri, {
        dbName: 'fdfs_public_ui_' + randomBytes(8).toString('hex'),
        autoIndex: false,
      });
    }, 20000);
    afterAll(async () => {
      if (mongoose.connection.readyState === 1)
        await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    async function seed(model, title, extra = {}) {
      const row = {
        publicId: randomUUID(),
        title,
        slug: title.toLowerCase().replaceAll(' ', '-'),
        status: 'published',
        releaseAt: past,
        publishedAt: past,
        publicationAt: past,
        ...extra,
      };
      return {
        ...row,
        _id: (await model.collection.insertOne(row)).insertedId,
      };
    }
    it('keeps all required empty sections and uses no placeholder slide', async () => {
      const value = await homepage();
      expect(value.slides).toEqual([]);
      expect(
        value.sections.map(({ heading, more }) => ({ heading, more })),
      ).toEqual(
        publicHomeSections.map(({ heading, more }) => ({ heading, more })),
      );
      expect(
        value.sections.every((row) => !row.items.length && !row.unavailable),
      ).toBe(true);
    });
    it('respects saved picks, caps hero slides, keeps existing CMS data and conceals spoilers', async () => {
      films = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          seed(Film, 'Film ' + i, {
            classification: i === 2 ? 'original' : 'independent',
            genres: ['drama'],
          }),
        ),
      );
      talent = await seed(Personality, 'Cross credited profile', {
        displayName: 'Cross credited profile',
        status: 'published',
        professions: ['actor'],
      });
      unrelated = await seed(Personality, 'Unrelated profile', {
        displayName: 'Unrelated profile',
        status: 'published',
      });
      const author = await User.create({
        fullName: 'Public reviewer fixture',
        email: 'reviewer@example.test',
        passwordHash: 'fixture',
      });
      movie = await seed(Movie, 'Movie review target', {
        credits: [{ personality: talent._id }],
        genres: ['drama'],
        releaseDate: past,
      });
      const show = await seed(PodcastShow, 'Fixture podcast', {
        slug: podcastBrand.slug,
      });
      episode = await seed(PodcastEpisode, 'Fixture episode', {
        show: show._id,
        number: 7,
        duration: 650,
      });
      await FilmCredit.collection.insertOne({
        film: films[0]._id,
        personality: talent._id,
        role: 'actor',
      });
      await EpisodeParticipant.collection.insertOne({
        episode: episode._id,
        personality: talent._id,
        role: 'guest',
        position: 1,
      });
      spoiler = await seed(Review, 'Concealed end fixture', {
        body: 'Restricted spoiler excerpt',
        author: author._id,
        targetType: 'movie',
        target: movie._id,
        spoiler: true,
      });
      await seed(Review, 'Short film review', {
        body: 'Eligible film discussion',
        author: author._id,
        targetType: 'cinema',
        target: films[0]._id,
        spoiler: false,
      });
      await RatingTotals.collection.insertMany([
        {
          target: films[0]._id,
          targetType: 'cinema',
          sum: 9,
          count: 1,
          distribution: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
        },
        {
          target: movie._id,
          targetType: 'movie',
          sum: 9,
          count: 1,
          distribution: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
        },
      ]);
      const curated = input('featured', 'Retain administrator heading', [
        { module: 'independent', id: films[0].publicId },
        { module: 'talent', id: unrelated.publicId },
        { module: 'reviews', id: spoiler.publicId },
      ]);
      const slides = films.map((row) => ({
        id: randomUUID(),
        target: { module: row.classification, id: row.publicId },
      }));
      await SiteConfig.collection.insertOne({
        _id: 'homepage',
        revision: 2,
        value: { sections: [curated], heroSlides: slides },
        published: { sections: [curated], heroSlides: slides },
      });
      const value = await homepage();
      expect(value.slides).toHaveLength(5);
      expect(value.slides[0].id).toBe(films[0].publicId);
      expect(value.sections.map((row) => row.heading)).toEqual(
        publicHomeSections.map((row) => row.heading),
      );
      expect(value.sections[0].items[0]).toMatchObject({
        id: films[0].publicId,
        rating: 4.5,
      });
      expect(value.sections[2].items[0]).toMatchObject({
        number: 7,
        guests: [talent.displayName],
      });
      const reviews = value.sections[3].items;
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toMatchObject({
        id: spoiler.publicId,
        title: movie.title,
        spoiler: true,
      });
      expect(JSON.stringify(reviews)).not.toMatch(
        /Concealed end fixture|Restricted spoiler excerpt|Short film review/,
      );
      expect(value.sections[4].items.map((item) => item.id)).toEqual([
        talent.publicId,
      ]);
      expect(
        (await SiteConfig.findById('homepage').lean()).published.heroSlides,
      ).toHaveLength(6);
      await SiteConfig.updateOne(
        { _id: 'homepage' },
        { $set: { 'published.heroSlides': slides.slice(0, 2) } },
      );
      expect((await homepage()).slides).toHaveLength(2);
      const legacy = await get('/homepage').expect(200);
      expect(legacy.body.data.sections[0].heading).toBe(curated.heading);
    });
    it('filters one published profile into multiple categories and applies measured rating thresholds', async () => {
      for (const key of ['movies', 'short-films', 'podcast-guests']) {
        const result = await get('/talent?category=' + key).expect(200);
        expect(result.body.data.map((row) => row.id)).toEqual([
          talent.publicId,
        ]);
      }
      await EpisodeParticipant.collection.updateOne(
        { episode: episode._id },
        { $set: { role: 'host' } },
      );
      expect(
        (await get('/talent?category=podcast-guests').expect(200)).body.data,
      ).toEqual([]);
      const film = await get(
        '/films?classification=independent&minimumRating=4.5',
      ).expect(200);
      expect(film.body.data.map((row) => row.id)).toEqual([films[0].publicId]);
      expect(
        (await get('/movies?minimumRating=4.5').expect(200)).body.data.map(
          (row) => row.id,
        ),
      ).toEqual([movie.publicId]);
      expect(
        (await get('/movies?minimumRating=5').expect(200)).body.data,
      ).toEqual([]);
    });
    it('shows future approved events and excludes stale, cancelled and draft schedules', async () => {
      const scheduled = await seed(LiveEvent, 'Scheduled event', {
        broadcast: 'scheduled',
        moderation: 'approved',
        startAt: future,
        talent: [],
      });
      const live = await seed(LiveEvent, 'Current fixture', {
        broadcast: 'live',
        moderation: 'approved',
        startAt: past,
        talent: [],
      });
      await seed(LiveEvent, 'Old schedule', {
        broadcast: 'scheduled',
        moderation: 'approved',
        startAt: past,
        talent: [],
      });
      await seed(LiveEvent, 'Cancelled fixture', {
        broadcast: 'cancelled',
        moderation: 'approved',
        startAt: future,
        talent: [],
      });
      expect(
        (await get('/live?availability=upcoming').expect(200)).body.data.map(
          (row) => row.id,
        ),
      ).toEqual([scheduled.publicId]);
      expect(
        (await get('/live?availability=live').expect(200)).body.data.map(
          (row) => row.id,
        ),
      ).toEqual([live.publicId]);
    });
  },
);
