import mongoose from 'mongoose';
import { reviewTargetPath } from '../../../../shared/reviews.js';
import { AppError } from '../../utils/app-error.js';
import { searchPattern, sendList } from '../../utils/list.js';
import { sendSuccess } from '../../utils/responses.js';
import { AuditLog, recordAudit } from '../admin/audit.js';
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
import { resolveTarget, targetKey, writeRating } from './ratings.js';

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
const destination = (row) =>
  row.titleRecord?.slug
    ? {
        type: row.targetType,
        slug: row.titleRecord.slug,
        title: row.titleRecord.title,
        path: reviewTargetPath(row.targetType, row.titleRecord.slug),
      }
    : null;
const excerpt = (row) => ({
  ...row,
  title: row.spoiler ? undefined : row.title,
  body: row.spoiler ? undefined : row.body?.slice(0, 360),
});
const conceal = (row) =>
  row.spoiler ? { ...row, body: undefined, title: undefined } : row;
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
export function publicTargetStages(now) {
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
  return [
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
  ];
}
const publicTarget = { 'titleRecord.slug': { $type: 'string' } };
const reviewOrder = (sort) =>
  sort === 'liked'
    ? { likeCount: -1, createdAt: -1, _id: -1 }
    : { createdAt: -1, _id: -1 };
export async function trendingReviews(
  {
    page,
    limit,
    sort = 'trending',
    type,
    rating,
    summary = false,
    preferredIds = [],
  },
  now = new Date(),
) {
  const [result] = await Review.aggregate([
    { $match: { status: 'published', ...(type && { targetType: type }) } },
    ...publicTargetStages(now),
    { $match: publicTarget },
    ...(rating ? ratingFilter(rating * 2) : []),
    ...(preferredIds.length
      ? [
          {
            $set: { preferred: { $indexOfArray: [preferredIds, '$publicId'] } },
          },
          {
            $set: {
              preferred: {
                $cond: [
                  { $lt: ['$preferred', 0] },
                  preferredIds.length,
                  '$preferred',
                ],
              },
            },
          },
        ]
      : []),
    ...(sort === 'trending'
      ? rankReview(now)
      : [
          {
            $sort: {
              ...(preferredIds.length && { preferred: 1 }),
              ...reviewOrder(sort),
            },
          },
        ]),
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
              ...(summary ? excerpt(row) : row),
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
  const { page, limit, sort, rating, summary } = query;
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
  return sendSuccess(
    res,
    (await decorate(rows, target)).map((row) => (summary ? excerpt(row) : row)),
    {
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  );
}
export function writeReview(params, account, input, action) {
  return mongoose.connection
    .transaction(async (session) => {
      const { rating, ...review } = input ?? {};
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
        if (rating !== undefined)
          await writeRating(target, account, rating, session);
        const [row] = await Review.create([{ ...key, ...review }], { session });
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
export async function deleteOwnedReview(id, account) {
  const result = await Review.updateOne(
    { publicId: id, author: account._id, status: { $ne: 'deleted' } },
    { $set: { status: 'deleted' }, $unset: { body: 1, title: 1 } },
  );
  if (!result.modifiedCount) throw missingItem();
  return { deleted: true };
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
async function notice(row, account, type, key, session) {
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
        path:
          type === 'review_comment'
            ? '/reviews/' + row.publicId
            : '/account/reviews',
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
        reviewId: row.review?.publicId,
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
    const subject = comment
      ? await ReviewComment.findById(report.subject).session(session)
      : row;
    if (!row) throw missingItem();
    if (report.status === 'resolved' && input.action === 'dismiss')
      return { resolved: true };
    if (report.status === 'resolved' && input.action === 'hide') throw hidden();
    let noticeOwner;
    if (input.action !== 'dismiss') {
      noticeOwner = await changeVisibility(
        row,
        subject,
        comment,
        input,
        audit,
        session,
      );
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

async function changeVisibility(row, subject, comment, input, audit, session) {
  if (!subject || subject.status === 'deleted') throw missingItem();
  const to = input.action === 'hide' ? 'hidden' : 'published';
  const from = subject.status;
  if (from === to) return undefined;
  const model = comment ? ReviewComment : Review;
  const moderatedAt = new Date();
  await model.updateOne(
    { _id: subject._id },
    {
      $set: {
        status: to,
        moderatedBy: audit.actorId,
        moderatedAt,
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
  await recordAudit(
    session,
    audit,
    'review.' + input.action,
    comment ? 'review-comment' : 'review',
    subject.publicId,
    { field: 'review', from, to, reason: input.reason },
  );
  return notice(
    subject,
    audit.actorId,
    'review_moderation',
    'review:moderation:' + subject.publicId + ':' + audit.requestId,
    session,
  );
}
export function moderateReview({ id, comment }, input, audit) {
  return mongoose.connection.transaction(async (session) => {
    const row = await Review.findOne({ publicId: id }).session(session);
    if (!row || row.status === 'deleted') throw missingItem();
    const subject = comment
      ? await ReviewComment.findOne({
          review: row._id,
          publicId: comment,
        }).session(session)
      : row;
    return {
      noticeOwner: await changeVisibility(
        row,
        subject,
        Boolean(comment),
        input,
        audit,
        session,
      ),
      status: input.action === 'hide' ? 'hidden' : 'published',
    };
  });
}
export async function reviewPermalink(id, reveal = false) {
  const [row] = await Review.aggregate([
    { $match: { publicId: id, status: 'published' } },
    ...publicTargetStages(new Date()),
    { $match: publicTarget },
  ]);
  if (!row) throw missingItem();
  await Review.populate(row, authorPublic);
  const [view] = await decorate([row], row);
  return { ...(reveal ? view : conceal(view)), target: destination(row) };
}
export async function likedReviews(ids, account) {
  const visible = await Review.aggregate([
    { $match: { publicId: { $in: ids }, status: 'published' } },
    ...publicTargetStages(new Date()),
    { $match: publicTarget },
    { $project: { publicId: 1 } },
  ]);
  const likes = await ReviewLike.distinct('review', {
    author: account._id,
    review: { $in: visible.map((row) => row._id) },
  });
  const byId = new Set(likes.map(String));
  return visible
    .filter((row) => byId.has(String(row._id)))
    .map((row) => row.publicId);
}
export async function reviewHistory(res, query, account) {
  const { page, limit, kind } = query;
  const ratings = kind === 'ratings';
  const model = ratings ? Rating : Review;
  const [result] = await model.aggregate([
    {
      $match: {
        author: account._id,
        ...(!ratings && { status: { $ne: 'deleted' } }),
      },
    },
    { $sort: { updatedAt: -1, _id: -1 } },
    {
      $facet: {
        records: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          ...publicTargetStages(new Date()),
        ],
        totals: [{ $count: 'total' }],
      },
    },
  ]);
  const rows = result?.records ?? [];
  const total = result?.totals[0]?.total ?? 0;
  return sendSuccess(
    res,
    rows.map((row) => ({
      id: ratings ? String(row._id) : row.publicId,
      target: destination(row),
      type: row.targetType,
      updatedAt: row.updatedAt,
      ...(ratings
        ? { rating: row.units / 2, restricted: Boolean(row.excludedAt) }
        : {
            title: row.title,
            body: row.body,
            spoiler: row.spoiler,
            status: row.status,
          }),
    })),
    {
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  );
}
function managedReview(row) {
  return {
    id: row.publicId,
    title: row.title,
    body: row.body,
    spoiler: row.spoiler,
    status: row.status,
    target: destination(row),
    type: row.targetType,
    author: authors(row),
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    moderationReason: row.moderationReason,
    likes: row.likeCount,
    comments: row.commentCount,
  };
}
export async function managedReviews(
  res,
  { page, limit, status, type, spoiler, q },
) {
  const filter = {
    ...(status ? { status } : { status: { $ne: 'deleted' } }),
    ...(type && { targetType: type }),
    ...(spoiler !== undefined && { spoiler: spoiler === 'true' }),
  };
  const patterns = q
    ? [
        {
          $match: {
            $or: [
              { title: searchPattern(q) },
              { body: searchPattern(q) },
              { 'titleRecord.title': searchPattern(q) },
            ],
          },
        },
      ]
    : [];
  const [result, totalReviews, openReports] = await Promise.all([
    Review.aggregate([
      { $match: filter },
      ...publicTargetStages(new Date()),
      ...patterns,
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          records: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totals: [{ $count: 'total' }],
        },
      },
    ]),
    Review.countDocuments({ status: { $ne: 'deleted' } }),
    ReviewReport.countDocuments({ status: 'open' }),
  ]);
  const rows = result[0]?.records ?? [];
  const total = result[0]?.totals[0]?.total ?? 0;
  await Review.populate(rows, authorPublic);
  return sendSuccess(
    res,
    { rows: rows.map(managedReview), totalReviews, openReports },
    {
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  );
}
export async function managedReviewDetail(id, { page, limit }) {
  const [row] = await Review.aggregate([
    { $match: { publicId: id } },
    ...publicTargetStages(new Date()),
  ]);
  if (!row) throw missingItem();
  await Review.populate(row, authorPublic);
  const filter = { review: row._id };
  const [comments, total, reports] = await Promise.all([
    ReviewComment.find(filter)
      .select('+moderationReason')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(authorPublic)
      .lean(),
    ReviewComment.countDocuments(filter),
    ReviewReport.countDocuments({ ...filter, status: 'open' }),
  ]);
  return {
    review: managedReview(row),
    comments: comments.map((comment) => ({
      ...displayComment(comment),
      status: comment.status,
      moderationReason: comment.moderationReason,
    })),
    openReports: reports,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
export async function reviewAudit(res, id, query) {
  const row = await Review.findOne({ publicId: id }).select('_id').lean();
  if (!row) throw missingItem();
  const commentIds = await ReviewComment.distinct('publicId', {
    review: row._id,
  });
  const reportIds = await ReviewReport.distinct('publicId', {
    review: row._id,
  });
  return sendList(
    res,
    AuditLog,
    {
      $or: [
        { targetType: 'review', targetId: id },
        { targetType: 'review-comment', targetId: { $in: commentIds } },
        { targetType: 'review-report', targetId: { $in: reportIds } },
      ],
    },
    query,
    (x) => ({
      id: String(x._id),
      action: x.action,
      summary: x.summary,
      createdAt: x.createdAt,
    }),
    'action summary createdAt',
  );
}
