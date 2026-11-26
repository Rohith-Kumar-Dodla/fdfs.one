import mongoose from 'mongoose';
import { reviewTargetPath } from '../../../../shared/reviews.js';
import { AppError } from '../../utils/app-error.js';
import { sendList } from '../../utils/list.js';
import { sendSuccess } from '../../utils/responses.js';
import { recordAudit } from '../admin/audit.js';
import { User } from '../auth/models.js';
import { Film } from '../films/models.js';
import { publicMovieFilter } from './movies.js';
import { Notice } from '../operations/support-models.js';
import {
  Movie,
  Rating,
  Review,
  ReviewComment,
  ReviewLike,
  ReviewReport,
} from './models.js';
import { resolveTarget, targetKey } from './ratings.js';

const missingItem = () =>
  new AppError(404, 'REVIEW_NOT_FOUND', 'Review or comment not found.');
const duplicate = () =>
  new AppError(
    409,
    'REVIEW_EXISTS',
    'You already have a review for this title.',
  );
const authorPublic = { path: 'author', select: 'publicId fullName status' };
const authors = (row) =>
  row.author?.status === 'active'
    ? { id: row.author.publicId, name: row.author.fullName }
    : { name: 'Former member' };
const own = (row, account) => String(row.author) === String(account._id);
const hidden = () =>
  new AppError(
    409,
    'REVIEW_HIDDEN',
    'This content is currently unavailable for editing.',
  );
const displayReview = (row, rating) => ({
  id: row.publicId,
  title: row.title,
  body: row.body,
  spoiler: row.spoiler,
  author: authors(row),
  rating: rating ? rating.units / 2 : null,
  likes: row.likeCount,
  comments: row.commentCount,
  createdAt: row.createdAt,
  updatedAt: row.editedAt,
  status: row.status,
});
const displayComment = (row) => ({
  id: row.publicId,
  body: row.body,
  spoiler: row.spoiler,
  author: authors(row),
  createdAt: row.createdAt,
  updatedAt: row.editedAt,
});
async function content(target, id, session = null, author) {
  const status = author ? { $in: ['published', 'hidden'] } : 'published';
  const row = await Review.findOne({
    ...targetKey(target),
    publicId: id,
    status,
    ...(author && { author: author._id }),
  }).session(session);
  if (!row) throw missingItem();
  return row;
}
async function decorate(rows, target, session = null) {
  const keys = [
    ...new Set(rows.map((row) => String(row.author?._id ?? row.author))),
  ];
  const ratings = await Rating.find({
    ...targetKey(target),
    author: { $in: keys },
    excludedAt: null,
  })
    .select('author units')
    .session(session)
    .lean();
  const byAuthor = new Map(ratings.map((row) => [String(row.author), row]));
  return rows.map((row) =>
    displayReview(row, byAuthor.get(String(row.author?._id ?? row.author))),
  );
}
export async function getReview(params, account) {
  const target = await resolveTarget(params);
  const row = account
    ? await Review.findOne({
        ...targetKey(target),
        author: account._id,
        status: { $in: ['published', 'hidden'] },
      })
    : await content(target, params.id);
  if (!row) return null;
  await row.populate(authorPublic);
  const [view] = await decorate([row], target);
  return view;
}
export const trendingWindowMs = 14 * 86400000;
function rankReview(now) {
  const since = new Date(+now - trendingWindowMs);
  const signal = (model, extra = []) => ({
    $lookup: {
      from: model.collection.name,
      let: { reviewId: '$_id' },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ['$review', '$$reviewId'] },
            createdAt: { $gte: since },
          },
        },
        ...extra,
        { $count: 'count' },
      ],
      as: model.modelName,
    },
  });
  const total = (name) => ({ $ifNull: [{ $first: '$' + name + '.count' }, 0] });
  return [
    signal(ReviewLike),
    signal(ReviewComment, [{ $match: { status: 'published' } }]),
    {
      $set: {
        score: {
          $add: [
            total(ReviewLike.modelName),
            { $multiply: [2, total(ReviewComment.modelName)] },
            { $cond: [{ $gte: ['$createdAt', since] }, 1, 0] },
          ],
        },
      },
    },
    { $match: { score: { $gt: 0 } } },
    { $sort: { score: -1, createdAt: -1, _id: -1 } },
  ];
}
export async function trendingReviews({ page, limit }, now = new Date()) {
  const lookup = (model, as, visibility, type) => ({
    $lookup: {
      from: model.collection.name,
      localField: 'target',
      foreignField: '_id',
      let: { kind: '$targetType' },
      pipeline: [
        { $match: { ...visibility, $expr: type } },
        { $project: { slug: 1, title: 1 } },
      ],
      as,
    },
  });
  const [result] = await Review.aggregate([
    { $match: { status: 'published' } },
    lookup(Movie, 'movie', publicMovieFilter(now), {
      $eq: ['$$kind', 'movie'],
    }),
    lookup(
      Film,
      'film',
      { status: 'published', releaseAt: { $lte: now } },
      {
        $or: [
          {
            $and: [
              { $eq: ['$$kind', 'cinema'] },
              { $eq: ['$classification', 'independent'] },
            ],
          },
          {
            $and: [
              { $eq: ['$$kind', 'original'] },
              { $eq: ['$classification', 'original'] },
            ],
          },
        ],
      },
    ),
    {
      $set: {
        titleRecord: { $ifNull: [{ $first: '$movie' }, { $first: '$film' }] },
      },
    },
    { $match: { 'titleRecord.slug': { $type: 'string' } } },
    ...rankReview(now),
    {
      $facet: {
        records: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              publicId: 1,
              author: 1,
              target: 1,
              targetType: 1,
              titleRecord: 1,
              title: 1,
              body: 1,
              spoiler: 1,
              status: 1,
              createdAt: 1,
              editedAt: 1,
              likeCount: 1,
              commentCount: 1,
            },
          },
        ],
        totals: [{ $count: 'total' }],
      },
    },
  ]);
  const records = result?.records ?? [];
  const total = result?.totals[0]?.total ?? 0;
  await Review.populate(records, authorPublic);
  const groups = Map.groupBy(
    records,
    (record) => record.targetType + ':' + record.target,
  );
  const items = new Map(
    (
      await Promise.all(
        [...groups.values()].map(async (rows) => {
          const target = rows[0];
          const decorated = await decorate(rows, target);
          return decorated.map((row) => [
            row.id,
            {
              ...row,
              target: {
                type: target.targetType,
                slug: target.titleRecord.slug,
                title: target.titleRecord.title,
                path: reviewTargetPath(
                  target.targetType,
                  target.titleRecord.slug,
                ),
              },
            },
          ]);
        }),
      )
    ).flat(),
  );
  return {
    data: records.map((row) => items.get(row.publicId)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
const ratingFilter = (units) => [
  {
    $lookup: {
      from: Rating.collection.name,
      let: { authorId: '$author', targetId: '$target', kind: '$targetType' },
      pipeline: [
        {
          $match: {
            units,
            excludedAt: null,
            $expr: {
              $and: [
                { $eq: ['$author', '$$authorId'] },
                { $eq: ['$target', '$$targetId'] },
                { $eq: ['$targetType', '$$kind'] },
              ],
            },
          },
        },
        { $project: { _id: 1 } },
        { $limit: 1 },
      ],
      as: 'selectedRating',
    },
  },
  { $match: { 'selectedRating.0': { $exists: true } } },
];
export async function listReviews(res, target, query, now = new Date()) {
  const { page, limit, sort, rating } = query;
  const order =
    sort === 'liked'
      ? { likeCount: -1, createdAt: -1, _id: -1 }
      : { createdAt: -1, _id: -1 };
  const where = { ...targetKey(target), status: 'published' };
  let rows, total;
  if (rating || sort === 'trending') {
    const [result] = await Review.aggregate([
      { $match: where },
      ...(rating ? ratingFilter(rating * 2) : []),
      ...(sort === 'trending' ? rankReview(now) : [{ $sort: order }]),
      {
        $facet: {
          records: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $unset: [
                'selectedRating',
                ReviewLike.modelName,
                ReviewComment.modelName,
                'moderationReason',
                'moderatedBy',
              ],
            },
          ],
          totals: [{ $count: 'count' }],
        },
      },
    ]);
    rows = result?.records ?? [];
    total = result?.totals[0]?.count ?? 0;
  } else {
    [rows, total] = await Promise.all([
      Review.find(where)
        .sort(order)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Review.countDocuments(where),
    ]);
  }
  await Review.populate(rows, authorPublic);
  return sendSuccess(res, await decorate(rows, target), {
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
export function writeReview(params, account, input, action) {
  return mongoose.connection
    .transaction(async (session) => {
      const target = await resolveTarget(params, session, true);
      const key = { ...targetKey(target), author: account._id };
      if (action === 'create') {
        if (
          await Review.exists({
            ...key,
            status: { $in: ['published', 'hidden'] },
          }).session(session)
        )
          throw duplicate();
        const [row] = await Review.create([{ ...key, ...input }], { session });
        return { id: row.publicId };
      }
      const row = await content(target, params.id, session, account);
      if (action === 'delete') {
        await Review.updateOne(
          { _id: row._id },
          { $set: { status: 'deleted' }, $unset: { body: 1, title: 1 } },
          { session },
        );
        return { id: row.publicId, deleted: true };
      }
      if (row.status !== 'published') throw hidden();
      row.set({ ...input, title: input.title, editedAt: new Date() });
      await row.save({ session });
      return { id: row.publicId };
    })
    .catch((error) => {
      if (error.code === 11000) throw duplicate();
      throw error;
    });
}
export async function listComments(res, params, query) {
  const target = await resolveTarget(params);
  const review = await content(target, params.id);
  return sendList(
    res,
    ReviewComment,
    { review: review._id, status: 'published' },
    query,
    displayComment,
    undefined,
    { createdAt: -1, _id: -1 },
    (read) => read.populate(authorPublic),
  );
}
async function notice(row, target, account, type, key, session) {
  const receiver = await User.findOne({
    _id: row.author,
    status: 'active',
    emailVerifiedAt: { $type: 'date' },
  })
    .select('publicId')
    .session(session)
    .lean();
  if (!receiver || receiver.publicId === account) return undefined;
  const result = await Notice.updateOne(
    { key },
    {
      $setOnInsert: {
        owner: receiver.publicId,
        key,
        type,
        path: reviewTargetPath(target.targetType, target.slug),
      },
    },
    { upsert: true, session },
  );
  return result.upsertedCount ? receiver.publicId : undefined;
}
export function interact(params, account, input, action) {
  return mongoose.connection.transaction(async (session) => {
    const target = await resolveTarget(params, session, true);
    const row = await content(target, params.id, session);
    if (action === 'like' || action === 'unlike') {
      const key = { review: row._id, author: account._id };
      const delta =
        action === 'like'
          ? (
              await ReviewLike.updateOne(
                key,
                { $setOnInsert: key },
                {
                  session,
                  upsert: true,
                  timestamps: { createdAt: true, updatedAt: false },
                },
              )
            ).upsertedCount
          : -(await ReviewLike.deleteOne(key).session(session)).deletedCount;
      if (delta)
        await Review.updateOne(
          { _id: row._id },
          { $inc: { likeCount: delta } },
          { session, timestamps: false },
        );
      return { liked: action === 'like', likes: row.likeCount + delta };
    }
    if (action === 'comment') {
      const [reply] = await ReviewComment.create(
        [{ review: row._id, author: account._id, ...input }],
        { session },
      );
      await Review.updateOne(
        { _id: row._id },
        { $inc: { commentCount: 1 } },
        { session, timestamps: false },
      );
      const bucket = Math.floor(Date.now() / 86400000);
      const noticeOwner = await notice(
        row,
        target,
        account.publicId,
        'review_comment',
        'review:comment:' +
          row.publicId +
          ':' +
          account.publicId +
          ':' +
          bucket,
        session,
      );
      return { id: reply.publicId, noticeOwner };
    }
    const comment = await ReviewComment.findOne({
      review: row._id,
      publicId: params.comment,
      status: { $ne: 'deleted' },
    }).session(session);
    if (!comment || !own(comment, account)) throw missingItem();
    if (action === 'remove-comment') {
      await ReviewComment.updateOne(
        { _id: comment._id },
        { $set: { status: 'deleted' }, $unset: { body: 1 } },
        { session },
      );
      if (comment.status === 'published')
        await Review.updateOne(
          { _id: row._id },
          { $inc: { commentCount: -1 } },
          { session, timestamps: false },
        );
    } else {
      if (comment.status !== 'published') throw hidden();
      comment.set({ ...input, editedAt: new Date() });
      await comment.save({ session });
    }
    return { id: comment.publicId };
  });
}
export function submitReport(params, account, input) {
  return mongoose.connection.transaction(async (session) => {
    const target = await resolveTarget(params, session, true);
    const row = await content(target, params.id, session);
    const subject = params.comment
      ? await ReviewComment.findOne({
          review: row._id,
          publicId: params.comment,
          status: 'published',
        }).session(session)
      : row;
    if (!subject) throw missingItem();
    if (own(subject, account))
      throw new AppError(
        400,
        'SELF_REPORT',
        'Choose someone else’s content to report.',
      );
    const key = {
      subjectType: params.comment ? 'comment' : 'review',
      subject: subject._id,
      reporter: account._id,
    };
    const result = await ReviewReport.updateOne(
      key,
      { $setOnInsert: { ...key, review: row._id, ...input } },
      {
        session,
        upsert: true,
        timestamps: { createdAt: true, updatedAt: false },
      },
    );
    return { filed: true, duplicate: result.upsertedCount === 0 };
  });
}
const targetFilter = (type, row) =>
  type === 'movie'
    ? { model: 'Movie', id: row.target }
    : { model: 'Film', id: row.target };
export async function listReports(res, query) {
  const { page, limit, status, type } = query;
  const where = { status, ...(type && { subjectType: type }) };
  const [rows, total] = await Promise.all([
    ReviewReport.find(where)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('review')
      .lean(),
    ReviewReport.countDocuments(where),
  ]);
  const comments = new Map(
    (
      await ReviewComment.find({
        _id: {
          $in: rows
            .filter((row) => row.subjectType === 'comment')
            .map((row) => row.subject),
        },
      }).lean()
    ).map((row) => [String(row._id), row]),
  );
  return sendSuccess(
    res,
    rows.map((row) => {
      const item =
        row.subjectType === 'review'
          ? row.review
          : comments.get(String(row.subject));
      return {
        id: row.publicId,
        type: row.subjectType,
        reason: row.reason,
        details: row.details,
        status: row.status,
        resolution: row.resolution,
        createdAt: row.createdAt,
        subject: item && {
          id: item.publicId,
          body: item.body,
          status: item.status,
          spoiler: item.spoiler,
          title: item.title,
        },
      };
    }),
    {
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  );
}
export function resolveReport(id, input, audit) {
  return mongoose.connection.transaction(async (session) => {
    const report = await ReviewReport.findOne({ publicId: id }).session(
      session,
    );
    if (!report) throw missingItem();
    const row = await Review.findById(report.review).session(session);
    const comment = report.subjectType === 'comment';
    const model = comment ? ReviewComment : Review;
    const subject = comment
      ? await model.findById(report.subject).session(session)
      : row;
    if (!row) throw missingItem();
    if (report.status === 'resolved' && input.action === 'dismiss')
      return { resolved: true };
    if (report.status === 'resolved' && input.action === 'hide') throw hidden();
    const to = input.action === 'hide' ? 'hidden' : 'published';
    let noticeOwner;
    if (input.action !== 'dismiss') {
      if (
        !subject ||
        subject.status === 'deleted' ||
        (input.action === 'restore' && subject.status !== 'hidden')
      )
        throw hidden();
      const from = subject.status;
      if (from !== to) {
        await model.updateOne(
          { _id: subject._id },
          {
            $set: {
              status: to,
              moderatedBy: audit.actorId,
              moderatedAt: new Date(),
              moderationReason: input.reason,
            },
          },
          { session },
        );
        if (comment)
          await Review.updateOne(
            { _id: row._id },
            { $inc: { commentCount: to === 'published' ? 1 : -1 } },
            { session, timestamps: false },
          );
        const ref = targetFilter(row.targetType, row);
        const target = await mongoose
          .model(ref.model)
          .findById(ref.id)
          .select('slug')
          .session(session)
          .lean();
        if (target)
          noticeOwner = await notice(
            subject,
            { targetType: row.targetType, slug: target.slug },
            audit.actorId,
            'review_moderation',
            'review:moderation:' + report.publicId + ':' + to,
            session,
          );
        await recordAudit(
          session,
          audit,
          'review.' + input.action,
          report.subjectType === 'review' ? 'review' : 'review-comment',
          subject.publicId,
          { field: 'review', from, to, reason: input.reason },
        );
      }
    }
    report.set({
      status: 'resolved',
      resolvedBy: audit.actorId,
      resolvedAt: new Date(),
      resolution: input.action,
    });
    await report.save({ session });
    await recordAudit(
      session,
      audit,
      'review.report_resolve',
      'review-report',
      report.publicId,
      { field: 'report-status', to: input.action, reason: input.reason },
    );
    return { resolved: true, noticeOwner };
  });
}
