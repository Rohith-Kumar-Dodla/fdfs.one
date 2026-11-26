import mongoose from 'mongoose';
import { z } from 'zod';
import { listInput, publicId, sendList } from '../../utils/list.js';

export const actions = [
  'user.role_changed',
  'user.status_changed',
  'user.sessions_revoked',
  'user.staff_changed',
  'site.settings',
  'site.homepage_save',
  'site.homepage_publish',
  'media.metadata',
  'submission.review',
  'submission.approve',
  'submission.reject',
  'submission.request_changes',
  'submission.archive',
  'submission.publish',
  'media.replace',
  'media.delete',
  'talent.create',
  'talent.edit',
  'talent.publish',
  'talent.unpublish',
  'talent.archive',
  'talent.associate',
  'talent.correction',
  'film.create',
  'film.edit',
  'film.publish',
  'film.unpublish',
  'film.archive',
  'film.correction',
  'podcast.show_create',
  'podcast.show_edit',
  'podcast.show_publish',
  'podcast.show_unpublish',
  'podcast.show_archive',
  'podcast.episode_create',
  'podcast.episode_edit',
  'podcast.episode_publish',
  'podcast.episode_unpublish',
  'podcast.episode_archive',
  'podcast.comment_hide',
  'podcast.comment_restore',
  'podcast.report_resolve',
  ...[
    'create',
    'edit',
    'publish',
    'unpublish',
    'archive',
    'cancel',
    'postpone',
    'start',
    'end',
    'reschedule',
    'replay',
    'remove_replay',
    'options',
    'chat_hide',
    'chat_restore',
    'chat_mute',
    'chat_unmute',
    'chat_resolve',
  ].map((action) => 'live.' + action),
];

const targetTypes = [
  'user',
  'submission',
  'media',
  'personality',
  'film',
  'podcast-show',
  'podcast-episode',
  'comment',
  'comment-report',
  'live-event',
  'site',
];
const schema = new mongoose.Schema(
  {
    actorId: { type: String, required: true, immutable: true },
    action: { type: String, required: true, enum: actions, immutable: true },
    targetType: {
      type: String,
      enum: [
        'user',
        'submission',
        'media',
        'personality',
        'film',
        'podcast-show',
        'podcast-episode',
        'comment',
        'comment-report',
        'live-event',
        'site',
      ],
      required: true,
      immutable: true,
    },
    targetId: { type: String, required: true, immutable: true },
    requestId: { type: String, required: true, immutable: true },
    outcome: {
      type: String,
      enum: ['success'],
      default: 'success',
      immutable: true,
    },
    summary: {
      field: {
        type: String,
        enum: [
          'super_admin',
          'admin',
          'content_manager',
          'moderator',
          'support_agent',
          'site',
          'creator',
          'organizer',
          'account-status',
          'sessions',
          'submission-status',
          'asset',
          'publication-status',
          'podcast',
          'comment-status',
          'report-status',
          'profile',
          'account-association',
          'film',
          'live',
        ],
      },
      reason: { type: String, maxlength: 500 },
      from: String,
      to: String,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, bufferCommands: false },
);

schema.index({ createdAt: -1 });
schema.index({ targetType: 1, targetId: 1, createdAt: -1 });
schema.index({ actorId: 1, createdAt: -1 });
schema.index({ action: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', schema);
export const auditListInput = listInput({
  action: z.enum(actions).optional(),
  actor: publicId.optional(),
  resource: z.enum(targetTypes).optional(),
  target: z.string().trim().min(1).max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  outcome: z.literal('success').optional(),
});

export async function recordAudit(
  session,
  { actorId, requestId },
  action,
  targetType,
  targetId,
  summary,
) {
  await AuditLog.create(
    [{ actorId, requestId, action, targetType, targetId, summary }],
    { session },
  );
}

export function listAudit(res, query) {
  const { action, actor, resource, target, from, to, outcome } = query;
  const filter = {
    ...(action && { action }),
    ...(actor && { actorId: actor }),
    ...(resource && { targetType: resource }),
    ...(target && { targetId: target }),
    ...(outcome && { outcome }),
    ...((from || to) && {
      createdAt: {
        ...(from && { $gte: new Date(from) }),
        ...(to && { $lt: new Date(Date.parse(to) + 86400000) }),
      },
    }),
  };
  return sendList(
    res,
    AuditLog,
    filter,
    query,
    ({
      _id,
      actorId,
      action,
      targetType,
      targetId,
      requestId,
      outcome,
      summary,
      createdAt,
    }) => ({
      id: String(_id),
      actorId,
      action,
      targetType,
      targetId,
      requestId,
      outcome,
      summary,
      createdAt,
    }),
  );
}
