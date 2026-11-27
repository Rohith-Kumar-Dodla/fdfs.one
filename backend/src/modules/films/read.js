import { ratedPage } from '../reviews/rated-page.js';
import { youtubeArtwork } from '../../../../shared/youtube-artwork.js';
import { genres } from '../../../../shared/films.js';
import { AppError } from '../../utils/app-error.js';
import { sendList } from '../../utils/list.js';
import { sendSuccess } from '../../utils/responses.js';
import { RatingTotals } from '../reviews/models.js';
import { ratingView } from '../reviews/movies.js';
import { imageView } from '../media/assets.js';
import { normalizedName } from '../talent/models.js';
import { Film, FilmCredit } from './models.js';

const cardFields =
  'publicId slug classification title synopsis genres language runtimeMinutes releaseYear poster banner releaseAt trailer.provider mainVideo.providerVideoId mainVideo.artwork';
const images =
  'publicId purpose url width height bytes references createdAt alt';
export const missingFilm = () =>
  new AppError(404, 'FILM_NOT_FOUND', 'Film not found.');
const released = (now) => ({ releaseAt: { $lte: now } });
const upcoming = (now) => ({ releaseAt: { $gt: now }, announce: true });
const existsNow = (film, now) => film.releaseAt <= now;
const viewImage = (asset) => {
  if (!asset?.url) return null;
  const { url, variants, width, height, alt } = imageView(asset);
  return { url, variants, width, height, ...(alt && { alt }) };
};
const artwork = ['poster', 'banner'].map((path) => ({ path, select: images }));
const populatePoster = (query) => query.populate(artwork);
const nameFilter = (q) => {
  const text = normalizedName(q);
  return text
    ? {
        $elemMatch: {
          $gte: text,
          $lt: text + '\uffff',
          $regex: '^' + RegExp.escape(text),
        },
      }
    : undefined;
};

function cardView(film, now) {
  const {
    publicId,
    slug,
    classification,
    title,
    synopsis,
    genres,
    language,
    runtimeMinutes,
    releaseYear,
    poster,
    releaseAt,
    trailer,
  } = film;
  return {
    id: publicId,
    slug,
    classification,
    title,
    synopsis,
    genres,
    language,
    runtimeMinutes,
    releaseYear,
    poster:
      viewImage(poster) ??
      (existsNow(film, now) ? youtubeArtwork(film.mainVideo) : null),
    banner: viewImage(film.banner),
    releaseAt,
    availability: existsNow(film, now) ? 'released' : 'upcoming',
    hasTrailer: Boolean(trailer?.provider),
  };
}

export async function listFilms(res, query, { admin = false, creatorId } = {}) {
  const now = new Date();
  const filter = {};
  if (creatorId)
    Object.assign(filter, { creatorId, classification: 'independent' });
  else if (query.classification) filter.classification = query.classification;
  if (query.q) {
    const pattern = nameFilter(query.q);
    if (pattern) filter.titlePrefixes = pattern;
  }
  if (query.genre && Object.hasOwn(genres, query.genre))
    filter.genres = query.genre;
  if (query.language) filter.language = query.language;
  if (query.year) filter.releaseYear = query.year;
  if (!admin && !creatorId) {
    filter.status = 'published';
    if (query.availability === 'released') Object.assign(filter, released(now));
    else if (query.availability === 'upcoming')
      Object.assign(filter, upcoming(now));
    else filter.$or = [released(now), upcoming(now)];
  } else if (query.status) filter.status = query.status;
  const sorts = {
    newest: { releaseAt: -1, _id: -1 },
    title: { titleKey: 1, _id: 1 },
    '-title': { titleKey: -1, _id: -1 },
    year: { releaseYear: -1, _id: -1 },
  };
  const sort =
    query.sort === 'newest' && query.availability === 'upcoming'
      ? { releaseAt: 1, _id: 1 }
      : sorts[query.sort];
  if (
    !admin &&
    !creatorId &&
    (query.ratings === 'true' || query.minimumRating)
  ) {
    const { page, limit } = query;
    const [rows, total] = query.minimumRating
      ? await ratedPage(
          Film,
          filter,
          sort,
          query,
          ['cinema', 'original'],
          cardFields,
          artwork,
        )
      : await Promise.all([
          populatePoster(
            Film.find(filter)
              .select(cardFields)
              .sort(sort)
              .skip((page - 1) * limit)
              .limit(limit),
          ).lean(),
          Film.countDocuments(filter),
        ]);
    const summaries = new Map(
      (
        await RatingTotals.find({
          target: { $in: rows.map((x) => x._id) },
          targetType: { $in: ['cinema', 'original'] },
        }).lean()
      ).map((row) => [String(row.target), row]),
    );
    return sendSuccess(
      res,
      rows.map((row) => ({
        ...cardView(row, now),
        rating: ratingView(summaries.get(String(row._id))),
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
    Film,
    filter,
    query,
    (film) => ({
      ...cardView(film, now),
      ...((admin || creatorId) && { status: film.status }),
    }),
    cardFields + (admin || creatorId ? ' status' : ''),
    sort,
    populatePoster,
  );
}

const slots = ['poster', 'banner', 'gallery', 'extras.thumbnail'];
function fullFilm(filter) {
  return Film.findOne(filter)
    .populate(slots.map((path) => ({ path, select: images })))
    .lean();
}

function creditsFor(film, publicOnly) {
  return FilmCredit.find({ film: film._id })
    .select('personality role character department')
    .sort({ position: 1 })
    .populate({
      path: 'personality',
      select: 'publicId slug displayName status',
      ...(publicOnly && { match: { status: 'published' } }),
    })
    .lean()
    .then((credits) =>
      credits.flatMap(({ personality, role, character, department }) =>
        personality
          ? [
              {
                personalityId: personality.publicId,
                displayName: personality.displayName,
                slug: personality.slug,
                role,
                character,
                department,
              },
            ]
          : [],
      ),
    );
}

export async function getPublicFilm(slug, classification) {
  const now = new Date();
  const film = await fullFilm({
    slug,
    ...(classification && { classification }),
    status: 'published',
    $or: [released(now), upcoming(now)],
  });
  if (!film) throw missingFilm();
  const {
    description,
    subtitles,
    productionCompany,
    advisory,
    banner,
    gallery,
    awards,
    trailer,
    extras,
    mainVideo,
  } = film;
  return {
    ...cardView(film, now),
    description,
    subtitles,
    productionCompany,
    advisory,
    awards,
    banner: viewImage(banner),
    gallery: gallery.map(viewImage).filter(Boolean),
    credits: await creditsFor(film, true),
    trailer:
      existsNow(film, now) ||
      trailer?.providerVideoId !== mainVideo?.providerVideoId
        ? trailer
        : undefined,
    ...(existsNow(film, now) && {
      mainVideo,
      extras: extras.map(({ title, video, thumbnail }) => ({
        title,
        video,
        thumbnail: viewImage(thumbnail),
      })),
    }),
  };
}

export async function getManagedFilm(id, creatorId) {
  const film = await fullFilm({
    publicId: id,
    ...(creatorId && {
      creatorId,
      classification: 'independent',
      status: { $ne: 'archived' },
    }),
  });
  if (!film) throw missingFilm();
  return {
    ...cardView(film, new Date()),
    description: film.description,
    subtitles: film.subtitles,
    productionCompany: film.productionCompany,
    advisory: film.advisory,
    awards: film.awards,
    credits: await creditsFor(film, false),
    revision: film.__v,
    status: film.status,
    announce: film.announce,
    creatorId: film.creatorId,
    rightsConfirmed: film.rightsConfirmed,
    rightsNotes: film.rightsNotes,
    mainUrl: film.mainVideo?.sourceUrl,
    videoArtwork: film.mainVideo?.artwork,
    trailerUrl: film.trailer?.sourceUrl,
    posterId: film.poster?.publicId,
    bannerId: film.banner?.publicId,
    galleryIds: film.gallery.map((asset) => asset.publicId),
    banner: viewImage(film.banner),
    extras: film.extras.map(({ title, video, thumbnail }) => ({
      title,
      url: video.sourceUrl,
      thumbnailId: thumbnail?.publicId,
    })),
    rightsConfirmedAt: film.rightsConfirmedAt,
    authorizedAt: film.authorizedAt,
  };
}

export async function filmography(personalityId) {
  const credits = await FilmCredit.find({ personality: personalityId })
    .select('film role character')
    .sort({ position: 1 })
    .lean();
  if (!credits.length) return [];
  const byFilm = new Map();
  for (const { film, role, character } of credits) {
    const key = String(film);
    if (!byFilm.has(key)) byFilm.set(key, []);
    byFilm.get(key).push({ role, character });
  }
  const films = await populatePoster(
    Film.find({
      _id: { $in: [...byFilm.keys()] },
      status: 'published',
      ...released(new Date()),
    }),
  )
    .select('publicId classification slug title releaseYear poster')
    .sort({ releaseYear: -1, titleKey: 1, _id: 1 })
    .lean();
  return films.map(
    ({ _id, publicId, classification, slug, title, releaseYear, poster }) => ({
      id: publicId,
      classification,
      slug,
      title,
      releaseYear,
      poster: viewImage(poster),
      credits: byFilm.get(String(_id)),
    }),
  );
}
