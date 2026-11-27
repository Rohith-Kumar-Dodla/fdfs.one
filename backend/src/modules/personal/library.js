import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  preferenceDefaults,
  resumeMinimum,
  completionFraction,
} from '../../../../shared/personal.js';
import { AppError } from '../../utils/app-error.js';
import { Watchlist, Playback, Following, Preferences } from './models.js';
import { cardsFor, contentKey, sourcesFor, targetRecord } from './catalog.js';

export const missing = () =>
  new AppError(404, 'CONTENT_UNAVAILABLE', 'This content is unavailable.');
const changed = () =>
  new AppError(
    409,
    'PLAYBACK_CHANGED',
    'Playback changed in another session. Reopen the player to continue saving.',
  );
const disabled = () =>
  new AppError(
    403,
    'HISTORY_DISABLED',
    'Turn on playback history in your account settings to save progress.',
  );
const invalid = () =>
  new AppError(
    400,
    'INVALID_PROGRESS',
    'The playback position or duration is invalid.',
  );
const owned = (owner, { module, id }) => ({ owner, module, target: id });
const identity = (owner) => ({ _id: owner });
const sorted = (key) => ({ [key]: -1, _id: -1 });

export async function preferences(owner, session) {
  const row = await Preferences.findById(owner)
    .session(session ?? null)
    .lean();
  if (!row) return { ...preferenceDefaults, historyEpoch: 'initial' };
  const {
    recommendations,
    history,
    talentNotices,
    genres,
    types,
    historyEpoch,
  } = row;
  return {
    recommendations,
    history,
    talentNotices,
    genres,
    types,
    historyEpoch,
  };
}
export function publicPreferences({
  genres,
  types,
  recommendations,
  history,
  talentNotices,
}) {
  return { genres, types, recommendations, history, talentNotices };
}
export function updatePreferences(owner, values) {
  return mongoose.connection.transaction(async (session) => {
    const prior = await preferences(owner, session);
    const next = { ...prior, ...values };
    if (prior.history !== next.history) next.historyEpoch = randomUUID();
    await Preferences.updateOne(
      identity(owner),
      { $set: next, $inc: { serial: 1 } },
      { upsert: true, session },
    );
    return publicPreferences(next);
  });
}
export async function saveItem(owner, ref) {
  if (!(await targetRecord(ref.module, ref.id))) throw missing();
  const filter = owned(owner, ref);
  try {
    const now = new Date();
    await Watchlist.updateOne(
      filter,
      { $setOnInsert: { ...filter, createdAt: now, updatedAt: now } },
      { upsert: true, timestamps: false },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return { saved: true };
}
export async function removeItem(owner, ref) {
  await Watchlist.deleteOne(owned(owner, ref));
  return { saved: false };
}

export async function savedStatus(owner, refs) {
  const pairs = refs.map((ref) => ({ module: ref.module, target: ref.id }));
  const rows = await Watchlist.find({ owner, $or: pairs })
    .select('module target')
    .lean();
  const saved = new Set(rows.map(contentKey));
  return refs.map((ref) => ({ ...ref, saved: saved.has(contentKey(ref)) }));
}
export async function follow(owner, talent) {
  if (!(await targetRecord('talent', talent))) throw missing();
  const filter = { owner, talent };
  try {
    const now = new Date();
    await Following.updateOne(
      filter,
      { $setOnInsert: { ...filter, createdAt: now, updatedAt: now } },
      { upsert: true, timestamps: false },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return { following: true };
}
export async function unfollow(owner, talent) {
  await Following.deleteOne({ owner, talent });
  return { following: false };
}
export async function followingList(owner, query) {
  const { rows, pagination } = await pageRows(
    Following,
    { owner },
    query,
    'createdAt',
  );
  const refs = rows.map((row) => ({ module: 'talent', target: row.talent }));
  const cards = await cardsFor(refs);
  return {
    items: refs.map((ref) => cards.get(contentKey(ref)) ?? unavailable(ref)),
    pagination,
  };
}
export async function pageRows(model, filter, { page = 1, limit = 12 }, stamp) {
  const [rows, total] = await Promise.all([
    model
      .find(filter)
      .sort(sorted(stamp))
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    model.countDocuments(filter),
  ]);
  return {
    rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
const unavailable = ({ module, target }) => ({
  module,
  id: target,
  unavailable: true,
});
export async function savedList(owner, query) {
  const { rows, pagination } = await pageRows(
    Watchlist,
    { owner, ...(query.module && { module: query.module }) },
    query,
    'createdAt',
  );
  const cards = await cardsFor(rows);
  return {
    items: rows.map((row) => cards.get(contentKey(row)) ?? unavailable(row)),
    pagination,
  };
}

const playbackView = (row) =>
  row
    ? {
        position: row.position,
        duration: row.duration,
        completed: row.completed,
        dismissed: row.dismissed,
        watchedAt: row.watchedAt,
      }
    : null;
export async function progressState(owner, ref) {
  const record = await targetRecord(ref.module, ref.id, { playback: true });
  if (!record) throw missing();
  const [pref, row] = await Promise.all([
    preferences(owner),
    Playback.findOne(owned(owner, ref)).lean(),
  ]);
  return {
    enabled: pref.history,
    epoch: pref.historyEpoch,
    revision: row?.revision ?? 0,
    source: record.source,
    progress:
      pref.history && record.source === row?.source ? playbackView(row) : null,
  };
}
export async function writeProgress(owner, ref, input, now = new Date()) {
  if (input.duration && input.position > input.duration + 2) throw invalid();
  return mongoose.connection.transaction(async (session) => {
    const record = await targetRecord(ref.module, ref.id, {
      playback: true,
      now,
      session,
    });
    if (!record) throw missing();
    if (
      record.source !== input.source ||
      (ref.module === 'live' ? record.replay : record.mainVideo)
        ?.providerVideoId !== input.videoId
    )
      throw changed();
    // The same document serializes writes with opt-out and history deletions.
    const gate = await Preferences.updateOne(
      { _id: owner, history: true, historyEpoch: input.epoch },
      { $inc: { serial: 1 } },
      { session },
    );
    if (!gate.matchedCount) {
      if (!(await preferences(owner, session)).history) throw disabled();
      throw changed();
    }
    const filter = owned(owner, ref);
    const prior = await Playback.findOne(filter).session(session).lean();
    if ((prior?.revision ?? 0) !== input.revision) throw changed();
    const previous = prior?.source === record.source ? prior : null;
    const duration = previous?.duration ?? input.duration;
    if (duration && input.position > duration + 2) throw invalid();
    if (
      previous &&
      input.duration &&
      Math.abs(input.duration - duration) > Math.max(5, duration * 0.02)
    )
      throw invalid();
    if (
      previous &&
      now - previous.watchedAt < 4000 &&
      !input.ended &&
      !input.restart
    )
      return {
        revision: previous.revision,
        progress: playbackView(previous),
        throttled: true,
      };
    const position = duration
      ? Math.min(input.position, duration)
      : input.position;
    if (
      input.ended &&
      (position <= 0 ||
        (duration &&
          position < Math.min(duration * completionFraction, duration - 3)))
    )
      throw invalid();
    const completed =
      input.ended ||
      (Boolean(duration) && position >= duration * completionFraction);
    if (!previous && position < resumeMinimum && !completed)
      return { revision: prior?.revision ?? 0, progress: null };
    const patch = {
      source: record.source,
      position,
      duration: duration ?? null,
      revision: (prior?.revision ?? 0) + 1,
      completed,
      dismissed: false,
      watchedAt: now,
    };
    await Playback.updateOne(
      filter,
      { $set: patch },
      { session, upsert: true },
    );
    return { revision: patch.revision, progress: playbackView(patch) };
  });
}
export async function historyList(owner, query, { resume = false } = {}) {
  const pref = await preferences(owner);
  const filter = { owner, ...(query.module && { module: query.module }) };
  if (resume && !pref.history)
    return {
      items: [],
      pagination: {
        page: 1,
        limit: query.limit ?? 12,
        total: 0,
        totalPages: 0,
      },
    };
  if (resume)
    Object.assign(filter, {
      completed: false,
      dismissed: false,
      position: { $gte: resumeMinimum },
    });
  const { rows, pagination } = await pageRows(
    Playback,
    filter,
    query,
    'watchedAt',
  );
  const [cards, sources] = await Promise.all([
    cardsFor(rows),
    sourcesFor(rows),
  ]);
  const items = rows.flatMap((row) => {
    const key = contentKey(row);
    const card = cards.get(key);
    const current = card && sources.get(key) === row.source;
    if (resume && !current) return [];
    return [
      {
        ...(card ?? unavailable(row)),
        progress: current ? playbackView(row) : { watchedAt: row.watchedAt },
      },
    ];
  });
  return { items, pagination };
}
export async function editHistory(owner, ref, { dismiss = false } = {}) {
  return mongoose.connection.transaction(async (session) => {
    await Preferences.updateOne(
      identity(owner),
      { $set: { historyEpoch: randomUUID() }, $inc: { serial: 1 } },
      { upsert: true, session },
    );
    const filter = ref ? owned(owner, ref) : { owner };
    if (dismiss)
      await Playback.updateOne(
        filter,
        { $set: { dismissed: true } },
        { session },
      );
    else await Playback.deleteMany(filter, { session });
    return { updated: true };
  });
}
