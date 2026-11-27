import mongoose from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { recordAudit } from '../admin/audit.js';
import { User } from '../auth/models.js';
import { Film } from '../films/models.js';
import { Movie, Rating, RatingTotals } from './models.js';
import { publicMovieFilter, ratingView } from './movies.js';

export const missingTarget = () =>
  new AppError(
    404,
    'REVIEW_TARGET_NOT_FOUND',
    'This review target is unavailable.',
  );
const unavailable = () =>
  new AppError(
    409,
    'RATING_RESTRICTED',
    'This rating is restricted. Contact support.',
  );
const modelFor = (type) => (type === 'movie' ? Movie : Film);
export async function resolveTarget(
  { type, slug },
  session = null,
  fence = false,
  publicOnly = true,
) {
  const model = modelFor(type);
  const filter = {
    slug,
    ...(type !== 'movie' && {
      classification: type === 'cinema' ? 'independent' : 'original',
    }),
  };
  if (publicOnly)
    Object.assign(
      filter,
      type === 'movie'
        ? publicMovieFilter()
        : { status: 'published', releaseAt: { $lte: new Date() } },
    );
  const lookup = fence
    ? model.findOneAndUpdate(
        filter,
        { $inc: { engagementFence: 1 } },
        { session, timestamps: false },
      )
    : model.findOne(filter).session(session);
  const row = await lookup.select('publicId slug title').lean();
  if (!row) throw missingTarget();
  return {
    targetType: type,
    target: row._id,
    slug: row.slug,
    id: row.publicId,
    title: row.title,
  };
}
export const targetKey = ({ target, targetType }) => ({ target, targetType });
export const ratingRestricted = (rating) =>
  Boolean(rating?.excludedAt || rating?.reviewHiddenAt);
export async function ratingSummary(target) {
  return ratingView(await RatingTotals.findOne(targetKey(target)).lean());
}
export async function accountRating(target, account) {
  const rating = await Rating.findOne({
    ...targetKey(target),
    author: account._id,
  }).lean();
  return {
    rating: rating && !ratingRestricted(rating) ? rating.units / 2 : null,
    restricted: ratingRestricted(rating),
    ...(await ratingSummary(target)),
  };
}
export async function updateTotals(target, before, after, session) {
  const key = targetKey(target);
  if (before === after)
    return RatingTotals.findOne(key).session(session).lean();
  let summary = await RatingTotals.findOne(key).session(session);
  if (!summary)
    summary = new RatingTotals({
      ...key,
      count: 0,
      sum: 0,
      distribution: Array(10).fill(0),
    });
  if (before) {
    summary.count--;
    summary.sum -= before;
    summary.distribution[before - 1]--;
  }
  if (after) {
    summary.count++;
    summary.sum += after;
    summary.distribution[after - 1]++;
  }
  await summary.save({ session });
  if (target.targetType === 'movie') {
    const { count, sum } = summary;
    const rank = count >= 3 ? (sum / 2 + 15) / (count + 5) : null;
    await Movie.updateOne(
      { _id: target.target },
      { $set: { ratingCount: count, ratingRank: rank } },
      { session, timestamps: false },
    );
  }
  return summary;
}
export async function writeRating(target, account, stars, session) {
  const key = { ...targetKey(target), author: account._id };
  const original = await Rating.findOne(key).session(session);
  if (ratingRestricted(original)) throw unavailable();
  const units = stars === undefined ? null : stars * 2;
  if (units)
    await Rating.updateOne(
      key,
      { $set: { units } },
      { upsert: true, session, runValidators: true },
    );
  else if (original)
    await Rating.deleteOne({ _id: original._id }).session(session);
  const summary = await updateTotals(
    target,
    original?.units ?? null,
    units,
    session,
  );
  return { rating: stars ?? null, ...ratingView(summary) };
}
export function saveRating(params, account, stars) {
  return mongoose.connection.transaction(async (session) =>
    writeRating(
      await resolveTarget(params, session, true),
      account,
      stars,
      session,
    ),
  );
}
export function deleteOwnedRating(id, account) {
  return mongoose.connection.transaction(async (session) => {
    const row = await Rating.findOne({ _id: id, author: account._id }).session(
      session,
    );
    if (!row) throw new AppError(404, 'RATING_NOT_FOUND', 'Rating not found.');
    if (ratingRestricted(row)) throw unavailable();
    await modelFor(row.targetType).updateOne(
      { _id: row.target },
      { $inc: { engagementFence: 1 } },
      { session, timestamps: false },
    );
    await Rating.deleteOne({ _id: row._id }).session(session);
    await updateTotals(row, row.units, null, session);
    return { deleted: true };
  });
}
export function moderateRating(params, input, audit) {
  return mongoose.connection.transaction(async (session) => {
    const target = await resolveTarget(params, session, true, false);
    const account = await User.findOne({ publicId: params.account })
      .select('_id')
      .session(session)
      .lean();
    const rating =
      account &&
      (await Rating.findOne({
        ...targetKey(target),
        author: account._id,
      }).session(session));
    if (!rating)
      throw new AppError(404, 'RATING_NOT_FOUND', 'Rating not found.');
    const exclude = input.action === 'exclude';
    if (Boolean(rating.excludedAt) === exclude)
      return {
        restricted: ratingRestricted(rating),
        ...ratingView(
          await RatingTotals.findOne(targetKey(target)).session(session),
        ),
      };
    const before = ratingRestricted(rating) ? null : rating.units;
    rating.excludedAt = exclude ? new Date() : undefined;
    await rating.save({ session });
    const summary = await updateTotals(
      target,
      before,
      ratingRestricted(rating) ? null : rating.units,
      session,
    );
    await recordAudit(
      session,
      audit,
      'review.rating_' + input.action,
      'rating',
      target.id,
      { field: 'rating', reason: input.reason, to: params.account },
    );
    return { restricted: ratingRestricted(rating), ...ratingView(summary) };
  });
}

export async function setReviewRatingVisibility(review, hidden, session) {
  const rating = await Rating.findOne({
    ...targetKey(review),
    author: review.author,
  }).session(session);
  if (!rating || Boolean(rating.reviewHiddenAt) === hidden) return;
  const before = ratingRestricted(rating) ? null : rating.units;
  rating.reviewHiddenAt = hidden ? new Date() : undefined;
  await rating.save({ session });
  await updateTotals(
    review,
    before,
    ratingRestricted(rating) ? null : rating.units,
    session,
  );
}
