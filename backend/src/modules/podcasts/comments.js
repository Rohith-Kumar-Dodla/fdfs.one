import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/app-error.js';
import { idParams, listInput, publicId, sendList } from '../../utils/list.js';
import { sendError, sendSuccess } from '../../utils/responses.js';
import {
  requireActiveAccount,
  requireVerifiedEmail,
} from '../auth/authorization.js';
import { PodcastEpisode } from './models.js';
import { findReleasedEpisode } from './read.js';
import { slug } from '../films/schemas.js';
import { podcastAudit } from './write.js';

const { Schema } = mongoose;
const targetType = 'podcast-episode';
const commentStates = ['visible', 'hidden', 'deleted'];
const reportReasons = ['spam', 'harassment', 'inappropriate', 'other'];
const id = { type: String, immutable: true, unique: true, default: randomUUID };
const commentSchema = new Schema(
  {
    publicId: id,
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      immutable: true,
      required: true,
    },
    targetType: {
      type: String,
      enum: [targetType],
      immutable: true,
      required: true,
    },
    target: { type: Schema.Types.ObjectId, immutable: true, required: true },
    text: { type: String, maxlength: 1500, required: true },
    status: { type: String, enum: commentStates, default: 'visible' },
    editedAt: Date,
    moderationReason: String,
  },
  { timestamps: true, bufferCommands: false },
);
commentSchema.index({
  targetType: 1,
  target: 1,
  status: 1,
  createdAt: -1,
  _id: -1,
});
commentSchema.index({ author: 1, target: 1, createdAt: -1 });
const reportSchema = new Schema(
  {
    publicId: id,
    comment: {
      type: Schema.Types.ObjectId,
      ref: 'EpisodeComment',
      immutable: true,
      required: true,
    },
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      immutable: true,
      required: true,
    },
    reason: { type: String, enum: reportReasons, required: true },
    details: { type: String, maxlength: 500 },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    resolution: String,
    resolvedAt: Date,
  },
  { timestamps: true, bufferCommands: false },
);
reportSchema.index({ comment: 1, reporter: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1, _id: -1 });

export const EpisodeComment = mongoose.model('EpisodeComment', commentSchema);
export const CommentReport = mongoose.model('CommentReport', reportSchema);

const readInput = listInput();
const targetParams = z.object({ slug });
const commentParams = z.object({ slug, id: publicId });
const commentText = z.string().trim().min(2).max(1500);
const bodyText = z.strictObject({ text: commentText });
const reportBody = z.strictObject({
  reason: z.enum(reportReasons),
  details: z.string().trim().min(1).max(500).optional(),
});
const choice = z.string().trim().min(3).max(500);
const adminCommentList = listInput({
  status: z.enum(commentStates).optional(),
  episodeId: publicId.optional(),
});
const adminReportList = listInput({
  status: z.enum(['open', 'resolved']).optional(),
});
const moderate = z.object({
  params: idParams,
  body: z.strictObject({ action: z.enum(['hide', 'restore']), reason: choice }),
});
const resolve = z.object({
  params: idParams,
  body: z.strictObject({ reason: choice }),
});

const data = (res) => res.locals.validated;
const absent = () =>
  new AppError(404, 'COMMENT_NOT_FOUND', 'Comment not found.');
const targetFilter = (episode) => ({ targetType, target: episode._id });
const context = (req, res) => ({
  actorId: req.auth.user.publicId,
  requestId: res.get('X-Request-Id'),
});

function view(entry, viewer) {
  const { publicId, author, text, createdAt, editedAt } = entry;
  return {
    id: publicId,
    author: author?.fullName ?? 'Former member',
    text,
    createdAt,
    editedAt,
    ...(viewer && { mine: String(author?._id) === String(viewer) }),
  };
}

function limitPosts() {
  return rateLimit({
    windowMs: 60000,
    limit: 12,
    keyGenerator: (req) => req.auth.user.publicId,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) =>
      sendError(res, {
        status: 429,
        code: 'COMMENT_RATE_LIMIT',
        message: 'Try again in a minute.',
      }),
  });
}

function sendComment(res, entry, viewer, status = 200) {
  return sendSuccess(
    res,
    view(
      {
        ...entry.toObject(),
        author: { _id: viewer._id, fullName: viewer.fullName },
      },
      viewer._id,
    ),
    { status },
  );
}

export function mountPodcastComments(api, admin, authenticate) {
  const path = '/podcasts/episodes/:slug/comments';
  const writer = [
    authenticate,
    requireActiveAccount,
    requireVerifiedEmail,
    limitPosts(),
  ];
  api.get(
    path,
    (req, res, next) =>
      req.get('Authorization') ? authenticate(req, res, next) : next(),
    validate(z.object({ ...readInput.shape, params: targetParams })),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const { params, query } = data(res);
      const episode = await findReleasedEpisode(params.slug);
      const viewer = req.auth?.user._id;
      return sendList(
        res,
        EpisodeComment,
        { ...targetFilter(episode), status: 'visible' },
        query,
        (entry) => view(entry, viewer),
        'publicId author text createdAt editedAt',
        undefined,
        (list) => list.populate('author', 'fullName'),
      );
    },
  );
  api.post(
    path,
    ...writer,
    validate(z.object({ params: targetParams, body: bodyText })),
    async (req, res) => {
      const { params, body } = data(res);
      const episode = await findReleasedEpisode(params.slug);
      const viewer = req.auth.user;
      const entry = {
        ...targetFilter(episode),
        author: viewer._id,
        text: body.text,
      };
      if (
        await EpisodeComment.exists({
          ...entry,
          status: 'visible',
          createdAt: { $gte: new Date(Date.now() - 60000) },
        })
      ) {
        throw new AppError(
          409,
          'COMMENT_DUPLICATE',
          'This comment was already posted recently.',
        );
      }
      return sendComment(res, await EpisodeComment.create(entry), viewer, 201);
    },
  );
  api.patch(
    path + '/:id',
    ...writer,
    validate(z.object({ params: commentParams, body: bodyText })),
    async (req, res) => {
      const { params, body } = data(res);
      const episode = await findReleasedEpisode(params.slug);
      const viewer = req.auth.user;
      const filter = {
        ...targetFilter(episode),
        publicId: params.id,
        author: viewer._id,
        status: 'visible',
      };
      const previous = await EpisodeComment.findOne(filter);
      if (!previous) throw absent();
      if (previous.text === body.text)
        return sendComment(res, previous, viewer);
      const entry = await EpisodeComment.findOneAndUpdate(
        { ...filter, text: previous.text },
        { $set: { text: body.text, editedAt: new Date() } },
        { returnDocument: 'after' },
      );
      if (!entry)
        throw new AppError(
          409,
          'COMMENT_CHANGED',
          'This comment changed. Reload it and try again.',
        );
      return sendComment(res, entry, viewer);
    },
  );
  api.delete(
    path + '/:id',
    ...writer,
    validate(z.object({ params: commentParams })),
    async (req, res) => {
      const { params } = data(res);
      const episode = await findReleasedEpisode(params.slug);
      const result = await EpisodeComment.updateOne(
        {
          ...targetFilter(episode),
          publicId: params.id,
          author: req.auth.user._id,
          status: { $ne: 'deleted' },
        },
        { $set: { status: 'deleted', text: '' } },
      );
      if (!result.matchedCount) throw absent();
      return sendSuccess(res, null);
    },
  );
  api.post(
    path + '/:id/report',
    ...writer,
    validate(z.object({ params: commentParams, body: reportBody })),
    async (req, res) => {
      const { params, body } = data(res);
      const episode = await findReleasedEpisode(params.slug);
      const entry = await EpisodeComment.findOne({
        ...targetFilter(episode),
        publicId: params.id,
        status: 'visible',
      }).select('_id');
      if (!entry) throw absent();
      try {
        await CommentReport.create({
          ...body,
          comment: entry._id,
          reporter: req.auth.user._id,
        });
      } catch (error) {
        if (error.code === 11000)
          throw new AppError(
            409,
            'COMMENT_ALREADY_REPORTED',
            'You already reported this comment.',
          );
        throw error;
      }
      return sendSuccess(res, null, { status: 201 });
    },
  );
  admin.get(
    '/podcasts/comments',
    validate(adminCommentList),
    async (req, res) => {
      const { query } = data(res);
      const filter = {
        targetType,
        ...(query.status && { status: query.status }),
      };
      if (query.episodeId) {
        const episode = await PodcastEpisode.findOne({
          publicId: query.episodeId,
        }).select('_id');
        filter.target = episode?._id ?? null;
      }
      return sendList(
        res,
        EpisodeComment,
        filter,
        query,
        (entry) => ({
          ...view(entry),
          status: entry.status,
          moderationReason: entry.moderationReason,
        }),
        'publicId author text status createdAt editedAt moderationReason',
        undefined,
        (list) => list.populate('author', 'fullName'),
      );
    },
  );
  admin.post(
    '/podcasts/comments/:id/moderate',
    validate(moderate),
    async (req, res) => {
      const { params, body } = data(res);
      const [from, to] =
        body.action === 'hide' ? ['visible', 'hidden'] : ['hidden', 'visible'];
      await mongoose.connection.transaction(async (session) => {
        const result = await EpisodeComment.updateOne(
          { publicId: params.id, targetType, status: from },
          { $set: { status: to, moderationReason: body.reason } },
          { session },
        );
        if (!result.matchedCount)
          throw new AppError(
            409,
            'COMMENT_TRANSITION_INVALID',
            'The comment state has changed.',
          );
        await podcastAudit(
          session,
          context(req, res),
          'comment_' + body.action,
          'comment',
          params.id,
          { field: 'comment-status', from, to },
        );
      });
      return sendSuccess(res, null);
    },
  );
  admin.get('/podcasts/reports', validate(adminReportList), (req, res) => {
    const { query } = data(res);
    return sendList(
      res,
      CommentReport,
      { status: query.status ?? 'open' },
      query,
      ({
        publicId,
        comment,
        status,
        reason,
        details,
        resolution,
        createdAt,
      }) => ({
        id: publicId,
        status,
        reason,
        details,
        resolution,
        createdAt,
        comment: comment
          ? { id: comment.publicId, text: comment.text, status: comment.status }
          : null,
      }),
      'publicId comment status reason details resolution createdAt',
      undefined,
      (list) => list.populate('comment', 'publicId text status'),
    );
  });
  admin.post(
    '/podcasts/reports/:id/resolve',
    validate(resolve),
    async (req, res) => {
      const { params, body } = data(res);
      await mongoose.connection.transaction(async (session) => {
        const result = await CommentReport.updateOne(
          { publicId: params.id, status: 'open' },
          {
            $set: {
              status: 'resolved',
              resolution: body.reason,
              resolvedAt: new Date(),
            },
          },
          { session },
        );
        if (!result.matchedCount)
          throw new AppError(
            409,
            'REPORT_ALREADY_RESOLVED',
            'The report has already been resolved or is unavailable.',
          );
        await podcastAudit(
          session,
          context(req, res),
          'report_resolve',
          'comment-report',
          params.id,
          { field: 'report-status', from: 'open', to: 'resolved' },
        );
      });
      return sendSuccess(res, null);
    },
  );
}
