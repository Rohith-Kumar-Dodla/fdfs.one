import { createHash } from 'node:crypto';
import { isYouTubeId } from '../../../../shared/youtube.js';
import { saveTypes, progressTypes } from '../../../../shared/personal.js';
import { sources } from '../../../../shared/homepage.js';
import { Film, FilmCredit } from '../films/models.js';
import { PodcastEpisode, EpisodeParticipant } from '../podcasts/models.js';
import { LiveEvent } from '../live/models.js';
import { Movie } from '../reviews/models.js';
import { Personality } from '../talent/models.js';
import { discover, sourceFilter } from '../site/discovery.js';
import { allowedSource } from '../site/homepage.js';
import { readConfig } from '../site/service.js';

export const models = {
  independent: Film,
  original: Film,
  podcasts: PodcastEpisode,
  movies: Movie,
  live: LiveEvent,
  talent: Personality,
};
export const contentKey = ({ module, target, id }) =>
  module + '/' + (target ?? id);
const playable = (video) =>
  video?.provider === 'youtube' &&
  isYouTubeId(video.providerVideoId) &&
  video.availability !== 'unavailable';

export async function targetRecord(
  module,
  target,
  { now = new Date(), session, playback = false, settings } = {},
) {
  const value = settings ?? (await readConfig('settings', session)).value;
  if (value.maintenance || !allowedSource(module, value.hiddenModules))
    return null;
  if (playback && !progressTypes.includes(module)) return null;
  const filter = await sourceFilter(module, {
    now,
    mode: playback ? 'released' : 'public',
    session,
  });
  if (playback && module === 'live') filter.broadcast = 'ended';
  const row = await models[module]
    .findOne({ ...filter, publicId: target })
    .select(
      'publicId slug title genres classification releaseAt publishedAt actualEndAt talent credits mainVideo replay',
    )
    .session(session ?? null)
    .lean();
  if (!playback || !row) return row;
  const video = module === 'live' ? row.replay : row.mainVideo;
  return playable(video) ? { ...row, source: sourceVersion(video) } : null;
}

export function sourceVersion(video) {
  return createHash('sha256')
    .update(video.provider + ':' + video.providerVideoId)
    .digest('hex');
}

export async function cardsFor(refs, { now = new Date(), settings } = {}) {
  const value = settings ?? (await readConfig('settings')).value;
  if (value.maintenance) return new Map();
  const groups = [...Map.groupBy(refs, (row) => row.module)];
  const output = await Promise.all(
    groups
      .filter(([module]) => allowedSource(module, value.hiddenModules))
      .map(
        async ([module, rows]) =>
          (
            await discover(module, {
              mode: 'public',
              ids: rows.map((row) => row.target),
              limit: rows.length,
              now,
            })
          ).items,
      ),
  );
  return new Map(output.flat().map((row) => [contentKey(row), row]));
}

export async function sourcesFor(refs, { now = new Date(), settings } = {}) {
  const value = settings ?? (await readConfig('settings')).value;
  if (value.maintenance) return new Map();
  const groups = [...Map.groupBy(refs, (row) => row.module)];
  const output = await Promise.all(
    groups
      .filter(
        ([module]) =>
          progressTypes.includes(module) &&
          allowedSource(module, value.hiddenModules),
      )
      .map(async ([module, rows]) => {
        const filter = await sourceFilter(module, { now, mode: 'released' });
        if (module === 'live') filter.broadcast = 'ended';
        const records = await models[module]
          .find({ ...filter, publicId: { $in: rows.map((row) => row.target) } })
          .select('publicId mainVideo replay')
          .lean();
        return records.flatMap((row) => {
          const video = module === 'live' ? row.replay : row.mainVideo;
          return playable(video)
            ? [[contentKey({ module, id: row.publicId }), sourceVersion(video)]]
            : [];
        });
      }),
  );
  return new Map(output.flat());
}

export async function contentByTalent(
  ids,
  { now = new Date(), since, settings, includeUpcoming = false } = {},
) {
  if (!ids.length) return [];
  const value = settings ?? (await readConfig('settings')).value;
  if (value.maintenance) return [];
  const [filmLinks, episodeLinks] = await Promise.all([
    FilmCredit.find({ personality: { $in: ids } })
      .select('film personality')
      .sort({ _id: -1 })
      .limit(400)
      .lean(),
    EpisodeParticipant.find({ personality: { $in: ids } })
      .select('episode personality')
      .sort({ _id: -1 })
      .limit(400)
      .lean(),
  ]);
  const links = (rows, key) => [
    ...new Set(rows.map((row) => String(row[key]))),
  ];
  const relations = {
    independent: { _id: { $in: links(filmLinks, 'film') } },
    original: { _id: { $in: links(filmLinks, 'film') } },
    podcasts: { _id: { $in: links(episodeLinks, 'episode') } },
    movies: { 'credits.personality': { $in: ids } },
    live: { talent: { $in: ids } },
  };
  const rows = await Promise.all(
    saveTypes
      .filter((module) => allowedSource(module, value.hiddenModules))
      .map(async (module) => {
        const filter = await sourceFilter(module, {
          now,
          mode: includeUpcoming && module === 'live' ? 'upcoming' : 'released',
        });
        const field = ['independent', 'original', 'podcasts'].includes(module)
          ? 'releaseAt'
          : module === 'movies'
            ? 'publishedAt'
            : 'actualEndAt';
        if (since) {
          if (module === 'live') filter.broadcast = 'ended';
          filter[field] = { ...filter[field], $gte: since, $lte: now };
        }
        const selected = await models[module]
          .find({ ...filter, ...relations[module] })
          .select(
            'publicId slug releaseAt publishedAt actualEndAt startAt talent credits.personality',
          )
          .sort({ [field]: -1, _id: -1 })
          .limit(16)
          .lean();
        const credits = module === 'podcasts' ? episodeLinks : filmLinks;
        const creditKey = module === 'podcasts' ? 'episode' : 'film';
        return selected.map((row) => ({
          module,
          target: row.publicId,
          path:
            (module === 'movies' ? '/movies' : sources[module].path) +
            '/' +
            row.slug,
          when: row[field] ?? row.startAt ?? now,
          people:
            module === 'live'
              ? (row.talent ?? [])
              : module === 'movies'
                ? (row.credits ?? []).map((credit) => credit.personality)
                : credits
                    .filter(
                      (link) => String(link[creditKey]) === String(row._id),
                    )
                    .map((link) => link.personality),
        }));
      }),
  );
  return rows
    .flat()
    .sort((a, b) => b.when - a.when || a.target.localeCompare(b.target));
}

export async function related(module, target) {
  const settings = (await readConfig('settings')).value;
  const row = await targetRecord(module, target, { settings });
  if (!row) return [];
  let people;
  if (module === 'talent') people = [row._id];
  else if (module === 'movies')
    people = (row.credits ?? [])
      .map((item) => item.personality)
      .filter(Boolean);
  else if (module === 'live') people = row.talent ?? [];
  else {
    const model = module === 'podcasts' ? EpisodeParticipant : FilmCredit;
    people = await model.distinct('personality', {
      [module === 'podcasts' ? 'episode' : 'film']: row._id,
    });
  }
  const genres = row.genres ?? [];
  const modules =
    module === 'talent'
      ? []
      : module === 'independent' || module === 'original'
        ? ['independent', 'original']
        : [module];
  const [linked, similar] = await Promise.all([
    contentByTalent(people.slice(0, 20), {
      settings,
      includeUpcoming: module === 'talent',
    }),
    Promise.all(
      modules
        .filter((type) => allowedSource(type, settings.hiddenModules))
        .map(
          async (type) =>
            (
              await discover(type, {
                limit: 8,
                exclude: [target],
                match: genres.length ? { genres: { $in: genres } } : {},
                mode: 'released',
              })
            ).items,
        ),
    ),
  ]);
  const shared = await cardsFor(
    linked.filter((item) => item.target !== target).slice(0, 12),
    { settings },
  );
  return [
    ...new Map(
      [...shared.values(), ...similar.flat()].map((item) => [
        contentKey(item),
        item,
      ]),
    ).values(),
  ].slice(0, 8);
}
