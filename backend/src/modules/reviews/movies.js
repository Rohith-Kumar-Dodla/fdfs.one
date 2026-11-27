import { ratedPage } from './rated-page.js';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { moviePath } from '../../../../shared/reviews.js';
import { AppError } from '../../utils/app-error.js';
import { searchPattern, sendList } from '../../utils/list.js';
import { sendSuccess } from '../../utils/responses.js';
import { recordAudit } from '../admin/audit.js';
import {
  attachReference,
  imageView,
  MediaAsset,
  releaseReference,
} from '../media/assets.js';
import { videoSource } from '../media/video.js';
import { normalizedName, Personality } from '../talent/models.js';
import { Movie, RatingTotals } from './models.js';

export const missingMovie = () =>
  new AppError(404, 'MOVIE_NOT_FOUND', 'Movie not found.');
const changed = () =>
  new AppError(
    409,
    'MOVIE_CHANGED',
    'The movie changed. Reload before saving.',
  );
export const publicMovieFilter = (now = new Date()) => ({
  status: 'published',
  publishedAt: { $lte: now },
});
const projection =
  'publicId title originalTitle slug synopsis description releaseDate releaseYear runtimeMinutes genres language languages countries companies advisory poster backdrop gallery trailer trailerAuthorized publishedAt credits awards links metadata ratingCount';
const imageFields = 'publicId url alt width height status';
const personFields = 'publicId slug displayName status';
const populates = ['poster', 'backdrop', 'gallery'].map((path) => ({
  path,
  select: imageFields,
}));
const movieImage = (value) => {
  if (value?.status !== 'active' || !value.url) return undefined;
  const { id, url, width, height, alt, variants } = imageView({
    ...value,
    references: [],
  });
  return { id, url, width, height, alt, variants };
};
const fields = [
  'title',
  'originalTitle',
  'synopsis',
  'description',
  'releaseDate',
  'releaseYear',
  'runtimeMinutes',
  'genres',
  'language',
  'languages',
  'countries',
  'companies',
  'advisory',
  'awards',
  'links',
];
const filmFields = (row, names) =>
  Object.fromEntries(
    names.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]),
  );
const sortOptions = {
  release: { releaseDate: -1, _id: -1 },
  published: { publishedAt: -1, _id: -1 },
  title: { titleKey: 1, _id: 1 },
  rating: { ratingRank: -1, ratingCount: -1, _id: 1 },
  popular: { ratingCount: -1, _id: 1 },
};
const listed = [
  'title',
  'originalTitle',
  'synopsis',
  'releaseDate',
  'releaseYear',
  'genres',
  'runtimeMinutes',
  'language',
];
export function ratingView(row) {
  const count = row?.count ?? 0;
  return {
    count,
    average: count ? row.sum / (2 * count) : null,
    distribution: Array.from({ length: 10 }, (_, i) => ({
      stars: (i + 1) / 2,
      count: row?.distribution[i] ?? 0,
    })),
  };
}
function filters(query, admin) {
  const result = admin
    ? (query.status && { status: query.status }) || {}
    : publicMovieFilter();
  if (!admin && query.shelf === 'rating')
    result.ratingRank = { $type: 'number' };
  if (!admin && query.shelf === 'popular') result.ratingCount = { $gt: 0 };
  if (!admin && query.shelf === 'release')
    result.releaseDate = { $lte: new Date() };
  if (query.genre) result.genres = query.genre;
  if (query.language)
    result.$or = [{ language: query.language }, { languages: query.language }];
  if (query.year) result.releaseYear = query.year;
  if (query.q) {
    const normalized = normalizedName(query.q);
    const match = searchPattern(query.q);
    result.$and = [
      {
        $or: [
          { title: match },
          { originalTitle: match },
          ...(normalized ? [{ titlePrefixes: normalized }] : []),
        ],
      },
    ];
  }
  return result;
}
export async function listMovies(res, query, admin = false) {
  const where = filters(query, admin);
  if (admin)
    return sendList(
      res,
      Movie,
      where,
      query,
      (row) => ({
        id: row.publicId,
        slug: row.slug,
        ...filmFields(row, listed),
        status: row.status,
        revision: row.__v,
        updatedAt: row.updatedAt,
      }),
      projection + ' status __v updatedAt',
      sortOptions[query.sort],
    );
  const { page, limit } = query;
  const [rows, total] = query.minimumRating
    ? await ratedPage(
        Movie,
        where,
        sortOptions[query.sort],
        query,
        ['movie'],
        projection,
        populates[0],
      )
    : await Promise.all([
        Movie.find(where)
          .select(projection)
          .sort(sortOptions[query.sort])
          .skip((page - 1) * limit)
          .limit(limit)
          .populate(populates[0])
          .lean(),
        Movie.countDocuments(where),
      ]);
  const totals = new Map(
    (
      await RatingTotals.find({
        targetType: 'movie',
        target: { $in: rows.map((row) => row._id) },
      }).lean()
    ).map((row) => [String(row.target), row]),
  );
  return sendSuccess(
    res,
    rows.map((row) => ({
      id: row.publicId,
      slug: row.slug,
      ...filmFields(row, listed),
      poster: movieImage(row.poster),
      rating: ratingView(totals.get(String(row._id))),
      publishedAt: row.publishedAt,
      path: moviePath(row.slug),
    })),
    {
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  );
}

const creditView = (credit) => ({
  personalityId: credit.personality.publicId,
  name: credit.personality.displayName,
  slug: credit.personality.slug,
  role: credit.role,
  character: credit.character,
  department: credit.department,
});
function publicCredits(row) {
  return row.credits
    .filter((credit) => credit.personality?.status === 'published')
    .map(creditView);
}
export async function getMovie(slug, onlyCredits = false) {
  const query = Movie.findOne({ ...publicMovieFilter(), slug })
    .select(onlyCredits ? 'credits' : projection)
    .populate({ path: 'credits.personality', select: personFields });
  const row = await (onlyCredits ? query : query.populate(populates)).lean();
  if (!row) throw missingMovie();
  const credits = publicCredits(row);
  if (onlyCredits) return credits;
  const { metadata } = row;
  return {
    id: row.publicId,
    slug: row.slug,
    ...filmFields(row, fields),
    path: moviePath(row.slug),
    publishedAt: row.publishedAt,
    poster: movieImage(row.poster),
    backdrop: movieImage(row.backdrop),
    gallery: row.gallery.map(movieImage).filter(Boolean),
    trailer:
      row.trailerAuthorized && row.trailer?.providerVideoId
        ? {
            provider: row.trailer.provider,
            providerVideoId: row.trailer.providerVideoId,
          }
        : undefined,
    credits,
    rating: ratingView(
      await RatingTotals.findOne({
        targetType: 'movie',
        target: row._id,
      }).lean(),
    ),
    metadata: metadata && {
      provider: metadata.provider,
      id: metadata.id,
      attribution: metadata.attribution,
      syncedAt: metadata.syncedAt,
      rating:
        metadata.externalRating === undefined
          ? undefined
          : { value: metadata.externalRating, scale: metadata.scale },
    },
  };
}
export async function getManagedMovie(id) {
  const row = await Movie.findOne({ publicId: id })
    .populate(populates)
    .populate({ path: 'credits.personality', select: personFields })
    .lean();
  if (!row) throw missingMovie();
  return {
    id: row.publicId,
    slug: row.slug,
    ...filmFields(row, fields),
    releaseDate: row.releaseDate?.toISOString().slice(0, 10),
    status: row.status,
    revision: row.__v,
    updatedAt: row.updatedAt,
    poster: movieImage(row.poster),
    backdrop: movieImage(row.backdrop),
    gallery: row.gallery.map(movieImage).filter(Boolean),
    trailerUrl: row.trailer?.sourceUrl,
    artworkAuthorized: !!row.artworkAuthorized,
    trailerAuthorized: !!row.trailerAuthorized,
    credits: row.credits.filter((x) => x.personality).map(creditView),
    metadata: row.metadata,
  };
}
const unique = (items) => [...new Set(items.filter(Boolean).map(String))];
async function assignDetails(row, input, session) {
  const imageIds = unique([
    input.posterId,
    input.backdropId,
    ...input.galleryIds,
  ]);
  const peopleIds = unique(input.credits.map((credit) => credit.personalityId));
  const images = imageIds.length
    ? await MediaAsset.find({
        publicId: { $in: imageIds },
        status: 'active',
        purpose: 'library',
      })
        .select('publicId')
        .session(session)
        .lean()
    : [];
  if (images.length !== imageIds.length)
    throw new AppError(400, 'MOVIE_IMAGE', 'Choose active library artwork.');
  const existingPeople = new Set(
    row.credits.map((item) => String(item.personality)),
  );
  const people = peopleIds.length
    ? await Personality.find({ publicId: { $in: peopleIds } })
        .select('publicId status')
        .session(session)
        .lean()
    : [];
  if (
    people.length !== peopleIds.length ||
    people.some(
      (item) =>
        item.status !== 'published' && !existingPeople.has(String(item._id)),
    )
  )
    throw new AppError(
      400,
      'MOVIE_CREDIT',
      'Choose published Talent Profiles for new credits.',
    );
  const asset = new Map(images.map((item) => [item.publicId, item._id]));
  const person = new Map(people.map((item) => [item.publicId, item._id]));
  const previous = unique([row.poster, row.backdrop, ...row.gallery]);
  const next = unique(images.map((item) => item._id));
  const reference = { kind: 'movie', targetId: row.publicId };
  for (const id of previous)
    if (!next.includes(id)) await releaseReference(id, reference, session);
  for (const id of next)
    if (!previous.includes(id)) await attachReference(id, reference, session);
  for (const field of fields) row.set(field, input[field]);
  const sameSource =
    input.metadata &&
    row.metadata?.provider === input.metadata.provider &&
    row.metadata?.id === input.metadata.id;
  row.set({
    titleKey: normalizedName(input.title) || input.title.toLowerCase(),
    titlePrefixes: [
      ...new Set(
        normalizedName(input.title + ' ' + (input.originalTitle ?? ''))
          .split(' ')
          .flatMap((word) =>
            Array.from({ length: Math.min(40, word.length) }, (_, i) =>
              word.slice(0, i + 1),
            ),
          ),
      ),
    ].slice(0, 240),
    releaseYear:
      input.releaseYear ??
      (input.releaseDate ? Number(input.releaseDate.slice(0, 4)) : undefined),
    poster: asset.get(input.posterId),
    backdrop: asset.get(input.backdropId),
    gallery: input.galleryIds.map((id) => asset.get(id)),
    credits: input.credits.map(({ personalityId, ...credit }) => ({
      ...credit,
      personality: person.get(personalityId),
    })),
    trailer: input.trailerUrl
      ? videoSource.parse({
          provider: 'youtube',
          sourceUrl: input.trailerUrl,
          playbackType: 'on_demand',
        })
      : undefined,
    artworkAuthorized: input.artworkAuthorized,
    trailerAuthorized: input.trailerAuthorized,
    metadata: input.metadata && {
      ...input.metadata,
      ...(sameSource && {
        syncedAt: row.metadata.syncedAt,
        unmatched: row.metadata.unmatched,
        images: row.metadata.images,
      }),
    },
  });
}
const publishing = (row) => {
  if (
    (row.poster || row.backdrop || row.gallery.length) &&
    !row.artworkAuthorized
  )
    throw new AppError(
      400,
      'MOVIE_ARTWORK_RIGHTS',
      'Confirm publication rights for the selected artwork.',
    );
  if (row.trailer?.providerVideoId && !row.trailerAuthorized)
    throw new AppError(
      400,
      'MOVIE_TRAILER_RIGHTS',
      'Confirm authorization for the trailer.',
    );
};
export async function writeMovie(id, input, audit, providerSnapshot) {
  try {
    const publicId = await mongoose.connection.transaction(async (session) => {
      const row = id
        ? await Movie.findOne({ publicId: id }).session(session)
        : new Movie({ publicId: randomUUID(), createdBy: audit.actorId });
      if (!row) throw missingMovie();
      if (row.status === 'archived' || (id && row.__v !== input.revision))
        throw changed();
      const previous = row.status;
      if (input.action) {
        if (
          (input.action === 'publish' && previous !== 'draft') ||
          (input.action === 'unpublish' && previous !== 'published')
        )
          throw changed();
        row.status = {
          publish: 'published',
          unpublish: 'draft',
          archive: 'archived',
        }[input.action];
        if (input.action === 'publish') row.publishedAt = new Date();
        if (input.action === 'archive') row.archivedAt = new Date();
      } else {
        if (!id)
          row.slug =
            input.slug ??
            (normalizedName(input.title)
              .replace(/[^a-z0-9]+/g, '-')
              .slice(0, 68)
              .replace(/^-+|-+$/g, '') || 'movie') +
              '-' +
              row.publicId.slice(0, 8);
        await assignDetails(row, input, session);
        if (providerSnapshot)
          row.set('metadata', { ...input.metadata, ...providerSnapshot });
      }
      if (!id && input.publish) {
        row.status = 'published';
        row.publishedAt = new Date();
      }
      if (row.status === 'published') publishing(row);
      row.updatedBy = audit.actorId;
      if (id) row.increment();
      await row.save({ session });
      await recordAudit(
        session,
        audit,
        'movie.' + (input.action ?? (id ? 'edit' : 'create')),
        'movie',
        row.publicId,
        { field: 'movie', from: previous, to: row.status },
      );
      if (!id && input.publish)
        await recordAudit(
          session,
          audit,
          'movie.publish',
          'movie',
          row.publicId,
          { field: 'movie', from: 'draft', to: 'published' },
        );
      return row.publicId;
    });
    return getManagedMovie(publicId);
  } catch (error) {
    if (error.name === 'VersionError') throw changed();
    if (error.code === 11000)
      throw new AppError(
        409,
        'MOVIE_DUPLICATE',
        'This slug or provider identity is already in use.',
      );
    throw error;
  }
}
export async function movieAppearances(personality) {
  const rows = await Movie.find({
    ...publicMovieFilter(),
    'credits.personality': personality,
  })
    .select('publicId slug title releaseDate releaseYear credits poster')
    .populate(populates[0])
    .sort(sortOptions.release)
    .limit(50)
    .lean();
  return rows.map((row) => ({
    id: row.publicId,
    slug: row.slug,
    title: row.title,
    releaseDate: row.releaseDate,
    releaseYear: row.releaseYear,
    poster: movieImage(row.poster),
    path: moviePath(row.slug),
    credits: row.credits
      .filter((credit) => String(credit.personality) === String(personality))
      .map(({ role, character, department }) => ({
        role,
        character,
        department,
      })),
  }));
}
