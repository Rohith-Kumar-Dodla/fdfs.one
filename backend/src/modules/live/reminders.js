import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { User } from '../auth/models.js';
import { LiveEvent } from './models.js';

const reminderSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LiveEvent',
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    version: { type: Number, required: true },
    dueAt: { type: Date, required: true },
    state: {
      type: String,
      enum: [
        'pending',
        'claimed',
        'sending',
        'sent',
        'paused',
        'cancelled',
        'failed',
        'uncertain',
      ],
      required: true,
    },
    attempts: { type: Number, default: 0 },
    claim: String,
    leaseUntil: Date,
    sentAt: Date,
    sentVersion: Number,
    uncertainVersion: Number,
  },
  { timestamps: true, bufferCommands: false },
);
reminderSchema.index({ event: 1, user: 1 }, { unique: true });
reminderSchema.index({ state: 1, dueAt: 1 });
reminderSchema.index({ state: 1, leaseUntil: 1 });
export const Reminder = mongoose.model('LiveReminder', reminderSchema);
const dueFor = (event, minutes) =>
  new Date(event.startAt.getTime() - minutes * 60000);
const eligible = (event, now) =>
  event &&
  event.status === 'published' &&
  event.moderation === 'approved' &&
  event.broadcast === 'scheduled' &&
  event.remindersEnabled &&
  event.startAt > now;

export async function replanReminders(event, minutes, session) {
  const ready = eligible(event, new Date());
  if (!ready) {
    await Reminder.updateMany(
      { event: event._id, state: { $in: ['pending', 'claimed'] } },
      { $set: { state: 'paused' }, $unset: { claim: 1, leaseUntil: 1 } },
      { session },
    );
    return;
  }
  const next = { state: 'pending', dueAt: dueFor(event, minutes), attempts: 0 };
  await Reminder.updateMany(
    {
      event: event._id,
      version: { $ne: event.scheduleVersion },
      state: { $ne: 'cancelled' },
    },
    {
      $set: { ...next, version: event.scheduleVersion },
      $unset: { claim: 1, leaseUntil: 1 },
    },
    { session },
  );
  await Reminder.updateMany(
    { event: event._id, version: event.scheduleVersion, state: 'paused' },
    { $set: next, $unset: { claim: 1, leaseUntil: 1 } },
    { session },
  );
}

export async function reminderState(event, user) {
  const row = await Reminder.findOne({ event: event._id, user: user._id })
    .select('state')
    .lean();
  return {
    subscribed: Boolean(row && row.state !== 'cancelled'),
    state: row?.state ?? 'none',
  };
}

export async function subscribe(event, user, minutes) {
  await mongoose.connection.transaction(async (session) => {
    const current = await LiveEvent.findById(event._id).session(session);
    if (!eligible(current, new Date()))
      throw new AppError(
        409,
        'REMINDER_UNAVAILABLE',
        'Reminders are unavailable for this event.',
      );
    // A subscription and a schedule change must observe the same event revision.
    await LiveEvent.updateOne(
      { _id: current._id },
      { $inc: { reminderSequence: 1 } },
      { session, timestamps: false },
    );
    const filter = { event: current._id, user: user._id };
    const row = await Reminder.findOne(filter).session(session);
    if (row && row.state !== 'cancelled') return;
    if (
      row?.claim &&
      row.version === current.scheduleVersion &&
      row.leaseUntil > new Date()
    ) {
      throw new AppError(
        409,
        'REMINDER_IN_PROGRESS',
        'A reminder is being processed. Try again shortly.',
      );
    }
    const sameVersion = row?.version === current.scheduleVersion;
    const state =
      row?.sentVersion === current.scheduleVersion
        ? 'sent'
        : sameVersion &&
            (row.claim || row.uncertainVersion === current.scheduleVersion)
          ? 'uncertain'
          : 'pending';
    const next = {
      version: current.scheduleVersion,
      dueAt: dueFor(current, minutes),
      state,
      attempts: 0,
    };
    await Reminder.updateOne(
      filter,
      {
        $set: {
          ...next,
          ...(state === 'uncertain' && {
            uncertainVersion: current.scheduleVersion,
          }),
        },
        $unset: { claim: 1, leaseUntil: 1 },
      },
      { session, upsert: true },
    );
  });
  return reminderState(event, user);
}

export async function unsubscribe(event, user) {
  // Preserve the lease only while an SMTP outcome might still be outstanding.
  const preserve = (field) => ({
    $cond: [
      { $in: ['$state', ['sending', 'cancelled']] },
      '$' + field,
      '$$REMOVE',
    ],
  });
  await Reminder.updateOne(
    { event: event._id, user: user._id },
    [
      {
        $set: {
          state: 'cancelled',
          claim: preserve('claim'),
          leaseUntil: preserve('leaseUntil'),
        },
      },
    ],
    { updatePipeline: true },
  );
  return reminderState(event, user);
}

export async function processReminders(
  deliver,
  { now = new Date(), limit = 25, shouldContinue = () => true } = {},
) {
  await Reminder.updateMany(
    { state: 'sending', leaseUntil: { $lte: now } },
    [
      { $set: { state: 'uncertain', uncertainVersion: '$version' } },
      { $unset: ['claim', 'leaseUntil'] },
    ],
    { updatePipeline: true },
  );
  let processed = 0;
  while (processed < limit && shouldContinue()) {
    const claim = randomUUID();
    const job = await Reminder.findOneAndUpdate(
      {
        dueAt: { $lte: now },
        $or: [
          { state: 'pending' },
          { state: 'claimed', leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          state: 'claimed',
          claim,
          leaseUntil: new Date(Math.max(Date.now(), now.getTime()) + 60000),
        },
      },
      { sort: { dueAt: 1 }, returnDocument: 'after' },
    );
    if (!job) break;
    processed++;
    const [event, user] = await Promise.all([
      LiveEvent.findById(job.event)
        .select(
          'slug title startAt timeZone status moderation broadcast remindersEnabled scheduleVersion',
        )
        .lean(),
      User.findOne({
        _id: job.user,
        status: 'active',
        emailVerifiedAt: { $type: 'date' },
      })
        .select('email')
        .lean(),
    ]);
    const owned = { _id: job._id, claim, version: job.version };
    if (
      !eligible(event, new Date(Math.max(Date.now(), now.getTime()))) ||
      event.scheduleVersion !== job.version ||
      !user
    ) {
      await Reminder.updateOne(
        { ...owned, state: 'claimed' },
        { $set: { state: 'paused' }, $unset: { claim: 1, leaseUntil: 1 } },
      );
      continue;
    }
    const armed = await Reminder.updateOne(
      { ...owned, state: 'claimed' },
      { $set: { state: 'sending' }, $inc: { attempts: 1 } },
    );
    if (!armed.modifiedCount) continue;

    let result;
    try {
      result = await deliver({
        event,
        recipient: user.email,
        deliveryId: job.id + '.' + job.version,
      });
    } catch {
      result = 'uncertain';
    }
    const settledAt = new Date(Math.max(Date.now(), now.getTime()));
    const patch =
      result === 'sent'
        ? { state: 'sent', sentAt: settledAt, sentVersion: job.version }
        : result === 'retry' && job.attempts < 2
          ? {
              state: 'pending',
              dueAt: new Date(settledAt.getTime() + (job.attempts + 1) * 60000),
            }
          : result === 'uncertain'
            ? { state: 'uncertain', uncertainVersion: job.version }
            : { state: 'failed' };
    // An unsubscribe during SMTP still retains the accepted delivery version.
    const updated = await Reminder.updateOne(
      { ...owned, state: 'sending' },
      { $set: patch, $unset: { claim: 1, leaseUntil: 1 } },
    );
    if (!updated.matchedCount) {
      await Reminder.updateOne(
        { ...owned, state: 'cancelled' },
        {
          $set:
            result === 'sent'
              ? { sentAt: settledAt, sentVersion: job.version }
              : result === 'uncertain'
                ? { uncertainVersion: job.version }
                : {},
          $unset: { claim: 1, leaseUntil: 1 },
        },
      );
    }
  }
  return processed;
}

export function startReminderWorker({
  deliver,
  intervalMs,
  available,
  logger,
}) {
  let job;
  let stopping = false;
  const timer = setInterval(() => {
    if (job || !available()) return;
    job = processReminders(deliver, {
      shouldContinue: () => !stopping && available(),
    })
      .catch(() => logger.warn('Live reminder scan failed'))
      .finally(() => {
        job = undefined;
      });
  }, intervalMs).unref();
  return async () => {
    stopping = true;
    clearInterval(timer);
    await job;
  };
}
