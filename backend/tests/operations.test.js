import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { io } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/config/logger.js';
import { initializePhase22Indexes } from '../src/modules/admin/routes.js';
import {
  initializeAuthIndexes,
  Session,
  User,
} from '../src/modules/auth/models.js';
import { createSessionService } from '../src/modules/auth/sessions.js';
import { attachLiveSockets } from '../src/modules/live/socket.js';
import {
  activityTotals,
  AnalyticsEvent,
  analyticsOptions,
  historical,
  ingest,
} from '../src/modules/operations/analytics.js';
import {
  Announcement,
  createOperationsHealth,
  systemHealth,
} from '../src/modules/operations/platform.js';
import { createPresenceStore } from '../src/modules/operations/presence.js';
import { initializeOperationsIndexes } from '../src/modules/operations/routes.js';
import {
  processSupportJobs,
  supportMailer,
} from '../src/modules/operations/support-email.js';
import {
  GuestAccess,
  GuestChallenge,
  SupportJob,
  Ticket,
  TicketAttachment,
} from '../src/modules/operations/support-models.js';
import { guestLinkToken } from '../src/modules/operations/support.js';

const signal = { module: 'home', device: 'desktop', visible: true };
const snapshotKeys = ({
  authenticated,
  estimatedGuests,
  estimatedVisitors,
  connections,
}) => [authenticated, estimatedGuests, estimatedVisitors, connections];
it('deduplicates users and browsers, bounds memory and expires inactive presence', () => {
  const clock = Date.now();
  const store = createPresenceStore({ maxConnections: 6, staleMs: 90 });
  store.update(
    'one',
    { ...signal, user: 'owner', browser: 'signed-in' },
    clock,
  );
  store.update('two', { ...signal, user: 'owner', device: 'mobile' }, clock);
  store.update('three', { ...signal, browser: 'signed-in' }, clock);
  store.update('four', { ...signal, browser: 'guest' }, clock);
  store.update(
    'five',
    {
      ...signal,
      browser: 'guest',
      module: 'live',
      event: 'public-event',
      playing: true,
      visible: false,
    },
    clock,
  );
  store.update('six', { ...signal, visible: false }, clock);
  expect(store.update('blocked', signal, clock)).toBe(false);
  const current = store.snapshot(clock);
  expect(snapshotKeys(current)).toEqual([1, 1, 2, 6]);
  expect(current.modules).toEqual({ home: 2, live: 1 });
  expect(current.events).toEqual({ 'public-event': 1 });
  store.remove('four');
  expect(snapshotKeys(store.snapshot(clock + 89))).toEqual([1, 1, 2, 5]);
  expect(snapshotKeys(store.snapshot(clock + 90))).toEqual([0, 0, 0, 0]);
});

const uri = process.env.TEST_MONGODB_RS_URI;
describe.skipIf(!uri)(
  'operations with disposable MongoDB and real HTTP and sockets',
  () => {
    let app, server, realtime, owner, other, agent, admin;
    const sockets = new Set();
    const origin = 'http://localhost:5173';
    const logger = createLogger('silent');
    const available = () => true;
    const health = createOperationsHealth();
    const presence = createPresenceStore({ updateMs: 80, staleMs: 6000 });
    const auth = {
      webOrigin: origin,
      accessSecret: randomBytes(48).toString('hex'),
      issuer: 'ops-test',
      audience: 'ops-api',
      accessTtl: 900,
      bcryptCost: 10,
      sessionMs: 86400000,
      secure: false,
      smtp: { from: 'test@example.test' },
    };
    const api = (method, path, actor) => {
      const result = request(app)[method]('/api/v1' + path);
      if (!actor) return result;
      return result.set(
        'Authorization',
        typeof actor === 'string'
          ? 'Guest ' + actor
          : 'Bearer ' + actor.accessToken,
      );
    };
    const data = (response) => response.body.data;
    const draft = () => ({
      clientId: randomUUID(),
      subject: 'Playback question',
      category: 'playback',
      description: 'A private playback support request.',
    });
    const message = (text, extra = {}) => ({
      text,
      clientId: randomUUID(),
      ...extra,
    });
    async function openTicket(account = owner) {
      return data(
        await api('post', '/support/tickets', account)
          .send(draft())
          .expect(201),
      );
    }
    async function account(name, role, verified = true) {
      const user = await User.create({
        fullName: name,
        email: name.toLowerCase() + '@example.test',
        passwordHash: 'isolated',
        roles: role ? ['viewer', role] : ['viewer'],
        emailVerifiedAt: verified ? new Date() : null,
      });
      return { user, ...(await createSessionService(auth).open(user)) };
    }
    async function connect(account, event = 'connect') {
      const socket = io('http://127.0.0.1:' + server.address().port, {
        forceNew: true,
        autoConnect: false,
        reconnection: false,
        transports: ['websocket'],
        extraHeaders: { Origin: origin },
        auth: account && { token: account.accessToken },
      });
      sockets.add(socket);
      const connected = once(socket, event);
      socket.connect();
      const [error] = await connected;
      return event === 'connect' ? socket : error;
    }
    const emit = (socket, event, payload = {}) =>
      socket.timeout(4000).emitWithAck(event, payload);
    beforeAll(async () => {
      await mongoose.connect(uri, {
        autoIndex: false,
        dbName: 'fdfs_ops_test_' + randomBytes(8).toString('hex'),
      });
      await Promise.all([
        initializeAuthIndexes(),
        initializePhase22Indexes(),
        initializeOperationsIndexes(),
      ]);
      [owner, other, agent, admin] = await Promise.all([
        account('Owner', 'creator'),
        account('Other'),
        account('Agent', 'support_agent'),
        account('Admin', 'admin'),
      ]);
      app = createApp({
        config: {
          NODE_ENV: 'test',
          CORS_ORIGINS: [origin],
          RATE_LIMIT_WINDOW_MS: 60000,
          RATE_LIMIT_MAX: 300,
        },
        logger,
        authConfig: auth,
        isDatabaseConnected: available,
        phase22Options: {
          presence,
          health,
          noticeNotify: (id) => realtime.notice(id),
        },
      });
      server = createServer(app);
      realtime = attachLiveSockets(server, {
        authConfig: auth,
        origins: [origin],
        available,
        logger,
        presence,
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
    }, 20000);
    afterAll(async () => {
      sockets.forEach((socket) => socket.disconnect());
      realtime?.close();
      if (server?.listening)
        await new Promise((resolve) => server.close(resolve));
      if (mongoose.connection.readyState === 1)
        await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    it('authorizes analytics streams, deduplicates simultaneous sessions and removes revoked presence', async () => {
      const enrolled = await account('Device');
      const another = {
        ...(await createSessionService(auth).open(enrolled.user)),
      };
      const [observer, one, two, guest, staff] = await Promise.all([
        connect(admin),
        connect(enrolled),
        connect(another),
        connect(),
        connect(agent),
      ]);
      const browser = randomUUID();
      expect((await emit(staff, 'ops:subscribe')).ok).toBe(false);
      expect((await emit(guest, 'ops:subscribe')).ok).toBe(false);
      await api('get', '/admin/activity', agent).expect(403);
      const unverified = await account('Unverified admin', 'admin', false);
      expect((await connect(unverified, 'connect_error')).data.code).toBe(
        'EMAIL_NOT_VERIFIED',
      );
      await api('get', '/admin/activity', unverified).expect(403);
      expect(
        (await emit(one, 'presence:pulse', { ...signal, browser })).ok,
      ).toBe(true);
      expect(
        (await emit(two, 'presence:pulse', { ...signal, device: 'mobile' })).ok,
      ).toBe(true);
      expect(
        (await emit(guest, 'presence:pulse', { ...signal, browser })).ok,
      ).toBe(true);
      expect(
        snapshotKeys((await emit(observer, 'ops:subscribe')).data),
      ).toEqual([1, 0, 1, 3]);
      const pushed = once(observer, 'ops:presence');
      expect(snapshotKeys((await pushed)[0])).toEqual([1, 0, 1, 3]);
      await Session.updateMany(
        { userId: enrolled.user._id },
        { $set: { revokedAt: new Date() } },
      );
      expect((await emit(one, 'presence:pulse', signal)).ok).toBe(false);
      expect((await emit(two, 'presence:pulse', signal)).ok).toBe(false);
      expect(
        snapshotKeys(
          data(await api('get', '/admin/activity', admin).expect(200)),
        ),
      ).toEqual([0, 1, 1, 1]);
      const revoked = once(observer, 'ops:revoked');
      await User.updateOne(
        { _id: admin.user._id },
        { $set: { roles: ['viewer'] } },
      );
      await revoked;
      await User.updateOne(
        { _id: admin.user._id },
        { $set: { roles: ['admin', 'viewer'] } },
      );
      [observer, one, two, guest, staff].forEach((socket) =>
        socket.disconnect(),
      );
    }, 10000);
    it('counts distinct active accounts across days, applies local boundaries, and keeps expired raw events out of reporting', async () => {
      const options = analyticsOptions({ ANALYTICS_RAW_DAYS: 1 });
      const first = new Date('2032-11-24T18:29:59Z');
      const second = new Date('2032-11-24T18:30:00Z');
      const now = new Date('2032-11-25T20:00:00Z');
      const event = {
        id: randomUUID(),
        kind: 'page',
        module: 'home',
        device: 'desktop',
      };
      expect(
        await ingest(event, owner.user, options, auth.accessSecret, first),
      ).toEqual({ collected: true });
      expect(
        await ingest(event, owner.user, options, auth.accessSecret, first),
      ).toEqual({ collected: false, duplicate: true });
      await ingest(
        { ...event, id: randomUUID() },
        owner.user,
        options,
        auth.accessSecret,
        second,
      );
      await ingest(
        { ...event, id: randomUUID(), device: 'mobile' },
        other.user,
        options,
        auth.accessSecret,
        second,
      );
      await ingest(
        { ...event, id: randomUUID() },
        undefined,
        options,
        auth.accessSecret,
        second,
      );
      const excluded = await ingest(
        { ...event, id: randomUUID() },
        owner.user,
        { ...options, enabled: false },
        auth.accessSecret,
        now,
      );
      expect(excluded.collected).toBe(false);
      const snapshots = await AnalyticsEvent.find({}).lean();
      expect(snapshots.map((row) => row.expiresAt > now)).toEqual([
        false,
        false,
        false,
        false,
      ]);
      expect(snapshots.every((row) => !row.user && !row.ip && !row.url)).toBe(
        true,
      );
      await AnalyticsEvent.deleteMany({ expiresAt: { $lte: now } });
      const report = await historical(
        { from: '2032-11-23', to: '2032-11-26' },
        options,
        Ticket,
        now,
      );
      expect(
        report.rows.map(({ day, pages, active }) => [day, pages, active]),
      ).toEqual([
        ['2032-11-23', null, null],
        ['2032-11-24', 1, 1],
        ['2032-11-25', 3, 2],
        ['2032-11-26', null, null],
      ]);
      expect(report.distinct).toBe(2);
      expect((await activityTotals(options, now)).weekly).toBe(2);
      await api('get', '/admin/analytics?days=90', admin).expect(200);
      await api('get', '/admin/analytics?days=2', admin).expect(400);
      await api('get', '/admin/analytics', agent).expect(403);
      await api('post', '/analytics/events')
        .send({ ...event, url: '/secret?token=test' })
        .expect(400);
      await api('post', '/analytics/events')
        .send({
          ...event,
          id: randomUUID(),
          module: 'live',
          kind: 'playback',
          content: 'unknown',
        })
        .expect(400);
    }, 12000);
    it('supports owner and staff conversation, private screenshots, case audit and owned notifications', async () => {
      const original = draft();
      const created = data(
        await api('post', '/support/tickets', owner).send(original).expect(201),
      );
      const same = data(
        await api('post', '/support/tickets', owner).send(original).expect(201),
      );
      expect(same.id).toBe(created.id);
      const path = '/support/tickets/' + created.id;
      const staff = '/admin' + path;
      const target = await openTicket(other);
      await api('get', path, other).expect(404);
      await api('get', staff, other).expect(403);
      await api('get', '/admin/system-health', agent).expect(403);
      await api('get', '/admin/overview', agent).expect(403);
      const ownerSocket = await connect(owner);
      const otherSocket = await connect(other);
      await emit(ownerSocket, 'notice:subscribe');
      await emit(otherSocket, 'notice:subscribe');
      const signal = vi.fn();
      otherSocket.on('notice:changed', signal);
      const delivered = once(ownerSocket, 'notice:changed');
      await api('post', staff + '/messages', agent)
        .send(message('A private internal note.', { internal: true }))
        .expect(200);
      await api('post', staff + '/messages', agent)
        .send(message('The public support reply.'))
        .expect(200);
      await delivered;
      expect(signal).not.toHaveBeenCalled();
      const transcript = data(
        await api('get', path + '/messages', owner).expect(200),
      );
      expect(transcript.map((row) => row.text)).toEqual([
        'The public support reply.',
      ]);
      expect(
        data(await api('get', staff + '/messages', agent).expect(200)).some(
          (row) => row.kind === 'note',
        ),
      ).toBe(true);
      await api('post', path + '/messages', owner)
        .send(message('Forbidden note', { internal: true }))
        .expect(404);
      const png = await sharp({
        create: { width: 48, height: 48, channels: 3, background: 'yellow' },
      })
        .png()
        .toBuffer();
      const image = data(
        await api('post', path + '/attachments', owner)
          .type('png')
          .send(png)
          .expect(201),
      );
      const file = path + '/attachments/' + image.id;
      await api('get', file).expect(401);
      await api('get', file, other).expect(404);
      await api(
        'get',
        '/admin/support/tickets/' + target.id + '/attachments/' + image.id,
        agent,
      ).expect(404);
      await api('get', '/admin' + file, agent)
        .expect('Content-Type', /image\/webp/)
        .expect('Cache-Control', 'no-store')
        .expect(200);
      await api('post', path + '/attachments', owner)
        .type('png')
        .send(Buffer.from('invalid PNG'))
        .expect(415);
      const revision = data(
        await api('get', staff, agent).expect(200),
      ).revision;
      const assigned = data(
        await api('patch', staff, agent)
          .send({ action: 'assign', revision, assigned: agent.user.publicId })
          .expect(200),
      );
      await api('patch', staff, agent)
        .send({ action: 'priority', revision, priority: 'high' })
        .expect(409);
      const resolved = data(
        await api('patch', staff, agent)
          .send({
            action: 'status',
            revision: assigned.revision,
            status: 'resolved',
            resolution: 'Restored the player connection.',
          })
          .expect(200),
      );
      expect(resolved.status).toBe('resolved');
      const reopened = data(
        await api('patch', path, owner)
          .send({
            action: 'status',
            revision: resolved.revision,
            status: 'open',
          })
          .expect(200),
      );
      expect(reopened.status).toBe('open');
      const audit = data(await api('get', staff + '/audit', agent).expect(200));
      expect(audit.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          'support.assign',
          'support.status',
          'support.attachment',
        ]),
      );
      expect(JSON.stringify(audit)).not.toContain('Restored the player');
      await TicketAttachment.updateOne(
        { publicId: image.id },
        { $set: { expiresAt: new Date(0) } },
      );
      await api('get', file, owner).expect(404);
      expect(
        data(await api('get', path, owner).expect(200)).attachments,
      ).toEqual([]);
      const notices = data(
        await api('get', '/notifications', owner).expect(200),
      );
      expect(notices).toHaveLength(2);
      await api(
        'patch',
        '/notifications/' + notices[0].id + '/read',
        other,
      ).expect(404);
      await api('patch', '/notifications/read', owner).expect(200);
      expect(
        data(await api('get', '/notifications/unread', owner).expect(200))
          .count,
      ).toBe(0);
      ownerSocket.disconnect();
      otherSocket.disconnect();
    }, 15000);
    it('issues one-time guest links, scopes access, enforces per-address limits and records mail outcomes', async () => {
      const email = 'guest@example.test';
      const input = { email, ticket: draft() };
      await api('post', '/support/guest/start').send(input).expect(202);
      const challenge = await GuestChallenge.findOne({ email })
        .select('+hash')
        .lean();
      const verify = await SupportJob.findOne({ challenge: challenge._id });
      const transport = {
        sendMail: vi.fn().mockResolvedValue({ accepted: [email] }),
      };
      const delivery = supportMailer(auth, logger, transport);
      expect(await delivery(verify)).toBe('accepted');
      const mail = transport.sendMail.mock.calls[0][0];
      const token = new URL(mail.text.split('\n').at(-1)).hash.slice(7);
      expect(token).toBe(guestLinkToken(auth.accessSecret, challenge._id));
      expect(challenge.hash).not.toBe(token);
      expect(mail.text).not.toContain(input.ticket.description);
      const access = data(
        await api('post', '/support/guest/verify').send({ token }).expect(200),
      );
      expect(await GuestAccess.exists({ _id: access.access })).toBeNull();
      await api('post', '/support/guest/verify').send({ token }).expect(401);
      await api(
        'get',
        '/support/tickets/' + access.ticket.id,
        access.access,
      ).expect(200);
      await api(
        'get',
        '/support/tickets/' + (await openTicket()).id,
        access.access,
      ).expect(404);
      await api('post', '/support/guest/start')
        .send({ email, reference: access.ticket.reference })
        .expect(202);
      await api('post', '/support/guest/start').send(input).expect(202);
      await api('post', '/support/guest/start').send(input).expect(202);
      const challenges = await GuestChallenge.find({ email }).sort({
        createdAt: 1,
      });
      expect(challenges).toHaveLength(3);
      const duplicate = data(
        await api('post', '/support/guest/verify')
          .send({ token: guestLinkToken(auth.accessSecret, challenges[2].id) })
          .expect(200),
      );
      expect(duplicate.ticket.id).toBe(access.ticket.id);
      await GuestChallenge.updateOne(
        { _id: challenges[1].id },
        { $set: { expiresAt: new Date(0) } },
      );
      await api('post', '/support/guest/verify')
        .send({ token: guestLinkToken(auth.accessSecret, challenges[1].id) })
        .expect(401);
      await GuestAccess.updateMany(
        { ticket: access.ticket.id },
        { $set: { expiresAt: new Date(0) } },
      );
      await api(
        'get',
        '/support/tickets/' + access.ticket.id,
        access.access,
      ).expect(401);
      const past = new Date(Date.now() - 1000);
      await SupportJob.create({
        _id: 'ambiguous-job',
        type: 'verify',
        status: 'sending',
        dueAt: past,
        leaseUntil: past,
        expiresAt: new Date(Date.now() + 60000),
      });
      const observed = new Set();
      const deliver = vi.fn(async (job) => {
        expect(observed.has(job.id)).toBe(false);
        observed.add(job.id);
        return 'accepted';
      });
      await Promise.all([
        processSupportJobs(deliver),
        processSupportJobs(deliver),
      ]);
      expect(observed.size).toBeGreaterThan(5);
      expect((await SupportJob.findById('ambiguous-job')).status).toBe(
        'uncertain',
      );
    }, 15000);
    it('publishes only active announcements for their audiences and reports evidence-based health', async () => {
      const create = async (title, audience, startAt, endAt) =>
        data(
          await api('post', '/admin/announcements', admin)
            .send({
              title,
              audience,
              message: 'Test announcement body.',
              type: 'general',
              startAt,
              endAt,
            })
            .expect(200),
        );
      const publish = (row) =>
        api('post', '/admin/announcements/' + row.id + '/status', admin)
          .send({ action: 'publish', revision: row.revision })
          .expect(200);
      const before = new Date(Date.now() - 30000).toISOString(),
        future = new Date(Date.now() + 30000).toISOString();
      const rows = await Promise.all([
        create('Public update', 'public', before),
        create('Creator update', 'creator', before),
        create('Upcoming update', 'public', future),
        create(
          'Expired update',
          'public',
          new Date(Date.now() - 90000).toISOString(),
          future,
        ),
      ]);
      await create('Draft update', 'public', before);
      await Promise.all(rows.map(publish));
      await Announcement.updateOne(
        { publicId: rows[3].id },
        { $set: { endAt: new Date(before) } },
      );
      expect(
        data(await api('get', '/announcements').expect(200)).map(
          (row) => row.title,
        ),
      ).toEqual(['Public update']);
      expect(
        data(await api('get', '/announcements/account', owner).expect(200)).map(
          (row) => row.title,
        ),
      ).toEqual(['Creator update']);
      expect(
        data(await api('get', '/announcements/account', other).expect(200)),
      ).toEqual([]);
      await api('get', '/admin/announcements', agent).expect(403);
      health.set('sockets', 'healthy');
      const reported = data(
        await api('get', '/admin/system-health', admin).expect(200),
      );
      expect(reported).toMatchObject({
        api: { status: 'healthy' },
        mongodb: { status: 'healthy' },
        sockets: { status: 'healthy' },
        cloudinary: { status: 'not_configured' },
        backup: { status: 'not_checked' },
        supportWorker: { status: 'not_checked' },
      });
      expect(JSON.stringify(reported)).not.toMatch(
        /example\.test|password|secret/i,
      );
      const offline = await systemHealth({
        available: () => false,
        analytics: analyticsOptions(),
        smtp: false,
      });
      expect(offline.mongodb.status).toBe('unavailable');
      expect(offline.recentEmail).toBeNull();
    }, 12000);
  },
);
