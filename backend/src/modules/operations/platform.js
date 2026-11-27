import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { announcementTypes, audiences } from '../../../../shared/operations.js';
import { AppError } from '../../utils/app-error.js';
import {
  idParams,
  listInput,
  searchPattern,
  sendList,
} from '../../utils/list.js';
import { recordAudit } from '../admin/audit.js';
import { AnalyticsClock } from './analytics.js';
import { Notice, SupportJob } from './support-models.js';
import { Reminder } from '../live/reminders.js';
import pkg from '../../../package.json' with { type: 'json' };

const schema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      default: randomUUID,
      unique: true,
      immutable: true,
    },
    title: String,
    message: String,
    type: String,
    audience: String,
    startAt: Date,
    endAt: Date,
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
  },
  { timestamps: true, bufferCommands: false, optimisticConcurrency: true },
);
schema.index({ status: 1, audience: 1, startAt: 1, endAt: 1 });
export const Announcement = mongoose.model('PlatformAnnouncement', schema);
const fields = {
  title: z.string().trim().min(3).max(100),
  message: z.string().trim().min(3).max(1200),
  type: z.enum(announcementTypes),
  audience: z.enum(audiences),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime().optional(),
};
const ordered = (shape) =>
  z
    .strictObject(shape)
    .refine(
      ({ startAt, endAt }) => !endAt || Date.parse(endAt) > Date.parse(startAt),
      { path: ['endAt'] },
    );
const revision = z.number().int().nonnegative();
export const announcementCreate = z.object({ body: ordered(fields) });
export const announcementEdit = z.object({
  params: idParams,
  body: ordered({ ...fields, revision }),
});
export const announcementAction = z.object({
  params: idParams,
  body: z.strictObject({
    revision,
    action: z.enum(['publish', 'unpublish', 'archive']),
  }),
});
export const announcementList = listInput({
  q: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});
const missing = () =>
  new AppError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found.');
const changed = () =>
  new AppError(
    409,
    'ANNOUNCEMENT_CHANGED',
    'The announcement changed. Reload before saving.',
  );
const view = (
  { publicId, title, message, type, audience, startAt, endAt, status, __v },
  admin = false,
) => ({
  id: publicId,
  title,
  message,
  type,
  startAt,
  endAt,
  ...(admin && { audience, status, revision: __v }),
});
export async function getAnnouncement(id) {
  const row = await Announcement.findOne({ publicId: id }).lean();
  if (!row) throw missing();
  return view(row, true);
}
export function managedAnnouncements(res, query) {
  return sendList(
    res,
    Announcement,
    {
      ...(query.status && { status: query.status }),
      ...(query.q && { title: searchPattern(query.q) }),
    },
    query,
    (row) => view(row, true),
  );
}
export async function announcements(user, now = new Date()) {
  const eligible = user
    ? [
        'authenticated',
        ...['creator', 'organizer'].filter((role) => user.roles.includes(role)),
      ]
    : ['public'];
  const rows = await Announcement.find({
    status: 'published',
    audience: { $in: eligible },
    startAt: { $lte: now },
    $or: [{ endAt: null }, { endAt: { $gt: now } }],
  })
    .sort({ startAt: -1 })
    .limit(10)
    .lean();
  return rows.map((row) => view(row));
}
export function editAnnouncement(id, input, audit) {
  return mongoose.connection
    .transaction(async (session) => {
      const row = id
        ? await Announcement.findOne({ publicId: id }).session(session)
        : new Announcement();
      if (!row) throw missing();
      const { revision, action, ...fields } = input;
      if (id && (row.__v !== revision || row.status === 'archived'))
        throw changed();
      const before = row.status;
      if (action) {
        if (
          (action === 'publish' && before !== 'draft') ||
          (action === 'unpublish' && before !== 'published')
        )
          throw changed();
        if (action === 'publish' && row.endAt && row.endAt <= new Date())
          throw new AppError(
            400,
            'ANNOUNCEMENT_EXPIRED',
            'Choose a future end before publishing.',
          );
        row.status = {
          publish: 'published',
          unpublish: 'draft',
          archive: 'archived',
        }[action];
      } else {
        if (id && before !== 'draft') throw changed();
        row.set({ endAt: undefined, ...fields });
      }
      if (id) row.increment();
      await row.save({ session });
      await recordAudit(
        session,
        audit,
        'announcement.' + (action ?? (id ? 'edit' : 'create')),
        'announcement',
        row.publicId,
        { field: 'announcement', from: before, to: row.status },
      );
      return view(row, true);
    })
    .catch((error) => {
      if (error.name === 'VersionError') throw changed();
      throw error;
    });
}

const labels = {
  movie_request: 'Your movie review request was updated',
  reply: 'Support replied to your ticket',
  status: 'Your support ticket status changed',
  resolved: 'Your support ticket was resolved',
  review_comment: 'Someone commented on your review',
  review_moderation: 'Your review activity was moderated',
  live_reminder: 'Your live event reminder was sent',
  talent_release: 'A new release features talent you follow',
};
export const noticeKinds = {
  reviews: [
    'movie_request',
    'review_reply',
    'review_comment',
    'review_moderation',
    'review_like',
  ],
  support: ['reply', 'status', 'resolved'],
  releases: ['talent_release', 'live_reminder'],
};
export async function listNotices(res, query, user) {
  return sendList(
    res,
    Notice,
    {
      owner: user.publicId,
      ...(query.kind && { type: { $in: noticeKinds[query.kind] } }),
      ...(query.unread && { readAt: null }),
    },
    query,
    ({ publicId, type, ticket, path, createdAt, readAt }) => ({
      id: publicId,
      type,
      label: labels[type] ?? 'Support update',
      destination: path ?? '/support/tickets/' + ticket,
      createdAt,
      readAt,
    }),
  );
}
export async function unreadCount(user) {
  return {
    count: await Notice.countDocuments({ owner: user.publicId, readAt: null }),
  };
}
export async function readNotices(user, id) {
  const filter = { owner: user.publicId, ...(id && { publicId: id }) };
  const result = await Notice.updateMany(
    { ...filter, readAt: null },
    { $set: { readAt: new Date() } },
  );
  if (id && !result.matchedCount && !(await Notice.exists(filter)))
    throw new AppError(404, 'NOTICE_NOT_FOUND', 'Notification not found.');
  return unreadCount(user);
}

export function createOperationsHealth() {
  const states = new Map();
  return {
    set(name, status) {
      states.set(name, { status, checkedAt: new Date() });
    },
    get(name) {
      return states.get(name) ?? { status: 'not_checked' };
    },
  };
}

export async function systemHealth({
  available,
  presence,
  health,
  smtp,
  analytics,
  media,
}) {
  const connected = available();
  const [emails, reminderFailures, clock] = connected
    ? await Promise.all([
        SupportJob.aggregate([
          { $match: { updatedAt: { $gte: new Date(Date.now() - 86400000) } } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              latest: { $max: '$updatedAt' },
            },
          },
        ]),
        Reminder.countDocuments({ state: { $in: ['failed', 'uncertain'] } }),
        AnalyticsClock.findById(analytics.timezone).select('lastAt').lean(),
      ])
    : [null, null, null];
  const options = (name, configured = true) =>
    configured
      ? (health?.get(name) ?? { status: 'not_checked' })
      : { status: 'not_configured' };
  return {
    version: pkg.version,
    at: new Date(),
    api: { status: 'healthy' },
    mongodb: { status: connected ? 'healthy' : 'unavailable' },
    sockets: options('sockets'),
    presence: presence
      ? {
          status: presence.snapshot().initializing ? 'initializing' : 'healthy',
        }
      : { status: 'not_configured' },
    analytics: analytics.enabled
      ? {
          status: clock?.lastAt ? 'healthy' : 'not_checked',
          checkedAt: clock?.lastAt,
        }
      : { status: 'not_configured' },
    reminderWorker: options('reminderWorker', smtp),
    talentNotices: options('talentNotices', connected),
    supportWorker: options('supportWorker', smtp),
    cloudinary: options('cloudinary', media),
    recentEmail:
      emails?.map(({ _id: status, count, latest }) => ({
        status,
        count,
        latest,
      })) ?? null,
    failedSupportJobs: emails
      ? emails
          .filter(({ _id }) => ['failed', 'uncertain'].includes(_id))
          .reduce((total, row) => total + row.count, 0)
      : null,
    failedReminders: reminderFailures,
    backup: { status: 'not_checked' },
  };
}
