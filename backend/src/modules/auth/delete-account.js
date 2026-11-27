import { createHmac, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { staffRoles } from '../../../../shared/admin.js';
import { AppError } from '../../utils/app-error.js';
import { recordAudit } from '../admin/audit.js';
import { ChatMessage, ChatParticipant } from '../live/chat.js';
import { Reminder } from '../live/reminders.js';
import { MediaAsset, releaseReference } from '../media/assets.js';
import { AnalyticsActiveDay } from '../operations/analytics.js';
import {
  GuestAccess,
  GuestChallenge,
  Notice,
  SupportJob,
  Ticket,
  TicketAttachment,
  TicketMessage,
} from '../operations/support-models.js';
import {
  Following,
  Playback,
  Preferences,
  Watchlist,
} from '../personal/models.js';
import { CommentReport, EpisodeComment } from '../podcasts/comments.js';
import {
  MovieRequest,
  Rating,
  Review,
  ReviewComment,
  ReviewLike,
  ReviewReport,
} from '../reviews/models.js';
import { ratingRestricted, updateTotals } from '../reviews/ratings.js';
import { Submission } from '../submissions/workflow.js';
import { Personality } from '../talent/models.js';
import { duringAccountDeletion } from './account-mutations.js';
import { Session, User } from './models.js';
import { unauthorized } from './tokens.js';

const formerMember = 'Former member';

async function removeReviews(author, session) {
  const ratings = await Rating.find({ author }).session(session).lean();
  for (const rating of ratings) {
    if (!ratingRestricted(rating))
      await updateTotals(rating, rating.units, null, session);
  }
  await Rating.deleteMany({ author }, { session });

  // Recalculate counters on surviving reviews after removing this account's interactions.
  const tally = new Map();
  for (const [model, filter, field] of [
    [ReviewLike, { author }, 'likeCount'],
    [ReviewComment, { author, status: 'published' }, 'commentCount'],
  ]) {
    const counts = await model
      .aggregate([
        { $match: filter },
        { $group: { _id: '$review', count: { $sum: 1 } } },
      ])
      .session(session);
    for (const { _id, count } of counts) {
      const key = String(_id);
      const changes = tally.get(key) ?? { _id, fields: {} };
      changes.fields[field] = {
        $max: [0, { $subtract: [{ $ifNull: ['$' + field, 0] }, count] }],
      };
      tally.set(key, changes);
    }
  }
  for (const { _id, fields } of tally.values()) {
    await Review.updateOne({ _id }, [{ $set: fields }], {
      session,
      timestamps: false,
      updatePipeline: true,
    });
  }
  await ReviewLike.deleteMany({ author }, { session });
  await ReviewComment.updateMany(
    { author },
    { $set: { status: 'deleted' }, $unset: { body: 1, spoiler: 1 } },
    { session },
  );
  await Review.updateMany(
    { author },
    { $set: { status: 'deleted' }, $unset: { body: 1, title: 1, spoiler: 1 } },
    { session },
  );
  await MovieRequest.deleteMany({ author }, { session });
}

async function removeSupport(owner, email, session) {
  const related = { $or: [{ owner }, { guestEmail: email }] };
  const tickets = await Ticket.find(related)
    .select('publicId category')
    .session(session)
    .lean();
  const ticketIds = tickets.map(({ publicId }) => publicId);
  const privateIds = tickets
    .filter(({ category }) => category !== 'copyright')
    .map(({ publicId }) => publicId);
  const challengeFilter = { $or: [{ email }, { ticket: { $in: ticketIds } }] };
  const challengeIds = await GuestChallenge.distinct(
    '_id',
    challengeFilter,
  ).session(session);
  await SupportJob.deleteMany(
    {
      $or: [
        { owner },
        { ticket: { $in: ticketIds } },
        { challenge: { $in: challengeIds } },
      ],
    },
    { session },
  );
  await GuestChallenge.deleteMany(challengeFilter, { session });
  await GuestAccess.deleteMany({ ticket: { $in: ticketIds } }, { session });
  await TicketAttachment.deleteMany(
    { ticket: { $in: privateIds } },
    { session },
  );
  await TicketMessage.deleteMany({ ticket: { $in: privateIds } }, { session });
  await Ticket.deleteMany({ publicId: { $in: privateIds } }, { session });
  await Ticket.updateMany(
    related,
    { $unset: { guestEmail: 1, creationKey: 1 } },
    { session },
  );
}

async function removeSubmissions(owner, session) {
  const unpublished = {
    owner,
    status: { $ne: 'published' },
    'publishedResource.id': { $exists: false },
    'history.to': { $ne: 'published' },
  };
  const ids = await Submission.distinct('publicId', unpublished).session(
    session,
  );
  if (ids.length) {
    const reference = {
      kind: { $in: ['talent-proposal', 'film-proposal', 'live-submission'] },
      targetId: { $in: ids },
    };
    await MediaAsset.updateMany(
      { references: { $elemMatch: reference } },
      { $pull: { references: reference } },
      { session },
    );
    await Submission.deleteMany(unpublished, { session });
  }
}

export function deleteAccount(account, password, { accessSecret }, requestId) {
  return duringAccountDeletion(account.publicId, () =>
    mongoose.connection.transaction(async (session) => {
      const user = await User.findById(account._id)
        .select('+passwordHash +authVersion +superSeed +bootstrapAdmin')
        .session(session);
      if (
        !user ||
        user.status !== 'active' ||
        user.authVersion !== account.authVersion
      )
        throw unauthorized();
      if (
        user.superSeed ||
        user.bootstrapAdmin ||
        user.roles.some((role) => staffRoles.includes(role))
      )
        throw new AppError(
          403,
          'ACCOUNT_DELETION_PROTECTED',
          'Staff accounts require an administrative process.',
        );
      if (
        !user.passwordHash ||
        !(await bcrypt.compare(password, user.passwordHash))
      )
        throw new AppError(
          403,
          'INCORRECT_PASSWORD',
          'Enter your current password.',
        );

      const owner = user.publicId;
      const author = user._id;
      await User.updateOne(
        { _id: author },
        {
          $set: {
            status: 'deleted',
            fullName: formerMember,
            email: `${randomUUID()}@deleted.invalid`,
            roles: [],
            cmsModules: [],
          },
          $unset: {
            passwordHash: 1,
            policyVersion: 1,
            emailVerifiedAt: 1,
            profileImage: 1,
            bio: 1,
            preferences: 1,
            verification: 1,
            passwordReset: 1,
            welcomePresentedAt: 1,
            welcomeAcknowledgedAt: 1,
          },
          $inc: { authVersion: 1 },
        },
        { session },
      );

      for (const [model, filter] of [
        [Session, { userId: author }],
        [Watchlist, { owner: author }],
        [Playback, { owner: author }],
        [Following, { owner: author }],
        [Preferences, { _id: author }],
        [Reminder, { user: author }],
        [ChatParticipant, { user: author }],
        [Notice, { owner }],
      ]) {
        await model.deleteMany(filter, { session });
      }
      await Personality.updateMany(
        { associatedUser: author },
        { $unset: { associatedUser: 1 } },
        { session },
      );
      await EpisodeComment.updateMany(
        { author },
        { $set: { status: 'deleted' }, $unset: { text: 1 } },
        { session },
      );
      await ChatMessage.updateMany(
        { author },
        {
          $set: { name: formerMember, hiddenAt: new Date() },
          $unset: { text: 1 },
        },
        { session },
      );
      for (const model of [ReviewReport, CommentReport])
        await model.updateMany(
          { reporter: author },
          { $unset: { details: 1 } },
          { session },
        );

      await removeReviews(author, session);
      await removeSupport(owner, user.email, session);
      await removeSubmissions(owner, session);
      const pseudonym = createHmac('sha256', accessSecret)
        .update('fdfs-analytics:' + owner)
        .digest('hex');
      await AnalyticsActiveDay.deleteMany({ user: pseudonym }, { session });
      if (user.profileImage)
        await releaseReference(
          user.profileImage,
          { kind: 'user-avatar', targetId: owner },
          session,
        );
      const unreferenced = {
        owner,
        purpose: { $ne: 'library' },
        status: 'active',
        'references.0': { $exists: false },
      };
      const assets = await MediaAsset.distinct('_id', unreferenced).session(
        session,
      );
      await MediaAsset.updateMany(
        unreferenced,
        { $set: { status: 'deleting' } },
        { session },
      );
      await recordAudit(
        session,
        { actorId: owner, requestId },
        'user.self_deleted',
        'user',
        owner,
        {
          field: 'account-status',
          from: 'active',
          to: 'deleted',
        },
      );
      return assets;
    }),
  );
}
