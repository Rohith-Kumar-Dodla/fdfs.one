import { sources } from '../../../../shared/homepage.js';
import { filmPaths } from '../../../../shared/films.js';
import { visibility } from '../live/events.js';
import { LiveEvent } from '../live/models.js';
import { Film } from '../films/models.js';
import { findShow } from '../podcasts/read.js';
import { PodcastEpisode } from '../podcasts/models.js';
import { Movie, Review } from '../reviews/models.js';
import { publicMovieFilter } from '../reviews/movies.js';
import { publicTargetStages } from '../reviews/community.js';
import { MediaAsset, imageView } from '../media/assets.js';
import { normalizedName, Personality } from '../talent/models.js';

const models = {
  independent: Film,
  original: Film,
  podcasts: PodcastEpisode,
  live: LiveEvent,
  movies: Movie,
  talent: Personality,
  reviews: Review,
};
const mediaFields = 'publicId status url alt width height';
const summaryFields =
  'publicId slug title displayName status synopsis summary introduction releaseAt releaseDate releaseYear runtimeMinutes duration startAt broadcast remindersEnabled genres language poster banner backdrop thumbnail profileImage coverImage replayThumbnail replay.provider publishedAt ratingCount';
const fieldsByModule = {
  independent: ['poster', 'banner'],
  original: ['poster', 'banner'],
  podcasts: ['thumbnail'],
  live: ['poster', 'banner', 'replayThumbnail'],
  movies: ['poster', 'backdrop'],
  talent: ['profileImage', 'coverImage'],
};
export const refKey = (row) => row.module + '/' + row.id;
export function featureForReference(items, ref) {
  if (!ref) return;
  const item = items.get(refKey(ref));
  if (item && (!item.upcoming || ref.upcoming)) return item;
}
const titleModes = {
  independent: 'releaseAt',
  original: 'releaseAt',
  podcasts: 'releaseAt',
  live: 'startAt',
  movies: 'releaseDate',
  talent: 'publishedAt',
  reviews: 'createdAt',
};
export function discoveryImage(row) {
  if (!row?.url || (row.status && row.status !== 'active')) return undefined;
  const { id, url, variants, width, height, alt } = imageView({
    ...row,
    references: [],
  });
  return { id, url, variants, width, height, alt };
}
export async function discoveryAssets(ids, session) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await MediaAsset.find({
    publicId: { $in: unique },
    status: 'active',
    purpose: 'library',
  })
    .select(mediaFields)
    .session(session ?? null)
    .lean();
  return new Map(rows.map((row) => [row.publicId, row]));
}
function pathFor(module, slug) {
  if (module === 'movies') return '/movies/' + slug;
  return (filmPaths[module] ?? sources[module].path) + '/' + slug;
}
function feature(row, module, now) {
  const releasedAt = row.releaseAt ?? row.releaseDate;
  const upcoming =
    module === 'live'
      ? row.broadcast === 'scheduled' && row.startAt > now
      : Boolean(releasedAt > now);
  const live = module === 'live' && row.broadcast === 'live';
  return {
    id: row.publicId,
    module,
    slug: row.slug,
    title: row.title ?? row.displayName,
    path: pathFor(module, row.slug),
    summary: row.synopsis ?? row.summary ?? row.introduction,
    date: module === 'live' ? row.startAt : (releasedAt ?? row.publishedAt),
    runtime: row.runtimeMinutes,
    language: row.language,
    genres: row.genres,
    upcoming,
    live,
    reminder: module === 'live' && upcoming && row.remindersEnabled === true,
    image: discoveryImage(
      row.poster ?? row.thumbnail ?? row.profileImage ?? row.replayThumbnail,
    ),
    landscape: discoveryImage(
      row.banner ??
        row.backdrop ??
        row.coverImage ??
        row.replayThumbnail ??
        row.thumbnail,
    ),
  };
}
const reviewFeature = (row) => ({
  id: row.publicId,
  module: 'reviews',
  slug: row.publicId,
  path: '/reviews/' + row.publicId,
  title:
    !row.spoiler && row.title
      ? row.title
      : 'Review of ' + row.titleRecord.title,
  summary: row.titleRecord.title,
  date: row.createdAt,
  spoiler: row.spoiler === true,
});
export async function sourceFilter(
  module,
  { now = new Date(), mode = 'released', releaseDays, session } = {},
) {
  const filter = { status: 'published' };
  if (module === 'movies') {
    Object.assign(filter, publicMovieFilter(now));
    if (mode === 'popular') filter.ratingCount = { $gt: 0 };
    if (releaseDays)
      filter.releaseDate = {
        $gte: new Date(+now - releaseDays * 86400000),
        $lte: now,
      };
    if (mode === 'upcoming') filter.releaseDate = { $gt: now };
  }
  if (module === 'live') {
    Object.assign(filter, visibility(now));
    if (mode === 'live') filter.broadcast = 'live';
    else if (mode === 'upcoming')
      Object.assign(filter, { broadcast: 'scheduled', startAt: { $gt: now } });
    else if (mode === 'released')
      filter.$and = [
        {
          $or: [
            { broadcast: 'live' },
            { broadcast: 'ended', 'replay.provider': { $exists: true } },
          ],
        },
      ];
    else
      filter.$and = [
        {
          $or: [
            { broadcast: 'live' },
            { broadcast: 'ended', 'replay.provider': { $exists: true } },
            { broadcast: 'scheduled', startAt: { $gt: now } },
          ],
        },
      ];
  }
  if (['independent', 'original', 'podcasts'].includes(module)) {
    if (module === 'podcasts') {
      const show = await findShow(true)
        .select('_id')
        .session(session ?? null)
        .lean();
      Object.assign(filter, {
        show: show?._id ?? null,
        publicationAt: { $lte: now },
      });
    } else filter.classification = module;
    if (mode === 'upcoming')
      Object.assign(filter, { announce: true, releaseAt: { $gt: now } });
    else if (mode === 'public')
      filter.$or = [
        { releaseAt: { $lte: now } },
        { announce: true, releaseAt: { $gt: now } },
      ];
    else
      filter.releaseAt = {
        ...(releaseDays && { $gte: new Date(+now - releaseDays * 86400000) }),
        $lte: now,
      };
  }
  return filter;
}
const words = (value) =>
  normalizedName(value).split(' ').filter(Boolean).slice(0, 6);
function indexedPrefix(text) {
  return {
    $elemMatch: {
      $gte: text,
      $lt: text + '\uffff',
      $regex: '^' + RegExp.escape(text),
    },
  };
}
export function prefixTitle(q) {
  const clean = q.trim().normalize('NFKC');
  const choices = [
    ...new Set([
      clean,
      clean.toLowerCase(),
      clean.toUpperCase(),
      clean
        .toLowerCase()
        .replace(/(^|\s)\p{L}/gu, (value) => value.toUpperCase()),
    ]),
  ];
  return {
    $or: choices.map((part) => ({
      title: { $gte: part, $lt: part + '\uffff' },
    })),
  };
}
export async function discover(
  module,
  {
    now = new Date(),
    mode = 'released',
    releaseDays,
    ids,
    q,
    genre,
    limit = 8,
    page = 1,
    session,
    withCount = false,
    hiddenModules = [],
    exclude = [],
    match = {},
  } = {},
) {
  const model = models[module];
  if (!model) return { items: [], count: 0 };
  const filter = await sourceFilter(module, {
    now,
    mode,
    releaseDays,
    session,
  });
  Object.assign(filter, match);
  if (ids || exclude.length)
    filter.publicId = {
      ...(ids && { $in: ids }),
      ...(exclude.length && { $nin: exclude }),
    };
  if (genre) filter.genres = genre;
  const titleField = module === 'talent' ? 'displayName' : 'title';
  if (q) {
    const parts = words(q);
    // Limit search predicates to exact indexed word prefixes or bounded lexical title ranges.
    if (module === 'live' || module === 'reviews')
      filter.$and = [...(filter.$and ?? []), prefixTitle(q)];
    else if (module === 'talent')
      filter.searchNames = indexedPrefix(normalizedName(q));
    else if (module === 'movies') filter.titlePrefixes = { $all: parts };
    else filter.titlePrefixes = indexedPrefix(normalizedName(q));
    if (module === 'reviews') filter.spoiler = false;
  }
  const date = titleModes[module];
  const sort =
    mode === 'popular'
      ? { ratingCount: -1, _id: -1 }
      : q
        ? { [titleField]: 1, _id: 1 }
        : {
            [date]: mode === 'upcoming' ? 1 : -1,
            _id: mode === 'upcoming' ? 1 : -1,
          };
  if (module === 'reviews') {
    const [data] = await Review.aggregate([
      { $match: filter },
      ...publicTargetStages(now),
      {
        $match: {
          'titleRecord.slug': { $type: 'string' },
          targetType: {
            $nin: Object.entries({
              movie: '/reviews',
              cinema: '/cinema',
              original: '/originals',
            })
              .filter(([, path]) => hiddenModules.includes(path))
              .map(([type]) => type),
          },
        },
      },
      { $sort: sort },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                publicId: 1,
                title: 1,
                titleRecord: 1,
                spoiler: 1,
                createdAt: 1,
              },
            },
          ],
          count: withCount ? [{ $count: 'total' }] : [{ $limit: 1 }],
        },
      },
    ]).session(session ?? null);
    return {
      items: data.items.map(reviewFeature),
      count: data.count[0]?.total ?? data.items.length,
    };
  }
  const query = model
    .find(filter)
    .select(summaryFields)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .session(session ?? null);
  for (const field of fieldsByModule[module] ?? [])
    query.populate({ path: field, select: mediaFields });
  // Transactional MongoDB operations share a session and run sequentially.
  const rows = await query.lean();
  return {
    items: rows.map((row) => feature(row, module, now)),
    count: withCount
      ? await model.countDocuments(filter).session(session ?? null)
      : rows.length,
  };
}
export async function resolveFeatures(
  refs,
  { now = new Date(), session, allowUpcoming = false, hiddenModules } = {},
) {
  const groups = [...Map.groupBy(refs, (row) => row.module)];
  const read = async ([module, list]) => {
    const { items } = await discover(module, {
      mode: allowUpcoming ? 'public' : 'released',
      ids: [...new Set(list.map((row) => row.id))],
      limit: list.length,
      now,
      session,
      hiddenModules,
    });
    return items.filter(
      (item) =>
        !item.upcoming ||
        list.some(
          (ref) =>
            ref.id === item.id && (ref.upcoming || allowUpcoming === 'all'),
        ),
    );
  };
  const found = [];
  if (session) for (const group of groups) found.push(...(await read(group)));
  else found.push(...(await Promise.all(groups.map(read))).flat());
  return new Map(found.map((row) => [refKey(row), row]));
}
export async function genresForHomepage(now, hidden = []) {
  const count = (model, match) =>
    model.aggregate([
      { $match: match },
      { $unwind: '$genres' },
      { $group: { _id: '$genres', count: { $sum: 1 } } },
    ]);
  const [films, movies] = await Promise.all([
    count(Film, {
      status: 'published',
      releaseAt: { $lte: now },
      classification: {
        $in: ['independent', 'original'].filter(
          (module) => !hidden.includes(sources[module].path),
        ),
      },
    }),
    hidden.includes('/reviews') ? [] : count(Movie, publicMovieFilter(now)),
  ]);
  const totals = new Map();
  for (const { _id, count } of [...films, ...movies])
    totals.set(_id, (totals.get(_id) ?? 0) + count);
  return totals;
}
