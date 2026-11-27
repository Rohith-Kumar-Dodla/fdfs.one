import { z } from 'zod';
import { genres, languages } from '../../../../shared/films.js';
import {
  reportReasons,
  reviewGenres,
  reviewTargets,
} from '../../../../shared/reviews.js';
import { characterKey, creditRole, slug } from '../films/schemas.js';
import { idParams, listInput, publicId } from '../../utils/list.js';
import { parseYouTube } from '../../../../shared/youtube.js';

export const text = (max, min = 1) => z.string().trim().min(min).max(max);
const plainText = (max, min = 1) =>
  text(max, min).refine(
    (value) => !/<\/?[a-z][^>]*>/i.test(value),
    'Use plain text.',
  );
const unique = (field, max) =>
  z
    .array(field)
    .max(max)
    .refine((xs) => new Set(xs).size === xs.length)
    .default([]);
const https = text(2048)
  .pipe(z.url({ protocol: /^https$/ }))
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password;
  });
const linkedLanguage = z.enum(Object.keys(languages));
const genre = z.enum(Object.keys({ ...genres, ...reviewGenres }));
const year = z.number().int().min(1888).max(2100);
const change = z.number().int().nonnegative();
const movieFields = {
  title: plainText(140),
  originalTitle: plainText(140).optional(),
  synopsis: plainText(280).optional(),
  description: plainText(6000).optional(),
  releaseDate: z.iso
    .date()
    .refine((value) => +value.slice(0, 4) >= 1888 && +value.slice(0, 4) <= 2100)
    .optional(),
  releaseYear: year.optional(),
  runtimeMinutes: z.number().int().min(1).max(1440).optional(),
  genres: unique(genre, 12),
  language: linkedLanguage.optional(),
  languages: unique(linkedLanguage, 30),
  countries: unique(z.string().regex(/^[A-Z]{2}$/), 20),
  companies: unique(plainText(120), 20),
  advisory: plainText(300).optional(),
  posterId: publicId.optional(),
  backdropId: publicId.optional(),
  galleryIds: unique(publicId, 12),
  artworkAuthorized: z.boolean().default(false),
  trailerAuthorized: z.boolean().default(false),
  trailerUrl: https
    .refine(
      (url) => Boolean(parseYouTube(url)),
      'Enter a supported YouTube URL.',
    )
    .optional(),
  credits: z
    .array(
      z.strictObject({
        personalityId: publicId,
        role: creditRole,
        character: plainText(100).optional(),
        department: plainText(80).optional(),
      }),
    )
    .max(80)
    .refine(
      (items) =>
        new Set(
          items.map((x) =>
            [x.personalityId, x.role, characterKey(x.character)].join('|'),
          ),
        ).size === items.length,
      'Remove duplicate credits.',
    )
    .default([]),
  awards: z
    .array(
      z.strictObject({
        title: plainText(140),
        organization: plainText(120).optional(),
        year: year.optional(),
        source: https.optional(),
      }),
    )
    .max(20)
    .default([]),
  links: z
    .array(z.strictObject({ label: plainText(80), url: https }))
    .max(12)
    .default([]),
  metadata: z
    .strictObject({
      provider: z.enum(['tmdb', 'other']),
      id: text(80).regex(/^[a-zA-Z0-9_.-]+$/),
      attribution: plainText(240),
      externalRating: z.number().nonnegative().optional(),
      scale: z.number().positive().optional(),
    })
    .refine(
      (x) =>
        (x.externalRating === undefined && x.scale === undefined) ||
        (x.externalRating !== undefined &&
          x.scale !== undefined &&
          x.externalRating <= x.scale),
    )
    .optional(),
};
const movieBody = (fields = {}) =>
  z
    .strictObject({ ...movieFields, ...fields })
    .refine(
      (x) =>
        !x.releaseYear ||
        !x.releaseDate ||
        x.releaseYear === Number(x.releaseDate.slice(0, 4)),
      { path: ['releaseYear'], message: 'Year must match the release date.' },
    );
export const movieCreate = z.object({
  body: movieBody({ slug: slug.optional() }),
});
export const movieEdit = z.object({
  params: idParams,
  body: movieBody({ revision: change }),
});
export const movieAction = z.object({
  params: idParams,
  body: z.strictObject({
    revision: change,
    action: z.enum(['publish', 'unpublish', 'archive']),
  }),
});
const filters = {
  q: text(80).optional(),
  genre: genre.optional(),
  language: linkedLanguage.optional(),
  year: z.coerce.number().pipe(year).optional(),
  sort: z
    .enum(['release', 'published', 'title', 'rating', 'popular'])
    .default('release'),
};
export const movies = listInput({
  ...filters,
  minimumRating: z.coerce.number().min(0.5).max(5).multipleOf(0.5).optional(),
  shelf: z.enum(['release', 'rating', 'popular']).optional(),
});
export const adminMovies = listInput({
  ...filters,
  status: z.enum(['draft', 'published', 'archived']).optional(),
});
export const slugInput = z.object({ params: z.object({ slug }) });
const target = z.object({ type: z.enum(reviewTargets), slug });
const item = target.extend({ id: publicId });
const comment = item.extend({ comment: publicId });
const reviewFields = {
  title: plainText(140).optional(),
  body: plainText(6000, 5),
  spoiler: z.boolean().default(false),
};
const commentFields = {
  body: plainText(2000),
  spoiler: z.boolean().default(false),
};
const halfStar = z.number().min(0.5).max(5).multipleOf(0.5);
export const pendingReviewFields = z.strictObject({
  title: plainText(180),
  year: z.number().int().min(1888).max(2100).optional(),
  details: plainText(240).optional(),
  body: reviewFields.body,
  spoiler: reviewFields.spoiler,
  rating: halfStar,
});
export const targetInput = z.object({ params: target });
export const reviewInput = z.object({ params: item });
export const commentInput = z.object({ params: comment });
export const rate = targetInput.extend({
  body: z.strictObject({ rating: halfStar }),
});
export const createReview = targetInput.extend({
  body: z.strictObject(reviewFields),
});
export const editReview = reviewInput.extend({
  body: z.strictObject(reviewFields),
});
export const createComment = reviewInput.extend({
  body: z.strictObject(commentFields),
});
export const editComment = commentInput.extend({
  body: z.strictObject(commentFields),
});
export const reviewList = listInput({
  summary: z.literal('true').optional(),
  sort: z.enum(['recent', 'liked', 'trending']).default('recent'),
  rating: z.coerce.number().pipe(halfStar).optional(),
}).extend({ params: target });
export const comments = listInput().extend({ params: item });
const reportBody = z.strictObject({
  reason: z.enum(reportReasons),
  details: plainText(500).optional(),
});
export const reportReview = reviewInput.extend({ body: reportBody });
export const reportComment = commentInput.extend({ body: reportBody });
export const reports = listInput({
  status: z.enum(['open', 'resolved']).default('open'),
  type: z.enum(['review', 'comment']).optional(),
});
export const resolve = z.object({
  params: idParams,
  body: z.strictObject({
    action: z.enum(['hide', 'restore', 'dismiss']),
    reason: plainText(300, 3),
  }),
});
export const feed = listInput({
  type: z.enum(reviewTargets).optional(),
  sort: z.enum(['recent', 'liked', 'trending']).default('recent'),
  rating: z.coerce.number().pipe(halfStar).optional(),
});
export const permalink = z.object({
  params: idParams,
  query: z.object({ reveal: z.literal('true').optional() }),
});
export const likes = z.object({
  query: z.object({
    ids: z
      .string()
      .max(950)
      .transform((value) => value.split(','))
      .pipe(z.array(publicId).min(1).max(24)),
  }),
});
export const historyRatingId = z.object({
  params: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }),
});
export const history = listInput({
  kind: z.enum(['reviews', 'ratings']).default('reviews'),
});
export const managedReviews = listInput({
  q: text(80).optional(),
  type: z.enum(reviewTargets).optional(),
  status: z.enum(['published', 'hidden', 'deleted']).optional(),
  spoiler: z.enum(['true', 'false']).optional(),
});
export const manageContent = z.object({
  params: idParams.extend({ comment: publicId.optional() }),
  body: z.strictObject({
    action: z.enum(['hide', 'restore']),
    reason: plainText(300, 3),
  }),
});
export const ratingAbuse = z.object({
  params: target.extend({ account: publicId }),
  body: z.strictObject({
    reason: plainText(300, 3),
    action: z.enum(['exclude', 'restore']),
  }),
});
