import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { AuditLog } from '../src/modules/admin/audit.js';
import {
  beginAccountWrite,
  duringAccountDeletion,
} from '../src/modules/auth/account-mutations.js';
import {
  initializeAuthIndexes,
  Session,
  User,
} from '../src/modules/auth/models.js';
import { ChatMessage, ChatParticipant } from '../src/modules/live/chat.js';
import { Reminder } from '../src/modules/live/reminders.js';
import { MediaAsset } from '../src/modules/media/assets.js';
import { AnalyticsActiveDay } from '../src/modules/operations/analytics.js';
import {
  GuestAccess,
  GuestChallenge,
  Notice,
  SupportJob,
  Ticket,
  TicketAttachment,
  TicketMessage,
} from '../src/modules/operations/support-models.js';
import {
  Following,
  Playback,
  Preferences,
  Watchlist,
} from '../src/modules/personal/models.js';
import { EpisodeComment } from '../src/modules/podcasts/comments.js';
import {
  Movie,
  MovieRequest,
  Rating,
  RatingTotals,
  Review,
  ReviewComment,
  ReviewLike,
} from '../src/modules/reviews/models.js';
import { Submission } from '../src/modules/submissions/workflow.js';
import { Personality } from '../src/modules/talent/models.js';

const uri = process.env.TEST_MONGODB_RS_URI;
const origin = 'https://frontend.example.test';
const password = 'disposable deletion fixture';
const authConfig = {
  webOrigin: origin,
  accessSecret: randomBytes(48).toString('hex'),
  issuer: 'deletion-test',
  audience: 'deletion-api-test',
  accessTtl: 900,
  bcryptCost: 10,
  sessionMs: 86400000,
  secure: true,
};
const app = createApp({
  authConfig,
  config: {
    NODE_ENV: 'test',
    CORS_ORIGINS: [origin],
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX: 1000,
  },
  logger: createLogger('silent'),
  isDatabaseConnected: () => true,
});
const browser = (operation) =>
  operation.set('Origin', origin).set('X-FDFS-CSRF', '1');
const bearer = (operation, token) =>
  operation.set('Authorization', 'Bearer ' + token);
const login = (email) =>
  browser(request(app).post('/api/v1/auth/login')).send({ email, password });
const deletion = (token) =>
  bearer(request(app).delete('/api/v1/auth/account'), token);
const consent = { password, confirmation: 'DELETE' };
const cookie = (response) => response.headers['set-cookie'][0].split(';')[0];
const seed = async (model, values) =>
  (await model.collection.insertOne(values)).insertedId;

it('drains admitted writes and blocks another write or deletion until the sweep ends', async () => {
  const owner = randomUUID();
  const release = beginAccountWrite(owner);
  let swept = false;
  const deletion = duringAccountDeletion(owner, () => {
    swept = true;
  });
  expect(swept).toBe(false);
  expect(() => beginAccountWrite(owner)).toThrowError(/in progress/);
  await expect(duringAccountDeletion(owner, () => null)).rejects.toMatchObject({
    status: 409,
  });
  release();
  await deletion;
  expect(swept).toBe(true);
  beginAccountWrite(owner)();
});

describe.skipIf(!uri)('account deletion in an isolated replica set', () => {
  let passwordHash;

  beforeAll(async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri))
      throw new Error(
        'Account deletion tests require a disposable loopback replica set.',
      );
    await mongoose.connect(uri, {
      dbName: 'fdfs_delete_test_' + randomBytes(8).toString('hex'),
      autoIndex: false,
    });
    await initializeAuthIndexes();
    passwordHash = await bcrypt.hash(password, 4);
  });

  afterAll(async () => {
    if (mongoose.connection.name?.startsWith('fdfs_delete_test_'))
      await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  function createUser(extra = {}) {
    return User.create({
      email: randomUUID() + '@gmail.com',
      fullName: 'Disposable Account',
      bio: 'Private biography',
      emailVerifiedAt: new Date(),
      passwordHash,
      ...extra,
    });
  }

  it('requires the right origin, authentication, confirmation and password and protects staff', async () => {
    const user = await createUser();
    const staff = await createUser({
      roles: ['viewer', 'admin', 'super_admin'],
      bootstrapAdmin: true,
    });
    const a = await login(user.email).expect(200);
    const b = await login(staff.email).expect(200);
    const token = a.body.data.accessToken;

    await deletion(token).send(consent).expect(403);
    await browser(request(app).delete('/api/v1/auth/account'))
      .send(consent)
      .expect(401);
    await browser(deletion(token))
      .send({ ...consent, confirmation: 'delete' })
      .expect(400);
    await browser(deletion(token))
      .send({ ...consent, password: 'wrong password' })
      .expect(403);
    await browser(deletion(b.body.data.accessToken)).send(consent).expect(403);
    expect(
      await User.countDocuments({
        _id: { $in: [user._id, staff._id] },
        status: 'active',
      }),
    ).toBe(2);
    expect(
      await Session.countDocuments({
        userId: { $in: [user._id, staff._id] },
        revokedAt: null,
      }),
    ).toBe(2);
  });

  it('erases private data, revokes both devices, and preserves published work, rights and shared media', async () => {
    const user = await createUser({
      roles: ['viewer', 'creator', 'organizer'],
    });
    const other = await createUser();
    const author = user._id;
    const owner = user.publicId;
    const keys = [];
    for (const model of [Watchlist, Playback, Following]) {
      keys.push([model, await seed(model, { owner: author })]);
      await seed(model, { owner: other._id });
    }
    keys.push([Preferences, await seed(Preferences, { _id: author })]);
    for (const model of [ChatParticipant, Reminder])
      keys.push([model, await seed(model, { user: author })]);
    keys.push([Notice, await seed(Notice, { owner })]);
    keys.push([MovieRequest, await seed(MovieRequest, { author })]);
    const pseudo = createHmac('sha256', authConfig.accessSecret)
      .update('fdfs-analytics:' + owner)
      .digest('hex');
    await seed(AnalyticsActiveDay, { _id: 'fixture', user: pseudo });
    const talent = await seed(Personality, {
      associatedUser: author,
      status: 'published',
    });
    const movie = await seed(Movie, { ratingCount: 2, ratingRank: null });
    const target = { targetType: 'movie', target: movie };
    await seed(Rating, { ...target, author, units: 6 });
    await seed(Rating, { ...target, author: other._id, units: 8 });
    await seed(Rating, {
      targetType: 'movie',
      target: new mongoose.Types.ObjectId(),
      author,
      units: 2,
      excludedAt: new Date(),
    });
    await seed(RatingTotals, {
      ...target,
      count: 2,
      sum: 14,
      distribution: [0, 0, 0, 0, 0, 1, 0, 1, 0, 0],
    });
    const ownReview = await seed(Review, {
      ...target,
      author,
      status: 'published',
      title: 'Identifying title',
      body: 'Identifying text',
    });
    const review = await seed(Review, {
      ...target,
      author: other._id,
      status: 'published',
      likeCount: 1,
      commentCount: 2,
    });
    await seed(ReviewLike, { review, author });
    await seed(ReviewComment, {
      review,
      author,
      status: 'published',
      body: 'Identifying text',
    });
    await seed(ReviewComment, {
      review,
      author,
      status: 'hidden',
      body: 'Private text',
    });
    await seed(ReviewComment, {
      review,
      author: other._id,
      status: 'published',
      body: 'Kept',
    });
    const episode = await seed(EpisodeComment, {
      author,
      status: 'visible',
      text: 'Identifying text',
    });
    const chat = await seed(ChatMessage, {
      author,
      name: user.fullName,
      text: 'Identifying text',
    });
    const draft = randomUUID();
    await seed(Submission, { publicId: draft, owner, status: 'draft' });
    const published = await seed(Submission, {
      owner,
      status: 'archived',
      history: [{ to: 'published' }],
    });
    const avatar = await seed(MediaAsset, {
      owner,
      purpose: 'profile',
      status: 'active',
      references: [{ kind: 'user-avatar', targetId: owner }],
    });
    const shared = await seed(MediaAsset, {
      owner,
      purpose: 'film',
      status: 'active',
      references: [
        { kind: 'film-proposal', targetId: draft },
        { kind: 'film', targetId: randomUUID() },
      ],
    });
    await User.updateOne({ _id: author }, { profileImage: avatar });
    const ordinary = randomUUID();
    const copyright = randomUUID();
    await seed(Ticket, { publicId: ordinary, owner, category: 'technical' });
    await seed(Ticket, {
      publicId: copyright,
      guestEmail: user.email,
      category: 'copyright',
    });
    keys.push([
      TicketMessage,
      await seed(TicketMessage, {
        ticket: ordinary,
        text: 'Private ticket reply',
      }),
    ]);
    keys.push([
      TicketAttachment,
      await seed(TicketAttachment, {
        ticket: ordinary,
        data: Buffer.from('fixture'),
      }),
    ]);
    keys.push([
      GuestAccess,
      await seed(GuestAccess, { _id: 'test-access', ticket: copyright }),
    ]);
    keys.push([
      GuestChallenge,
      await seed(GuestChallenge, { _id: 'test-challenge', email: user.email }),
    ]);
    keys.push([
      SupportJob,
      await seed(SupportJob, {
        _id: 'test-email',
        challenge: 'test-challenge',
      }),
    ]);
    await seed(TicketMessage, { ticket: copyright, text: 'Rights evidence' });

    const a = await login(user.email).expect(200);
    const b = await login(user.email).expect(200);
    const deleted = await browser(deletion(a.body.data.accessToken))
      .send(consent)
      .expect(200);
    expect(deleted.headers['cache-control']).toBe('no-store');
    expect(cookie(deleted)).toBe('__Secure-fdfs_refresh=');
    await bearer(
      request(app).get('/api/v1/users/me'),
      b.body.data.accessToken,
    ).expect(401);
    await browser(request(app).post('/api/v1/auth/refresh'))
      .set('Cookie', cookie(b))
      .expect(401);
    await login(user.email).expect(401);
    expect(await Session.countDocuments({ userId: author })).toBe(0);
    for (const [model, _id] of keys)
      expect(
        await model.collection.findOne({ _id }),
        model.modelName,
      ).toBeNull();
    expect(await Watchlist.countDocuments({ owner: other._id })).toBe(1);
    expect(await AnalyticsActiveDay.countDocuments({ user: pseudo })).toBe(0);

    const tombstone = await User.collection.findOne({ _id: author });
    expect(tombstone).toMatchObject({
      status: 'deleted',
      fullName: 'Former member',
      roles: [],
      cmsModules: [],
    });
    expect(tombstone.email).toMatch(/@deleted\.invalid$/);
    for (const field of [
      'passwordHash',
      'emailVerifiedAt',
      'profileImage',
      'bio',
      'preferences',
    ])
      expect(tombstone).not.toHaveProperty(field);
    expect(
      await Personality.collection.findOne({ _id: talent }),
    ).not.toHaveProperty('associatedUser');
    expect(await Submission.exists({ _id: published })).toBeTruthy();
    expect(await Submission.exists({ publicId: draft })).toBeNull();
    expect(await MediaAsset.collection.findOne({ _id: avatar })).toMatchObject({
      status: 'deleting',
      references: [],
    });
    expect(await MediaAsset.collection.findOne({ _id: shared })).toMatchObject({
      status: 'active',
      references: [{ kind: 'film' }],
    });
    expect(await RatingTotals.findOne(target)).toMatchObject({
      count: 1,
      sum: 8,
      distribution: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
    });
    expect(await Movie.collection.findOne({ _id: movie })).toMatchObject({
      ratingCount: 1,
    });
    expect(await Rating.countDocuments({ author })).toBe(0);
    expect(await Review.collection.findOne({ _id: review })).toMatchObject({
      likeCount: 0,
      commentCount: 1,
    });
    expect(
      await Review.collection.findOne({ _id: ownReview }),
    ).not.toHaveProperty('body');
    expect(
      await ReviewComment.countDocuments({ author, status: 'deleted' }),
    ).toBe(2);
    expect(
      await EpisodeComment.collection.findOne({ _id: episode }),
    ).not.toHaveProperty('text');
    expect(
      await ChatMessage.collection.findOne({ _id: chat }),
    ).not.toHaveProperty('text');
    expect(await Ticket.exists({ publicId: ordinary })).toBeNull();
    expect(
      await Ticket.collection.findOne({ publicId: copyright }),
    ).not.toHaveProperty('guestEmail');
    expect(await TicketMessage.exists({ ticket: copyright })).toBeTruthy();
    expect(
      await AuditLog.exists({
        actorId: owner,
        targetId: owner,
        action: 'user.self_deleted',
      }),
    ).toBeTruthy();
  });
});
