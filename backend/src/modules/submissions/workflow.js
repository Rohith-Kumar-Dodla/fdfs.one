import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { idParams, listInput, sendList } from '../../utils/list.js';
import { recordAudit } from '../admin/audit.js';

const permissions = {
  film: ['creator'],
  original: [],
  podcast: ['creator'],
  live: ['organizer'],
  talent: ['viewer'],
};
const categories = Object.keys(permissions);
const states = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'published',
  'archived',
];
const transitions = {
  review: { from: ['submitted'], to: 'under_review' },
  approve: { from: ['under_review'], to: 'approved' },
  reject: { from: ['under_review'], to: 'rejected' },
  archive: { from: ['approved', 'rejected', 'published'], to: 'archived' },
};
const historySchema = new mongoose.Schema(
  {
    actorId: String,
    from: String,
    to: String,
    reason: String,
    at: Date,
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      unique: true,
      immutable: true,
      default: randomUUID,
    },
    owner: { type: String, required: true, immutable: true },
    category: {
      type: String,
      enum: categories,
      required: true,
      immutable: true,
    },
    title: { type: String, required: true, maxlength: 160 },
    summary: { type: String, required: true, maxlength: 4000 },
    status: { type: String, enum: states, default: 'draft' },
    reviewedAt: Date,
    rejectionReason: String,
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true, bufferCommands: false },
);
schema.index({ owner: 1, createdAt: -1 });
schema.index({ status: 1, category: 1, createdAt: -1 });
export const Submission = mongoose.model('Submission', schema);

const title = z.string().trim().min(3).max(160);
const summary = z.string().trim().min(10).max(4000);
export const submissionListInput = listInput({
  status: z.enum(states).optional(),
  category: z.enum(categories).optional(),
});
export const newSubmissionInput = z.object({
  body: z.strictObject({ category: z.enum(categories), title, summary }),
});
export const editSubmissionInput = z.object({
  params: idParams,
  body: z.strictObject({ title, summary }),
});
export const submissionInput = z.object({ params: idParams });
export const moderationInput = z.object({
  params: idParams,
  body: z.discriminatedUnion('action', [
    z.strictObject({
      action: z.literal('reject'),
      reason: z.string().trim().min(3).max(500),
    }),
    z.strictObject({ action: z.enum(['review', 'approve', 'archive']) }),
  ]),
});

export function submissionView(record, detail = false) {
  const {
    publicId,
    owner,
    title,
    summary,
    category,
    status,
    reviewedAt,
    rejectionReason,
    createdAt,
    updatedAt,
    history,
  } = record;
  return {
    id: publicId,
    owner,
    title,
    category,
    status,
    reviewedAt,
    createdAt,
    updatedAt,
    ...(detail && { summary, rejectionReason, history }),
  };
}

function assertParticipation(user, category) {
  if (
    !user.roles.includes('admin') &&
    !permissions[category].some((role) => user.roles.includes(role))
  ) {
    throw new AppError(
      403,
      'SUBMISSION_ROLE_REQUIRED',
      'Your account does not have permission for this category.',
    );
  }
}
const missing = () =>
  new AppError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');
const invalidTransition = () =>
  new AppError(
    409,
    'INVALID_SUBMISSION_TRANSITION',
    'This action is unavailable for the current submission status.',
  );

export function listSubmissions(res, query, owner) {
  const filter = {};
  if (owner) filter.owner = owner;
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  return sendList(
    res,
    Submission,
    filter,
    query,
    (record) => submissionView(record),
    '-summary -history -rejectionReason',
  );
}

export async function getSubmission(id, owner) {
  const record = await Submission.findOne({
    publicId: id,
    ...(owner && { owner }),
  });
  if (!record) throw missing();
  return record;
}

export async function createSubmission(user, input) {
  assertParticipation(user, input.category);
  return submissionView(
    await Submission.create({ ...input, owner: user.publicId }),
    true,
  );
}

export async function updateOwnSubmission(user, id, input) {
  const record = await getSubmission(id, user.publicId);
  assertParticipation(user, record.category);
  if (!['draft', 'rejected'].includes(record.status)) throw invalidTransition();
  const update = input
    ? { $set: input }
    : {
        $set: { status: 'submitted' },
        $unset: { rejectionReason: 1, reviewedAt: 1 },
        $push: {
          history: {
            actorId: user.publicId,
            from: record.status,
            to: 'submitted',
            at: new Date(),
          },
        },
      };
  const changed = await Submission.findOneAndUpdate(
    { _id: record._id, status: record.status, __v: record.__v },
    { ...update, $inc: { __v: 1 } },
    { returnDocument: 'after' },
  );
  if (!changed) throw invalidTransition();
  return submissionView(changed, true);
}

export function moderateSubmission(id, input, context) {
  return mongoose.connection.transaction(async (session) => {
    const record = await Submission.findOne({ publicId: id }).session(session);
    if (!record) throw missing();
    const transition = transitions[input.action];
    if (!transition?.from.includes(record.status)) throw invalidTransition();
    const now = new Date();
    const changes = { status: transition.to };
    if (input.action !== 'archive') changes.reviewedAt = now;
    if (input.reason) changes.rejectionReason = input.reason;
    const updated = await Submission.findOneAndUpdate(
      { _id: record._id, status: record.status },
      {
        $set: changes,
        $inc: { __v: 1 },
        $push: {
          history: {
            actorId: context.actorId,
            from: record.status,
            to: transition.to,
            reason: input.reason,
            at: now,
          },
        },
      },
      { session, returnDocument: 'after' },
    );
    if (!updated) throw invalidTransition();
    await recordAudit(
      session,
      context,
      `submission.${input.action}`,
      'submission',
      id,
      {
        field: 'submission-status',
        from: record.status,
        to: transition.to,
      },
    );
    return submissionView(updated, true);
  });
}

export async function publishSubmission(id, context, publishers = {}) {
  const initial = await getSubmission(id);
  const publisher = publishers[initial.category];
  if (!publisher)
    throw new AppError(
      409,
      'PUBLICATION_UNAVAILABLE',
      'The feature publishing workflow is not available yet.',
    );
  return mongoose.connection.transaction(async (session) => {
    const record = await Submission.findOne({
      publicId: id,
      status: 'approved',
    }).session(session);
    if (!record) throw invalidTransition();
    await publisher({ submission: record, actorId: context.actorId, session });
    record.status = 'published';
    record.history.push({
      actorId: context.actorId,
      from: 'approved',
      to: 'published',
      at: new Date(),
    });
    await record.save({ session });
    await recordAudit(
      session,
      context,
      'submission.publish',
      'submission',
      id,
      {
        field: 'submission-status',
        from: 'approved',
        to: 'published',
      },
    );
    return submissionView(record, true);
  });
}
