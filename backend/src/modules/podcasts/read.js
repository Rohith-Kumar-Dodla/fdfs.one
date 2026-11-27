import { youtubeArtwork } from '../../../../shared/youtube-artwork.js';
import { podcastBrand } from '../../../../shared/podcasts.js';
import { sendSuccess } from '../../utils/responses.js';
import { AppError } from '../../utils/app-error.js';
import { sendList } from '../../utils/list.js';
import { imageView } from '../media/assets.js';
import { normalizedName } from '../talent/models.js';
import { EpisodeParticipant, PodcastEpisode, PodcastShow } from './models.js';

const mediaFields =
  'publicId purpose url width height bytes references createdAt alt';
const peopleFields = 'publicId displayName slug status';
const cardFields =
  'publicId slug title synopsis number season language topics duration thumbnail releaseAt teaser.provider mainVideo.providerVideoId mainVideo.artwork';
export const missingEpisode = () =>
  new AppError(404, 'EPISODE_NOT_FOUND', 'Episode not found.');
export const missingShow = () =>
  new AppError(404, 'PODCAST_SHOW_NOT_FOUND', 'Podcast show not found.');
export const findShow = (publicOnly) =>
  PodcastShow.findOne({
    slug: podcastBrand.slug,
    ...(publicOnly && { status: 'published' }),
  });
const released = (now) => ({ releaseAt: { $lte: now } });
const upcoming = (now) => ({ releaseAt: { $gt: now }, announce: true });
const visible = (now, availability) => ({
  status: 'published',
  publicationAt: { $lte: now },
  ...(availability === 'released'
    ? released(now)
    : availability === 'upcoming'
      ? upcoming(now)
      : { $or: [released(now), upcoming(now)] }),
});
const image = (asset, managed = false) => {
  if (!asset?.url) return null;
  const { id, url, variants, width, height, alt } = imageView(asset);
  return {
    url,
    variants,
    width,
    height,
    ...(alt && { alt }),
    ...(managed && { id }),
  };
};
const person = ({ publicId, displayName, slug }) => ({
  id: publicId,
  displayName,
  slug,
});
const addPoster = (query) => query.populate('thumbnail', mediaFields);

export async function getShow(publicOnly, slug = podcastBrand.slug) {
  if (slug !== podcastBrand.slug) throw missingShow();
  const show = await findShow(publicOnly)
    .populate([
      { path: 'cover', select: mediaFields },
      { path: 'banner', select: mediaFields },
      {
        path: 'hosts',
        select: peopleFields,
        ...(publicOnly && { match: { status: 'published' } }),
      },
    ])
    .lean();
  if (!show) return null;
  const {
    publicId,
    name,
    introduction,
    description,
    languages,
    links,
    cover,
    banner,
    hosts,
  } = show;
  return {
    id: publicId,
    slug,
    name,
    introduction,
    description,
    languages,
    links,
    cover: image(cover, !publicOnly),
    banner: image(banner, !publicOnly),
    hosts: hosts.map(person),
    ...(!publicOnly && {
      status: show.status,
      revision: show.__v,
      rightsConfirmed: show.rightsConfirmed,
    }),
  };
}

function card(episode, now, show, admin = false) {
  const {
    publicId,
    slug,
    title,
    synopsis,
    number,
    season,
    language,
    topics,
    duration,
    thumbnail,
    releaseAt,
    teaser,
  } = episode;
  return {
    id: publicId,
    slug,
    title,
    synopsis,
    number,
    season,
    language,
    topics,
    duration,
    releaseAt,
    thumbnail:
      image(thumbnail, admin) ??
      (releaseAt <= now ? youtubeArtwork(episode.mainVideo) : null),
    show: { name: show.name, slug: show.slug },
    availability: releaseAt <= now ? 'released' : 'upcoming',
    hasTeaser: Boolean(teaser?.provider),
    ...(admin && { status: episode.status }),
  };
}

export async function guestNames(ids) {
  if (!ids.length) return new Map();
  const rows = await EpisodeParticipant.find({
    episode: { $in: ids },
    role: 'guest',
  })
    .sort({ position: 1, _id: 1 })
    .select('episode personality')
    .limit(ids.length * 40)
    .populate({
      path: 'personality',
      match: { status: 'published' },
      select: 'displayName',
    })
    .lean();
  return new Map(
    [...Map.groupBy(rows, (row) => String(row.episode))].map(([id, guests]) => [
      id,
      [
        ...new Set(
          guests.flatMap((row) =>
            row.personality?.displayName ? [row.personality.displayName] : [],
          ),
        ),
      ].slice(0, 4),
    ]),
  );
}

export async function listEpisodes(res, query, admin = false) {
  const show = await findShow(!admin).select('name slug').lean();
  const now = new Date();
  const filter = { show: show?._id ?? null };
  if (!admin) Object.assign(filter, visible(now, query.availability));
  else if (query.status) filter.status = query.status;
  for (const key of ['language', 'season'])
    if (query[key]) filter[key] = query[key];
  if (query.topic) filter.topics = query.topic;
  const q = query.q && normalizedName(query.q);
  if (q)
    filter.titlePrefixes = {
      $elemMatch: {
        $gte: q,
        $lt: q + '\uffff',
        $regex: '^' + RegExp.escape(q),
      },
    };
  const order = {
    newest: { releaseAt: -1, _id: -1 },
    oldest: { releaseAt: 1, _id: 1 },
    number: { season: -1, number: -1, _id: -1 },
  };
  const sort =
    query.sort === 'newest' && query.availability === 'upcoming'
      ? order.oldest
      : order[query.sort];
  if (!admin) {
    const { page, limit } = query;
    const [rows, total] = await Promise.all([
      addPoster(
        PodcastEpisode.find(filter)
          .select(cardFields)
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(limit),
      ).lean(),
      PodcastEpisode.countDocuments(filter),
    ]);
    const guests = await guestNames(rows.map((row) => row._id));
    return sendSuccess(
      res,
      rows.map((row) => ({
        ...card(row, now, show),
        guests: guests.get(String(row._id)) ?? [],
      })),
      {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    );
  }
  return sendList(
    res,
    PodcastEpisode,
    filter,
    query,
    (record) => card(record, now, show, admin),
    cardFields + (admin ? ' status' : ''),
    query.sort === 'newest' && query.availability === 'upcoming'
      ? order.oldest
      : order[query.sort],
    addPoster,
  );
}

export async function findReleasedEpisode(slug) {
  const show = await findShow(true).select('_id').lean();
  const episode =
    show &&
    (await PodcastEpisode.findOne({
      show: show._id,
      slug,
      ...visible(new Date(), 'released'),
      commentsEnabled: { $ne: false },
    })
      .select('_id')
      .lean());
  if (!episode) throw missingEpisode();
  return episode;
}

async function participants(episode, admin) {
  const rows = await EpisodeParticipant.find({ episode: episode._id })
    .sort({ position: 1 })
    .select('personality introduction role')
    .populate({
      path: 'personality',
      select: peopleFields,
      ...(!admin && { match: { status: 'published' } }),
    })
    .lean();
  return rows.flatMap((entry) =>
    entry.personality
      ? [
          {
            personalityId: entry.personality.publicId,
            displayName: entry.personality.displayName,
            slug: entry.personality.slug,
            introduction: entry.introduction,
            role: entry.role,
          },
        ]
      : [],
  );
}

export async function getEpisode(identifier, admin = false) {
  const now = new Date();
  const show = await findShow(!admin).select('name slug').lean();
  const episode =
    show &&
    (await PodcastEpisode.findOne({
      show: show._id,
      ...(admin
        ? { publicId: identifier }
        : { slug: identifier, ...visible(now) }),
    })
      .populate([
        { path: 'thumbnail', select: mediaFields },
        { path: 'banner', select: mediaFields },
        { path: 'gallery', select: mediaFields },
      ])
      .lean());
  if (!episode) throw missingEpisode();
  const available = episode.releaseAt <= now;
  const { notes, links, advisory, chapters, mainVideo, teaser } = episode;
  const result = {
    ...card(episode, now, show, admin),
    commentsEnabled: episode.commentsEnabled !== false,
    notes,
    links,
    advisory,
    banner: image(episode.banner, admin),
    participants: await participants(episode, admin),
    teaser:
      available || teaser?.providerVideoId !== mainVideo?.providerVideoId
        ? teaser
        : undefined,
    ...((available || admin) && {
      mainVideo,
      chapters,
      gallery: (episode.gallery ?? [])
        .map((row) => image(row, admin))
        .filter(Boolean),
      extras: episode.extras ?? [],
    }),
  };
  if (admin)
    Object.assign(result, {
      rightsConfirmed: episode.rightsConfirmed,
      rightsNotes: episode.rightsNotes,
      revision: episode.__v,
      announce: episode.announce,
      publicationAt: episode.publicationAt,
      mainUrl: mainVideo?.sourceUrl,
      videoArtwork: mainVideo?.artwork,
      teaserUrl: teaser?.sourceUrl,
      thumbnailId: episode.thumbnail?.publicId,
      bannerId: episode.banner?.publicId,
      galleryIds: (episode.gallery ?? []).map((row) => row.publicId),
    });
  return result;
}

export async function appearances(personalityId) {
  const show = await findShow(true).select('name slug').lean();
  if (!show) return [];
  const entries = await EpisodeParticipant.find({ personality: personalityId })
    .select('episode role')
    .sort({ position: 1 })
    .lean();
  if (!entries.length) return [];
  const roles = new Map();
  for (const entry of entries) {
    const key = String(entry.episode);
    if (!roles.has(key)) roles.set(key, []);
    roles.get(key).push(entry.role);
  }
  const episodes = await addPoster(
    PodcastEpisode.find({
      _id: { $in: [...roles.keys()] },
      show: show._id,
      ...visible(new Date(), 'released'),
    }),
  )
    .select('publicId slug title number season releaseAt thumbnail')
    .sort({ releaseAt: -1, _id: -1 })
    .lean();
  return episodes.map(
    ({ _id, publicId, slug, title, number, season, releaseAt, thumbnail }) => ({
      id: publicId,
      slug,
      title,
      number,
      season,
      releaseAt,
      thumbnail: image(thumbnail),
      show: { name: show.name, slug: show.slug },
      roles: roles.get(String(_id)),
    }),
  );
}
