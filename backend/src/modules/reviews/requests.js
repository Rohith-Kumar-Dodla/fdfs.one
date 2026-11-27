import mongoose from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { idParams, listInput, sendList } from '../../utils/list.js';
import { recordAudit } from '../admin/audit.js';
import { User } from '../auth/models.js';
import { Notice } from '../operations/support-models.js';
import { siteFlags } from '../site/service.js';
import { slug } from '../films/schemas.js';
import { MovieRequest, Rating, Review } from './models.js';
import {
  ratingRestricted,
  resolveTarget,
  targetKey,
  updateTotals,
} from './ratings.js';
import { pendingReviewFields } from './schemas.js';

const revision = z.number().int().nonnegative();
const requestInput = z.object({ params: idParams });
export const requestList = listInput({
  status: z
    .enum([
      'pending',
      'clarification',
      'conflict',
      'approved',
      'rejected',
      'cancelled',
    ])
    .optional(),
});
export const newRequest = z.object({ body: pendingReviewFields });
export const editRequest = requestInput.extend({
  body: pendingReviewFields.extend({ revision }),
});
export const cancelRequest = requestInput;
export const decideRequest = requestInput.extend({
  body: z.discriminatedUnion('action', [
    z.strictObject({ revision, action: z.literal('approve'), movie: slug }),
    z.strictObject({
      revision,
      action: z.enum(['reject', 'clarify']),
      message: z.string().trim().min(3).max(500),
    }),
  ]),
});

export function normalizedMovieTitle(value) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\s]+/gu, ' ')
    .trim();
}

function view(row, staff = false) {
  const {
    publicId,
    title,
    year,
    details,
    rating,
    body,
    spoiler,
    status,
    open,
    message,
    movieSlug,
    reviewId,
    __v,
    createdAt,
    updatedAt,
  } = row;
  return {
    id: publicId,
    title,
    year,
    details,
    rating,
    body,
    spoiler,
    status,
    open,
    message,
    movieSlug,
    reviewId,
    revision: __v,
    createdAt,
    updatedAt,
    ...(staff && { author: row.author?.publicId }),
  };
}

export function listMovieRequests(res, query, account) {
  return sendList(
    res,
    MovieRequest,
    {
      ...(account && { author: account._id }),
      ...(!account && query.status && { status: query.status }),
      ...(account && { status: { $nin: ['approved', 'cancelled'] } }),
    },
    query,
    (row) => view(row, !account),
    undefined,
    undefined,
    (find) => (account ? find : find.populate('author', 'publicId')),
  );
}

const missing = () =>
  new AppError(404, 'MOVIE_REQUEST_NOT_FOUND', 'Movie request not found.');
const changed = () =>
  new AppError(
    409,
    'MOVIE_REQUEST_CHANGED',
    'This movie request changed. Reload and try again.',
  );

function inputFields(input) {
  const { title, year, details, body, rating, spoiler } = input;
  const normalizedTitle = normalizedMovieTitle(title);
  if (!normalizedTitle)
    throw new AppError(400, 'MOVIE_TITLE_REQUIRED', 'Enter a movie title.');
  return {
    title,
    normalizedTitle,
    year,
    details,
    normalizedDetails: normalizedMovieTitle(details ?? ''),
    body,
    rating,
    spoiler,
  };
}

export async function saveMovieRequest(account, input, id) {
  const fields = inputFields(input);
  try {
    if (!id)
      return view(
        await MovieRequest.create({ ...fields, author: account._id }),
      );
    const row = await MovieRequest.findOne({
      publicId: id,
      author: account._id,
    });
    if (!row) throw missing();
    if (!row.open || row.__v !== input.revision) throw changed();
    row.set({
      ...fields,
      status: 'pending',
      message: undefined,
      movieSlug: undefined,
    });
    await row.save();
    return view(row);
  } catch (error) {
    if (error.name === 'VersionError') throw changed();
    if (error.code === 11000)
      throw new AppError(
        409,
        'DUPLICATE_MOVIE_REQUEST',
        'You already have a pending review for this movie. Edit it in My Reviews.',
      );
    throw error;
  }
}

export async function withdrawMovieRequest(account, id) {
  const row = await MovieRequest.findOne({ publicId: id, author: account._id });
  if (!row) throw missing();
  if (row.status === 'cancelled') return { cancelled: true };
  if (!row.open) throw changed();
  row.set({
    status: 'cancelled',
    open: false,
    body: undefined,
    rating: undefined,
    message: undefined,
  });
  try {
    await row.save();
  } catch (error) {
    if (error.name === 'VersionError') throw changed();
    throw error;
  }
  return { cancelled: true };
}

async function associate(row, movie, session) {
  const flags = await siteFlags();
  if (flags.maintenance || !flags.communityOpen)
    throw new AppError(
      409,
      'COMMUNITY_CLOSED',
      'Community participation is currently closed.',
    );
  const account = await User.findOne({
    _id: row.author,
    status: 'active',
    emailVerifiedAt: { $type: 'date' },
  }).session(session);
  if (!account)
    throw new AppError(
      409,
      'ACCOUNT_RESTRICTED',
      'This account cannot publish a review.',
    );
  const target = await resolveTarget(
    { type: 'movie', slug: movie },
    session,
    true,
  );
  const key = { ...targetKey(target), author: row.author };
  const existing = await Review.exists({
    ...key,
    status: { $in: ['published', 'hidden'] },
  }).session(session);
  const rating = await Rating.findOne(key).session(session);
  row.movieSlug = movie;
  if (
    existing ||
    ratingRestricted(rating) ||
    (rating && rating.units !== row.rating * 2)
  ) {
    row.status = 'conflict';
    row.message =
      'You already have a review or a different rating for the selected movie. Your existing activity and this submission have been saved. You can edit this request or cancel it.';
    return;
  }
  const [review] = await Review.create(
    [{ ...key, body: row.body, spoiler: row.spoiler }],
    { session },
  );
  if (!rating) {
    const units = row.rating * 2;
    await Rating.create([{ ...key, units }], { session });
    await updateTotals(target, null, units, session);
  }
  row.reviewId = review.publicId;
  row.status = 'approved';
  row.open = false;
  row.message = undefined;
  row.body = undefined;
  row.rating = undefined;
}

export function resolveMovieRequest(id, input, audit) {
  return mongoose.connection.transaction(async (session) => {
    const row = await MovieRequest.findOne({ publicId: id }).session(session);
    if (!row) throw missing();
    const { action } = input;
    if (
      (action === 'approve' &&
        ['approved', 'conflict'].includes(row.status) &&
        row.movieSlug === input.movie) ||
      (action === 'reject' &&
        row.status === 'rejected' &&
        row.message === input.message) ||
      (action === 'clarify' &&
        row.status === 'clarification' &&
        row.message === input.message)
    )
      return view(row);
    if (!row.open || row.__v !== input.revision) throw changed();
    const before = row.status;
    if (action === 'approve') {
      await associate(row, input.movie, session);
    } else {
      row.set({
        status: action === 'reject' ? 'rejected' : 'clarification',
        message: input.message,
        open: action === 'clarify',
      });
    }
    await row.save({ session });
    await recordAudit(
      session,
      audit,
      'movie_request.' + row.status,
      'movie-request',
      id,
      {
        field: 'movie-request-status',
        from: before,
        to: row.status,
        ...(input.movie && { reason: input.movie }),
      },
    );
    const owner = await User.findById(row.author)
      .select('publicId')
      .session(session)
      .lean();
    if (owner) {
      await Notice.create(
        [
          {
            key: 'movie-request:' + id + ':' + row.__v,
            type: 'movie_request',
            owner: owner.publicId,
            path: row.reviewId
              ? '/reviews/' + row.reviewId
              : '/account/reviews',
          },
        ],
        { session },
      );
    }
    return { ...view(row), noticeOwner: owner?.publicId };
  });
}
