import { createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  analyticsDefaults,
  deviceCategories,
  presenceModules,
} from '../../../../shared/operations.js';
import { eventUtcTime } from '../../../../shared/live.js';
import { AppError } from '../../utils/app-error.js';
import { User, Session } from '../auth/models.js';
import { Movie, Review } from '../reviews/models.js';
import { publicMovieFilter } from '../reviews/movies.js';
import { Film } from '../films/models.js';
import { slug } from '../films/schemas.js';
import { LiveEvent } from '../live/models.js';
import { visibility } from '../live/events.js';
import { PodcastEpisode } from '../podcasts/models.js';
import { findShow } from '../podcasts/read.js';
import { Personality } from '../talent/models.js';

const config = { bufferCommands: false, versionKey: false };
const ttl = (schema, field = 'expiresAt') =>
  schema.index({ [field]: 1 }, { expireAfterSeconds: 0 });
const raw = new mongoose.Schema(
  {
    _id: String,
    day: String,
    timezone: String,
    kind: String,
    module: String,
    device: String,
    content: String,
    at: Date,
    expiresAt: Date,
  },
  config,
);
const daily = new mongoose.Schema(
  {
    _id: String,
    day: String,
    timezone: String,
    kind: String,
    module: String,
    device: String,
    content: String,
    count: Number,
    updatedAt: Date,
    expiresAt: Date,
  },
  config,
);
const activeDay = new mongoose.Schema(
  { _id: String, day: String, timezone: String, user: String, expiresAt: Date },
  config,
);
const metadata = new mongoose.Schema(
  { _id: String, firstAt: Date, lastAt: Date },
  config,
);
for (const schema of [raw, daily, activeDay]) ttl(schema);
daily.index({ timezone: 1, day: 1 });
activeDay.index({ timezone: 1, day: 1, user: 1 });
export const AnalyticsEvent = mongoose.model('AnalyticsEvent', raw);
export const AnalyticsDaily = mongoose.model('AnalyticsDaily', daily);
export const AnalyticsActiveDay = mongoose.model(
  'AnalyticsActiveDay',
  activeDay,
);
export const AnalyticsClock = mongoose.model('AnalyticsClock', metadata);
export const analyticsModels = [
  AnalyticsEvent,
  AnalyticsDaily,
  AnalyticsActiveDay,
  AnalyticsClock,
];
const dayMs = 86400000;
const isoDay = (date) => date.toISOString().slice(0, 10);
export const calendarDay = (date, timezone) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return [p.year, p.month, p.day].join('-');
};
const offsetDay = (day, offset) =>
  isoDay(new Date(Date.parse(day) + offset * dayMs));
export const analyticsInput = z.object({
  body: z
    .strictObject({
      id: z.uuid(),
      kind: z.enum(['page', 'playback']),
      module: z.enum(presenceModules),
      device: z.enum(deviceCategories),
      content: slug.optional(),
    })
    .refine((value) => value.kind !== 'playback' || Boolean(value.content)),
});
export const rangeInput = z.object({
  query: z
    .object({
      days: z.coerce
        .number()
        .pipe(z.literal([1, 7, 30, 90]))
        .default(30),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
    })
    .refine(
      ({ from, to }) =>
        Boolean(from) === Boolean(to) &&
        (!from ||
          (from <= to && Date.parse(to) - Date.parse(from) < 90 * dayMs)),
    ),
});

export function analyticsOptions(config = {}) {
  return {
    ...analyticsDefaults,
    ...Object.fromEntries(
      Object.entries({
        enabled: config.ANALYTICS_ENABLED,
        timezone: config.ANALYTICS_TIMEZONE,
        rawDays: config.ANALYTICS_RAW_DAYS,
        aggregateDays: config.ANALYTICS_AGGREGATE_DAYS,
      }).filter(([, value]) => value !== undefined),
    ),
  };
}

const reviewSlug = /^review-([a-f0-9-]{36})$/;
async function published(module, value, now) {
  if (module === 'reviews') {
    const match = reviewSlug.exec(value);
    if (!match) return Movie.exists({ ...publicMovieFilter(now), slug: value });
    const row = await Review.findOne({
      publicId: match[1],
      status: 'published',
    })
      .select('targetType target')
      .lean();
    if (!row) return null;
    if (row.targetType === 'movie')
      return Movie.exists({ ...publicMovieFilter(now), _id: row.target });
    return Film.exists({
      _id: row.target,
      classification: row.targetType === 'cinema' ? 'independent' : 'original',
      status: 'published',
      releaseAt: { $lte: now },
    });
  }
  const filter = { slug: value, status: 'published' };
  if (module === 'cinema' || module === 'originals')
    return Film.exists({
      ...filter,
      classification: module === 'cinema' ? 'independent' : 'original',
      releaseAt: { $lte: now },
    });
  if (module === 'live')
    return LiveEvent.exists({ ...filter, ...visibility(now) });
  if (module === 'talent') return Personality.exists(filter);
  if (module === 'podcasts') {
    const show = await findShow(true).select('_id').lean();
    return (
      show &&
      PodcastEpisode.exists({
        ...filter,
        show: show._id,
        publicationAt: { $lte: now },
        releaseAt: { $lte: now },
      })
    );
  }
  return null;
}

export async function ingest(input, user, options, secret, now = new Date()) {
  if (!options.enabled) return { collected: false };
  if (
    input.kind === 'playback' &&
    !['cinema', 'originals', 'podcasts', 'live', 'reviews'].includes(
      input.module,
    )
  )
    throw new AppError(
      400,
      'INVALID_ANALYTICS_CONTENT',
      'Unsupported playback module.',
    );
  if (
    input.module === 'reviews' &&
    input.kind === 'playback' &&
    !(await Movie.exists({
      ...publicMovieFilter(now),
      slug: input.content,
      trailerAuthorized: true,
      'trailer.providerVideoId': { $type: 'string' },
    }))
  )
    throw new AppError(
      400,
      'INVALID_ANALYTICS_CONTENT',
      'Trailer is unavailable.',
    );
  if (input.content && !(await published(input.module, input.content, now)))
    throw new AppError(
      400,
      'INVALID_ANALYTICS_CONTENT',
      'Content is unavailable.',
    );
  const day = calendarDay(now, options.timezone);
  const id = input.id;
  const expiresAt = new Date(+now + options.aggregateDays * dayMs);
  const dimensions = {
    timezone: options.timezone,
    day,
    kind: input.kind,
    module: input.module,
    device: input.device,
    content: input.content ?? '',
  };
  try {
    return await mongoose.connection.transaction(async (session) => {
      await AnalyticsEvent.create(
        [
          {
            _id: id,
            ...dimensions,
            at: now,
            expiresAt: new Date(+now + options.rawDays * dayMs),
          },
        ],
        { session },
      );
      await AnalyticsDaily.updateOne(
        { _id: Object.values(dimensions).join('|') },
        {
          $setOnInsert: { ...dimensions, expiresAt },
          $inc: { count: 1 },
          $max: { updatedAt: now },
        },
        { upsert: true, session },
      );
      if (user) {
        const pseudonym = createHmac('sha256', secret)
          .update('fdfs-analytics:' + user.publicId)
          .digest('hex');
        await AnalyticsActiveDay.updateOne(
          { _id: options.timezone + ':' + day + ':' + pseudonym },
          {
            $setOnInsert: {
              user: pseudonym,
              day,
              timezone: options.timezone,
              expiresAt,
            },
          },
          { upsert: true, session },
        );
      }
      await AnalyticsClock.updateOne(
        { _id: options.timezone },
        { $min: { firstAt: now }, $max: { lastAt: now } },
        { upsert: true, session },
      );
      return { collected: true };
    });
  } catch (error) {
    if (error.code === 11000 && (await AnalyticsEvent.exists({ _id: id })))
      return { collected: false, duplicate: true };
    throw error;
  }
}

function period(query, options, now) {
  const today = calendarDay(now, options.timezone);
  const to = query.to ?? today;
  const from = query.from ?? offsetDay(to, 1 - (query.days ?? 30));
  if (to > today)
    throw new AppError(
      400,
      'INVALID_ANALYTICS_RANGE',
      'Choose a reporting period ending today or earlier.',
    );
  return {
    today,
    from,
    to,
    start: new Date(eventUtcTime(from + 'T00:00', options.timezone)),
    end: new Date(eventUtcTime(offsetDay(to, 1) + 'T00:00', options.timezone)),
  };
}
const countByDay = (model, match, date, timezone) =>
  model.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { date, timezone, format: '%Y-%m-%d' } },
        count: { $sum: 1 },
      },
    },
  ]);

export async function historical(query, options, tickets, now = new Date()) {
  const { today, from, to, start, end } = period(query, options, now);
  const valid = {
    timezone: options.timezone,
    day: { $gte: from, $lte: to },
    expiresAt: { $gt: now },
  };
  const byDay = (items) => new Map(items.map(({ _id, count }) => [_id, count]));
  const [
    traffic,
    active,
    distinct,
    registrations,
    support,
    modules,
    devices,
    candidate,
    liveCandidate,
    clock,
  ] = await Promise.all([
    AnalyticsDaily.aggregate([
      { $match: valid },
      {
        $group: {
          _id: '$day',
          pages: { $sum: { $cond: [{ $eq: ['$kind', 'page'] }, '$count', 0] } },
          playback: {
            $sum: { $cond: [{ $eq: ['$kind', 'playback'] }, '$count', 0] },
          },
        },
      },
    ]),
    AnalyticsActiveDay.aggregate([
      { $match: valid },
      { $group: { _id: '$day', count: { $sum: 1 } } },
    ]),
    AnalyticsActiveDay.aggregate([
      { $match: valid },
      { $group: { _id: '$user' } },
      { $count: 'count' },
    ]),
    countByDay(
      User,
      { createdAt: { $gte: start, $lt: end } },
      '$createdAt',
      options.timezone,
    ),
    countByDay(
      tickets,
      { createdAt: { $gte: start, $lt: end } },
      '$createdAt',
      options.timezone,
    ),
    AnalyticsDaily.aggregate([
      { $match: { ...valid, kind: 'page' } },
      { $group: { _id: '$module', count: { $sum: '$count' } } },
      { $sort: { count: -1 } },
    ]),
    AnalyticsDaily.aggregate([
      { $match: { ...valid, kind: 'page' } },
      { $group: { _id: '$device', count: { $sum: '$count' } } },
      { $sort: { count: -1 } },
    ]),
    AnalyticsDaily.aggregate([
      { $match: { ...valid, kind: 'page', content: { $ne: '' } } },
      {
        $group: {
          _id: { module: '$module', slug: '$content' },
          count: { $sum: '$count' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 25 },
    ]),
    AnalyticsDaily.aggregate([
      {
        $match: {
          ...valid,
          kind: 'page',
          module: 'live',
          content: { $ne: '' },
        },
      },
      { $group: { _id: '$content', count: { $sum: '$count' } } },
      { $sort: { count: -1 } },
      { $limit: 25 },
    ]),
    AnalyticsClock.findById(options.timezone).lean(),
  ]);
  const first = clock?.firstAt && calendarDay(clock.firstAt, options.timezone);
  const registered = byDay(registrations),
    opened = byDay(support),
    unique = byDay(active);
  const trafficDays = new Map(traffic.map((row) => [row._id, row]));
  const rows = [];
  for (let day = from; day <= to; day = offsetDay(day, 1)) {
    const measured = trafficDays.has(day);
    rows.push({
      day,
      partial: day === today || day === first,
      registrations: registered.get(day) ?? 0,
      tickets: opened.get(day) ?? 0,
      pages: measured ? (trafficDays.get(day)?.pages ?? 0) : null,
      playback: measured ? (trafficDays.get(day)?.playback ?? 0) : null,
      active: measured ? (unique.get(day) ?? 0) : null,
    });
  }
  const popular = (
    await Promise.all(
      candidate.map(
        async ({ _id: key, count }) =>
          (await published(key.module, key.slug, now)) && { ...key, count },
      ),
    )
  )
    .filter(Boolean)
    .slice(0, 10);
  return {
    enabled: options.enabled,
    timezone: options.timezone,
    firstAt: clock?.firstAt,
    lastAt: clock?.lastAt,
    distinct: rows.some(({ active }) => active !== null)
      ? (distinct[0]?.count ?? 0)
      : null,
    rows,
    modules,
    devices,
    popular,
    liveEvents: (
      await Promise.all(
        liveCandidate.map(
          async ({ _id: slug, count }) =>
            (await published('live', slug, now)) && { slug, count },
        ),
      )
    )
      .filter(Boolean)
      .slice(0, 10),
  };
}

export async function activityTotals(options, now = new Date()) {
  const { today, start, end } = period({ days: 1 }, options, now);
  const [valid, registrations, clock, byWindow] = await Promise.all([
    Session.aggregate([
      { $match: { revokedAt: null, expiresAt: { $gt: now } } },
      {
        $lookup: {
          from: User.collection.name,
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $match: {
          'user.status': 'active',
          $expr: { $eq: ['$authVersion', '$user.authVersion'] },
        },
      },
      { $count: 'count' },
    ]),
    User.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    AnalyticsClock.findById(options.timezone).lean(),
    AnalyticsActiveDay.aggregate([
      {
        $match: {
          timezone: options.timezone,
          day: { $gte: offsetDay(today, -29), $lte: today },
          expiresAt: { $gt: now },
        },
      },
      { $group: { _id: '$user', latest: { $max: '$day' } } },
      {
        $group: {
          _id: null,
          monthly: { $sum: 1 },
          weekly: {
            $sum: {
              $cond: [{ $gte: ['$latest', offsetDay(today, -6)] }, 1, 0],
            },
          },
          daily: { $sum: { $cond: [{ $eq: ['$latest', today] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const counts = byWindow[0];
  const measured = options.enabled && clock;
  return {
    sessions: valid[0]?.count ?? 0,
    registrations,
    daily: measured ? (counts?.daily ?? 0) : null,
    weekly: measured ? (counts?.weekly ?? 0) : null,
    monthly: measured ? (counts?.monthly ?? 0) : null,
    firstAt: clock?.firstAt,
  };
}
