import { saveTypes } from '../../../../shared/personal.js';
import { Review, Rating } from '../reviews/models.js';
import { Reminder } from '../live/reminders.js';
import { LiveEvent } from '../live/models.js';
import { discover, sourceFilter } from '../site/discovery.js';
import { allowedSource } from '../site/homepage.js';
import { readConfig } from '../site/service.js';
import { Notice } from '../operations/support-models.js';
import { cardsFor, contentByTalent, contentKey, models } from './catalog.js';
import { Following, Playback, Watchlist } from './models.js';
import {
  followingList,
  historyList,
  preferences,
  savedList,
} from './library.js';
import { readPersonalConfig } from './preferences.js';

export async function followedContent(owner, settings, limit = 8) {
  const follows = await Following.find({ owner })
    .sort({ createdAt: -1, _id: -1 })
    .limit(40)
    .select('talent')
    .lean();
  const profiles = await models.talent
    .find({
      status: 'published',
      publicId: { $in: follows.map((row) => row.talent) },
    })
    .select('_id')
    .lean();
  const rows = await contentByTalent(
    profiles.map((row) => row._id),
    { settings, since: new Date(Date.now() - 45 * 86400000) },
  );
  return [...(await cardsFor(rows.slice(0, limit), { settings })).values()];
}

export async function upcomingReminders(owner, settings, limit = 8) {
  const now = new Date();
  const filter = await sourceFilter('live', { now, mode: 'upcoming' });
  const rows = await Reminder.aggregate([
    {
      $match: {
        user: owner,
        state: {
          $in: ['pending', 'claimed', 'sending', 'sent', 'failed', 'uncertain'],
        },
      },
    },
    {
      $lookup: {
        from: LiveEvent.collection.name,
        localField: 'event',
        foreignField: '_id',
        pipeline: [
          { $match: { ...filter, remindersEnabled: true } },
          { $project: { publicId: 1, startAt: 1, scheduleVersion: 1 } },
        ],
        as: 'event',
      },
    },
    { $unwind: '$event' },
    { $match: { $expr: { $eq: ['$version', '$event.scheduleVersion'] } } },
    { $sort: { 'event.startAt': 1, _id: 1 } },
    { $limit: limit },
    { $project: { target: '$event.publicId', state: 1 } },
  ]);
  const refs = rows.map((row) => ({ ...row, module: 'live' }));
  const map = await cardsFor(refs, { settings, now });
  return refs.flatMap((row) =>
    map.has(contentKey(row))
      ? [{ ...map.get(contentKey(row)), reminderState: row.state }]
      : [],
  );
}

export async function recommendations(owner, pref, settings, following) {
  const options = readPersonalConfig(settings);
  if (!options.recommendations || settings.maintenance)
    return { personalized: false, items: [] };
  const modules = saveTypes.filter((module) =>
    allowedSource(module, settings.hiddenModules),
  );
  const saved = pref.recommendations
    ? await Watchlist.find({ owner })
        .sort({ createdAt: -1 })
        .select('module target')
        .limit(24)
        .lean()
    : [];
  const watched =
    pref.recommendations && pref.history
      ? await Playback.find({ owner })
          .sort({ watchedAt: -1 })
          .select('module target completed')
          .limit(24)
          .lean()
      : [];
  const known = await cardsFor([...saved, ...watched], { settings });
  const genres = new Set(pref.recommendations ? pref.genres : []);
  for (const row of known.values())
    for (const genre of row.genres ?? []) genres.add(genre);
  const followed = new Set(
    (pref.recommendations ? following : []).map(contentKey),
  );
  const preferred = new Set(pref.recommendations ? pref.types : []);
  const exclude = new Set(
    [...saved, ...watched.filter((row) => row.completed)].map(contentKey),
  );
  const personalized = Boolean(
    pref.recommendations && (genres.size || followed.size || preferred.size),
  );
  const results = (
    await Promise.all(
      modules.map(async (module) => {
        const recent = await discover(module, { mode: 'released', limit: 12 });
        const matching =
          genres.size && ['independent', 'original', 'movies'].includes(module)
            ? await discover(module, {
                mode: 'released',
                limit: 10,
                match: { genres: { $in: [...genres] } },
              })
            : { items: [] };
        return [...matching.items, ...recent.items];
      }),
    )
  ).flat();
  const candidates = [
    ...new Map(
      [...(personalized ? following : []), ...results].map((item) => [
        contentKey(item),
        item,
      ]),
    ).values(),
  ].filter((item) => !exclude.has(contentKey(item)));
  const score = (row) =>
    (followed.has(contentKey(row)) ? 5 : 0) +
    (preferred.has(row.module) ? 4 : 0) +
    Math.min(
      3,
      (row.genres ?? []).filter((genre) => genres.has(genre)).length,
    ) *
      3;
  candidates.sort(
    (a, b) =>
      score(b) - score(a) ||
      (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) ||
      a.id.localeCompare(b.id),
  );
  const shown = new Map();
  const items = [];
  for (const row of candidates) {
    const count = shown.get(row.module) ?? 0;
    if (count >= 3) continue;
    shown.set(row.module, count + 1);
    items.push(row);
    if (items.length >= options.recommendationLimit) break;
  }
  return { personalized, items };
}

export async function personalizedHome(owner) {
  const [pref, { value: settings }] = await Promise.all([
    preferences(owner),
    readConfig('settings'),
  ]);
  const options = readPersonalConfig(settings);
  const enabled = new Set(options.sections);
  const followed =
    enabled.has('followed') || pref.recommendations
      ? await followedContent(owner, settings)
      : [];
  const [progress, watchlist, recommended, reminders] = await Promise.all([
    enabled.has('progress')
      ? historyList(owner, { limit: 8 }, { resume: true })
      : null,
    enabled.has('watchlist') ? savedList(owner, { limit: 8 }) : null,
    enabled.has('recommended')
      ? recommendations(owner, pref, settings, followed)
      : null,
    enabled.has('reminders') ? upcomingReminders(owner, settings) : [],
  ]);
  const items = {
    progress: progress?.items,
    watchlist: watchlist?.items,
    recommended: recommended?.items,
    followed,
    reminders,
  };
  return {
    position: options.position,
    personalized: recommended?.personalized ?? false,
    sections: options.sections
      .map((kind) => ({
        kind,
        items: (items[kind] ?? []).filter((row) => !row.unavailable),
      }))
      .filter((row) => row.items.length),
  };
}

export async function dashboard(user) {
  const owner = user._id;
  const [
    saved,
    watched,
    ratings,
    reviews,
    followed,
    unread,
    home,
    history,
    following,
  ] = await Promise.all([
    Watchlist.countDocuments({ owner }),
    Playback.countDocuments({ owner }),
    Rating.countDocuments({ author: owner }),
    Review.countDocuments({ author: owner, status: { $ne: 'deleted' } }),
    Following.countDocuments({ owner }),
    Notice.countDocuments({ owner: user.publicId, readAt: null }),
    personalizedHome(owner),
    historyList(owner, { limit: 5 }),
    followingList(owner, { limit: 6 }),
  ]);
  return {
    counts: { saved, watched, ratings, reviews, followed, unread },
    home,
    recent: history.items,
    following: following.items.filter((row) => !row.unavailable),
  };
}
