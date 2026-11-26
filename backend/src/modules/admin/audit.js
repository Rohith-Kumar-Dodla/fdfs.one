import mongoose from 'mongoose';
import { z } from 'zod';
import { listInput, sendList } from '../../utils/list.js';

export const actions = [
  'user.role_changed',
  'user.status_changed',
  'user.sessions_revoked',
  'submission.review',
  'submission.approve',
  'submission.reject',
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
];

const schema = new mongoose.Schema(
  {
    actorId: { type: String, required: true, immutable: true },
    action: { type: String, required: true, enum: actions, immutable: true },
    targetType: {
      type: String,
      enum: ['user', 'submission', 'media', 'personality', 'film'],
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
          'creator',
          'organizer',
          'account-status',
          'sessions',
          'submission-status',
          'asset',
          'publication-status',
          'profile',
          'account-association',
          'film',
        ],
      },
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
export const auditListInput = listInput({ action: z.enum(actions).optional() });

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
  const filter = query.action ? { action: query.action } : {};
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
