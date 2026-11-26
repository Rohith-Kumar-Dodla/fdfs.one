import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import request from 'supertest';
import { io } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eventLocalTime, eventUtcTime } from '../../shared/live.js';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { initializePhase22Indexes } from '../src/modules/admin/routes.js';
import {
  initializeAuthIndexes,
  Session,
  User,
} from '../src/modules/auth/models.js';
import { createSessionService } from '../src/modules/auth/sessions.js';
import { MediaAsset } from '../src/modules/media/assets.js';
import { ChatMessage, ChatParticipant } from '../src/modules/live/chat.js';
import { createReminderDelivery } from '../src/modules/live/email.js';
import { LiveEvent } from '../src/modules/live/models.js';
import { Reminder, processReminders } from '../src/modules/live/reminders.js';
import { initializeLiveIndexes } from '../src/modules/live/routes.js';
import { eventContent } from '../src/modules/live/schemas.js';
import { attachLiveSockets } from '../src/modules/live/socket.js';

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
const config = {
  NODE_ENV: 'test',
  CORS_ORIGINS: [origin],
  RATE_LIMIT_WINDOW_MS: 10000,
  RATE_LIMIT_MAX: 200,
};
const logger = createLogger('silent');
const available = () => true;
const fixture = () => ({
  title: 'Isolated FDFS Live event',
  summary: 'A private test fixture.',
  description: 'Public event detail.',
  rightsNotes: 'Private authorization record',
  rightsConfirmed: true,
  category: 'community',
  language: 'en',
  videoUrl: 'https://www.youtube.com/live/aBCDef123_-',
  timeZone: 'Asia/Kolkata',
  startAt: new Date(Date.now() + 120000).toISOString(),
});

it('validates category, UTC schedule, IANA timezone, media IDs and YouTube URLs', () => {
  const event = fixture();
  expect(eventContent.safeParse(event).success).toBe(true);
  for (const invalid of [
    { category: 'arbitrary' },
    { timeZone: 'Mars/Station' },
    { timeZone: '+05:30' },
    { endAt: event.startAt },
    { startAt: '2026-11-26T14:00:00' },
    { posterId: 'file.png' },
    { videoUrl: 'https://www.youtube.com.example.test/live/aBCDef123_-' },
  ])
    expect(eventContent.safeParse({ ...event, ...invalid }).success).toBe(
      false,
    );
});

it('converts local time and handles daylight saving gaps and overlaps', () => {
  expect(eventUtcTime('2026-11-26T14:00', 'Asia/Kolkata')).toBe(
    '2026-11-26T08:30:00.000Z',
  );
  expect(eventLocalTime('2026-11-26T08:30:00.000Z', 'Asia/Kolkata')).toBe(
    '2026-11-26T14:00',
  );
  expect(() => eventUtcTime('2026-03-08T02:30', 'America/New_York')).toThrow();
  expect(eventUtcTime('2026-11-01T01:30', 'America/New_York')).toBe(
    '2026-11-01T05:30:00.000Z',
  );
});

describe.skipIf(!uri)('isolated live events, sockets and reminders', () => {
  let server,
    realtime,
    app,
    staff,
    organizer,
    other,
    viewer,
    unverified,
    suspended,
    art;
  const sockets = new Set();
  const api = (method, path, user) => {
    const result = request(app)[method]('/api/v1' + path);
    return user
      ? result.set('Authorization', 'Bearer ' + user.accessToken)
      : result;
  };
  const room = (user, socketOrigin = origin) => {
    const socket = io('http://127.0.0.1:' + server.address().port, {
      autoConnect: false,
      reconnection: false,
      forceNew: true,
      transports: ['websocket'],
      extraHeaders: { Origin: socketOrigin },
      auth: user ? { token: user.accessToken } : {},
    });
    sockets.add(socket);
    return socket;
  };
  const connect = async (socket) => {
    const connected = once(socket, 'connect');
    socket.connect();
    await connected;
    return socket;
  };
  const emit = (socket, event, data) =>
    socket.timeout(3000).emitWithAck(event, data);
  const status = async (
    event,
    action,
    details = {},
    user = staff,
    path = '/admin/live',
  ) =>
    (
      await api('patch', path + '/' + event.id + '/status', user)
        .send({ action, revision: event.revision, ...details })
        .expect(200)
    ).body.data;
  async function publish(title = fixture().title) {
    const draft = (
      await api('post', '/admin/live', staff)
        .send({
          ...fixture(),
          title,
          posterId: art.publicId,
          organizerId: organizer.user.publicId,
        })
        .expect(201)
    ).body.data;
    return status(draft, 'publish');
  }

  beforeAll(async () => {
    await mongoose.connect(uri, {
      dbName: 'fdfs_live_test_' + randomBytes(8).toString('hex'),
      autoIndex: false,
    });
    await Promise.all([
      initializeAuthIndexes(),
      initializePhase22Indexes(),
      initializeLiveIndexes(),
    ]);
    const sessions = createSessionService(authConfig);
    async function account(name, role, verified = true, status = 'active') {
      const user = await User.create({
        fullName: name,
        email: name.toLowerCase() + '@example.test',
        passwordHash: 'fixture',
        roles: role ? ['viewer', role] : ['viewer'],
        status,
        emailVerifiedAt: verified ? new Date() : null,
      });
      return { user, ...(await sessions.open(user)) };
    }
    staff = await account('Administrator', 'admin');
    organizer = await account('Organizer', 'organizer');
    other = await account('Other', 'organizer');
    viewer = await account('Viewer');
    unverified = await account('Unverified', null, false);
    suspended = await account('Suspended', null, true, 'suspended');
    art = await MediaAsset.create({
      owner: organizer.user.publicId,
      providerId: 'isolated/live',
      status: 'active',
      purpose: 'live',
      url: 'https://example.test/image/upload/art.png',
      width: 800,
      height: 450,
    });
    app = createApp({
      config,
      authConfig,
      logger,
      isDatabaseConnected: available,
      phase22Options: {
        available,
        liveNotify: (event) => realtime.notify(event),
      },
    });
    server = createServer(app);
    realtime = attachLiveSockets(server, {
      authConfig,
      origins: [origin],
      available,
      logger,
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
  }, 20000);

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    realtime?.close();
    if (server?.listening)
      await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1)
      await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('reuses review, protects ownership and keeps unreleased metadata private', async () => {
    const event = { ...fixture(), posterId: art.publicId };
    const input = {
      category: 'live',
      title: event.title,
      summary: event.summary,
      eventProposal: { event },
    };
    await api('post', '/submissions', viewer).send(input).expect(403);
    await api('post', '/submissions', other).send(input).expect(400);
    const created = (
      await api('post', '/submissions', organizer).send(input).expect(201)
    ).body.data;
    const ownerPath = '/submissions/' + created.id;
    const staffPath = '/admin' + ownerPath;
    await api('get', ownerPath, other).expect(404);
    await api('post', staffPath + '/publish', organizer).expect(403);
    await api('post', ownerPath + '/submit', organizer).expect(200);
    await api('post', staffPath + '/moderate', staff)
      .send({ action: 'review' })
      .expect(200);
    await api('post', staffPath + '/moderate', staff)
      .send({ action: 'reject', reason: 'Improve the schedule description.' })
      .expect(200);
    expect(
      (await api('get', ownerPath, organizer).expect(200)).body.data
        .rejectionReason,
    ).toMatch(/schedule/);
    const { category, ...edit } = input;
    expect(category).toBe('live');
    await api('patch', ownerPath, organizer).send(edit).expect(200);
    await api('post', ownerPath + '/submit', organizer).expect(200);
    await api('post', staffPath + '/moderate', staff)
      .send({ action: 'review' })
      .expect(200);
    await api('post', staffPath + '/moderate', staff)
      .send({ action: 'approve' })
      .expect(200);
    const published = (
      await api('post', staffPath + '/publish', staff).expect(200)
    ).body.data.publishedResource;
    const path = '/live/' + published.slug;
    const publicRow = (await api('get', path).expect(200)).body.data;
    expect(publicRow).toMatchObject({
      organizer: 'Organizer',
      broadcast: 'scheduled',
    });
    for (const key of [
      'organizerId',
      'rightsNotes',
      'rightsConfirmed',
      'video',
      'moderation',
    ])
      expect(publicRow).not.toHaveProperty(key);
    expect(
      (
        await api('get', '/live')
          .query({
            availability: 'upcoming',
            category: 'community',
            q: 'FDFS Live',
          })
          .expect(200)
      ).body.data,
    ).toHaveLength(1);
    const ownPath = '/organizer/live/' + published.id;
    await api('get', ownPath, other).expect(404);
    await api('get', ownPath, viewer).expect(403);
    const managed = (await api('get', ownPath, organizer).expect(200)).body
      .data;
    await api('patch', ownPath + '/status', organizer)
      .send({ action: 'publish', revision: managed.revision })
      .expect(400);
    await api('patch', ownPath + '/status', organizer)
      .send({ action: 'start', revision: managed.revision })
      .expect(400);
    await api('patch', ownPath + '/status', other)
      .send({ action: 'start', revision: managed.revision, broadcasting: true })
      .expect(404);
    const live = await status(
      managed,
      'start',
      { broadcasting: true },
      organizer,
      '/organizer/live',
    );
    expect(live.actualStartAt).toBeTruthy();
    await api('patch', '/admin/live/' + live.id + '/status', staff)
      .send({ action: 'archive', revision: live.revision })
      .expect(409);
    expect(
      (
        await api('get', '/live').query({ availability: 'live' }).expect(200)
      ).body.data.map(({ id }) => id),
    ).toContain(live.id);
    const ended = await status(live, 'end');
    expect(ended.actualEndAt >= live.actualStartAt).toBe(true);
    expect((await api('get', path).expect(200)).body.data).not.toHaveProperty(
      'video',
    );
    const replay = await status(ended, 'replay', {
      replayUrl: 'https://youtu.be/aBCDef123_-',
      rightsConfirmed: true,
    });
    expect(
      (await api('get', path).expect(200)).body.data.replay.playbackType,
    ).toBe('replay');
    expect(
      (
        await api('get', '/live').query({ availability: 'replay' }).expect(200)
      ).body.data.map(({ id }) => id),
    ).toContain(replay.id);
    await status(replay, 'archive');
    await api('get', path).expect(404);
  }, 20000);

  it('enforces origins, room isolation, authorization, chat limits and reconnect recovery', async () => {
    let event = await publish('Realtime isolated room');
    const adjacent = await publish('Adjacent isolated room');
    const hidden = await status(await publish('Private event'), 'unpublish');
    const invalid = room({ accessToken: 'invalid' });
    const wrongOrigin = room(null, 'https://untrusted.example.test');
    const inactive = room(suspended);
    for (const [socket, code] of [
      [invalid, 'AUTH_REQUIRED'],
      [wrongOrigin, undefined],
      [inactive, 'ACCOUNT_RESTRICTED'],
    ]) {
      const refused = once(socket, 'connect_error');
      socket.connect();
      expect((await refused)[0].data?.code).toBe(code);
    }
    const [writer, guest, isolated, pending, laterSuspended] =
      await Promise.all([
        connect(room(viewer)),
        connect(room()),
        connect(room()),
        connect(room(unverified)),
        connect(room(other)),
      ]);
    expect((await emit(guest, 'event:join', { slug: hidden.slug })).code).toBe(
      'LIVE_NOT_FOUND',
    );
    expect(
      (await emit(guest, 'event:join', { slug: event.slug, admin: true })).code,
    ).toBe('INVALID_SOCKET_PAYLOAD');
    for (const socket of [writer, guest, pending])
      expect((await emit(socket, 'event:join', { slug: event.slug })).ok).toBe(
        true,
      );
    await emit(isolated, 'event:join', { slug: adjacent.slug });
    await emit(laterSuspended, 'event:join', { slug: event.slug });
    const leaked = vi.fn();
    isolated.on('chat:message', leaked);
    const updates = once(guest, 'live:state');
    event = await status(event, 'start', { broadcasting: true });
    expect((await updates)[0]).toEqual({ slug: event.slug });
    const attempt = (sock, text, clientId = randomUUID()) =>
      emit(sock, 'chat:send', { slug: event.slug, text, clientId });
    expect((await attempt(guest, 'Guest')).code).toBe('AUTH_REQUIRED');
    expect((await attempt(pending, 'Unverified')).code).toBe(
      'EMAIL_NOT_VERIFIED',
    );
    expect((await attempt(isolated, 'Wrong room')).code).toBe('ROOM_REQUIRED');
    await User.updateOne(
      { _id: other.user._id },
      { $set: { status: 'suspended' } },
    );
    expect((await attempt(laterSuspended, 'After suspension')).code).toBe(
      'ACCOUNT_RESTRICTED',
    );
    await User.updateOne(
      { _id: other.user._id },
      { $set: { status: 'active' } },
    );
    expect((await attempt(writer, 'x'.repeat(401))).code).toBe(
      'INVALID_SOCKET_PAYLOAD',
    );
    const delivery = once(guest, 'chat:message');
    const key = randomUUID();
    const text = '<img src=x onerror=alert(1)>';
    const sent = await attempt(writer, text, key);
    const message = (await delivery)[0];
    expect(message).toMatchObject({ text, id: sent.data.id, name: 'Viewer' });
    expect(message).not.toHaveProperty('author');
    expect((await attempt(writer, text, key)).data).toMatchObject({
      duplicate: true,
    });
    expect((await attempt(writer, text)).code).toBe('CHAT_RATE_LIMIT');
    expect(await ChatMessage.countDocuments({ publicId: sent.data.id })).toBe(
      1,
    );
    expect(leaked).not.toHaveBeenCalled();
    const path = '/live/' + event.slug + '/chat';
    expect(
      (await api('get', path).expect(200)).body.data.messages,
    ).toHaveLength(1);
    await api('post', path + '/reports', organizer)
      .send({ messageId: message.id, reason: 'spam' })
      .expect(200);
    const manage = '/organizer/live/' + event.id + '/chat';
    await api('get', manage + '/reports', other).expect(404);
    expect(
      (await api('get', manage + '/reports', organizer).expect(200)).body.data
        .reports[0],
    ).not.toHaveProperty('reporter');
    const report = (
      await api('get', manage + '/reports', organizer).expect(200)
    ).body.data.reports[0];
    await api('patch', manage, organizer)
      .send({ action: 'resolve', reportId: report.id })
      .expect(200);
    expect(
      (await api('get', manage + '/reports', organizer).expect(200)).body.data
        .reports,
    ).toHaveLength(0);
    await api('patch', manage, organizer)
      .send({ action: 'mute', messageId: message.id, minutes: 1 })
      .expect(200);
    expect((await attempt(writer, 'Muted')).code).toBe('CHAT_MUTED');
    await ChatParticipant.updateOne(
      { user: viewer.user._id },
      { $set: { until: new Date(0) } },
    );
    expect((await attempt(writer, 'Mute expired')).ok).toBe(true);
    event = (
      await api('patch', '/admin/live/' + event.id + '/options', staff)
        .send({ revision: event.revision, chatEnabled: true, slowSeconds: 60 })
        .expect(200)
    ).body.data;
    expect((await attempt(writer, 'Slow mode')).code).toBe('CHAT_RATE_LIMIT');
    const removed = once(guest, 'chat:removed');
    await api('patch', manage, organizer)
      .send({ action: 'hide', messageId: message.id })
      .expect(200);
    expect((await removed)[0]).toEqual({ slug: event.slug, id: message.id });
    await Session.updateOne(
      { publicId: viewer.sessionId },
      { $set: { revokedAt: new Date() } },
    );
    expect((await attempt(writer, 'After revocation')).code).toBe(
      'AUTH_REQUIRED',
    );
    guest.disconnect();
    event = await status(event, 'end');
    await connect(guest);
    expect(
      (await emit(guest, 'event:join', { slug: event.slug })).data.broadcast,
    ).toBe('ended');
    expect(
      (await api('get', path).expect(200)).body.data.messages.map(
        (row) => row.text,
      ),
    ).toEqual(['Mute expired']);
  }, 20000);

  it('requires review for organizer corrections and keeps the stable event identity', async () => {
    const event = await publish('Before reviewed correction');
    const eventsPath = '/admin/live/' + event.id;
    const input = {
      category: 'live',
      title: 'After reviewed correction',
      summary: 'Updated isolated event description.',
      eventProposal: {
        targetId: event.id,
        event: {
          ...fixture(),
          title: 'After reviewed correction',
          summary: 'Updated isolated event description.',
          startAt: event.startAt,
          posterId: event.poster.id,
        },
      },
    };
    await api('post', '/submissions', other).send(input).expect(404);
    await api('patch', '/organizer/live/' + event.id, organizer)
      .send(input.eventProposal.event)
      .expect(404);
    const submitted = (
      await api('post', '/submissions', organizer).send(input).expect(201)
    ).body.data;
    await api(
      'post',
      '/submissions/' + submitted.id + '/submit',
      organizer,
    ).expect(200);
    const review = '/admin/submissions/' + submitted.id;
    await api('post', review + '/moderate', staff)
      .send({ action: 'review' })
      .expect(200);
    await api('post', review + '/moderate', staff)
      .send({ action: 'approve' })
      .expect(200);
    expect(
      (await api('get', eventsPath, staff).expect(200)).body.data.title,
    ).toBe('Before reviewed correction');
    expect(
      (await api('post', review + '/publish', staff).expect(200)).body.data
        .publishedResource,
    ).toMatchObject({ id: event.id, slug: event.slug });
    expect(
      (await api('get', eventsPath, staff).expect(200)).body.data.title,
    ).toBe('After reviewed correction');
  });

  it('recovers leased reminders, honors rescheduling and unsubscribes, and claims email once', async () => {
    let event = await publish('Reminder processing');
    const path = '/live/' + event.slug + '/reminder';
    await api('put', path, unverified).expect(403);
    await Promise.all([
      api('put', path, organizer).expect(200),
      api('put', path, organizer).expect(200),
    ]);
    await api('put', path, other).expect(200);
    await api('delete', path, other).expect(200);
    const stored = await LiveEvent.findOne({ publicId: event.id });
    expect(
      await Reminder.countDocuments({
        event: stored._id,
        user: organizer.user._id,
      }),
    ).toBe(1);
    event = await status(event, 'postpone');
    const deliver = vi.fn(async () => 'sent');
    await processReminders(deliver);
    expect(deliver).not.toHaveBeenCalled();
    const startAt = new Date(Date.now() + 120000).toISOString();
    event = await status(event, 'reschedule', {
      startAt,
      timeZone: 'Asia/Kolkata',
    });
    const filter = { event: stored._id, user: organizer.user._id };
    const pending = await Reminder.findOne(filter);
    expect(pending).toMatchObject({ version: 1, state: 'pending' });
    expect(pending.dueAt.getTime()).toBe(Date.parse(startAt) - 900000);
    await Reminder.updateOne(filter, {
      $set: { state: 'claimed', claim: 'old-worker', leaseUntil: new Date(0) },
    });
    const sendMail = vi.fn(async () => ({ accepted: [organizer.user.email] }));
    const transport = createReminderDelivery(
      { ...authConfig, smtp: { from: 'fdfs@example.test' } },
      logger,
      { sendMail },
    );
    await Promise.all([
      processReminders(transport),
      processReminders(transport),
    ]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: organizer.user.email,
      subject: 'FDFS Live reminder: ' + event.title,
    });
    expect((await Reminder.findOne(filter)).state).toBe('sent');
    await api('delete', path, organizer).expect(200);
    await api('put', path, organizer).expect(200);
    await processReminders(transport);
    expect(sendMail).toHaveBeenCalledTimes(1);
    await Reminder.updateOne(filter, {
      $set: {
        state: 'sending',
        claim: 'interrupted-smtp',
        leaseUntil: new Date(0),
      },
    });
    await processReminders(transport);
    expect((await Reminder.findOne(filter)).state).toBe('uncertain');
    expect(sendMail).toHaveBeenCalledTimes(1);
    await status(event, 'cancel');
    await api('put', path, other).expect(409);
  }, 20000);
});
