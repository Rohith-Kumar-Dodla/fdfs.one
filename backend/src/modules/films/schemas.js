import { z } from 'zod';
import { genres, languages } from '../../../../shared/films.js';
import { professions } from '../../../../shared/talent.js';
import { parseYouTube } from '../../../../shared/youtube.js';
import { idParams, listInput, publicId } from '../../utils/list.js';

export const classification = z.enum(['independent', 'original']);
export const status = z.enum(['draft', 'published', 'archived']);
export const slug = z
  .string()
  .min(1)
  .max(90)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const genre = z.enum(Object.keys(genres));
export const language = z.enum(Object.keys(languages));
export const creditRole = z.enum(Object.keys(professions));
const text = (max) => z.string().trim().min(1).max(max);
const year = z.number().int().min(1888).max(2100);
const unique = (schema, max) =>
  z
    .array(schema)
    .max(max)
    .refine((items) => new Set(items).size === items.length);
const youtube = text(2048).refine(
  (url) => Boolean(parseYouTube(url)),
  'Enter a supported HTTPS YouTube video URL.',
);
const source = text(2048)
  .pipe(z.url({ protocol: /^https$/ }))
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password;
  });
export const characterKey = (character) =>
  (character ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const creditKey = (credit) =>
  [credit.personalityId, credit.role, characterKey(credit.character)].join('|');

export const filmFields = {
  title: text(140),
  synopsis: text(280),
  description: text(6000).optional(),
  genres: unique(genre, 5).refine((items) => items.length > 0),
  language,
  subtitles: unique(language, 12).default([]),
  runtimeMinutes: z.number().int().min(1).max(300),
  releaseYear: year,
  productionCompany: text(120).optional(),
  advisory: text(300).optional(),
  posterId: publicId.optional(),
  bannerId: publicId.optional(),
  galleryIds: unique(publicId, 8).default([]),
  mainUrl: youtube.optional(),
  trailerUrl: youtube.optional(),
  extras: z
    .array(
      z.strictObject({
        title: text(100),
        url: youtube,
        thumbnailId: publicId.optional(),
      }),
    )
    .max(5)
    .default([]),
  credits: z
    .array(
      z.strictObject({
        personalityId: publicId,
        role: creditRole,
        character: text(100).optional(),
        department: text(80).optional(),
      }),
    )
    .max(60)
    .refine(
      (credits) => new Set(credits.map(creditKey)).size === credits.length,
      'Remove duplicate credits.',
    )
    .default([]),
  awards: z
    .array(
      z.strictObject({
        title: text(140),
        organization: text(120).optional(),
        year: year.optional(),
        source: source.optional(),
      }),
    )
    .max(12)
    .default([]),
  rightsConfirmed: z.boolean().default(false),
  rightsNotes: text(1000).optional(),
};

const distinctVideos = (film) => {
  if (!film.mainUrl) return true;
  const main = parseYouTube(film.mainUrl)?.providerVideoId;
  return ![film.trailerUrl, ...film.extras.map((extra) => extra.url)].some(
    (url) => url && parseYouTube(url)?.providerVideoId === main,
  );
};
const details = (fields = {}) =>
  z.strictObject({ ...filmFields, ...fields }).refine(distinctVideos, {
    path: ['mainUrl'],
    message:
      'The main film must use a different video from the trailer and supporting videos.',
  });
export const filmContent = details();
export const filmProposal = z.strictObject({
  targetId: publicId.optional(),
  film: filmContent,
});
export const releaseInput = z.strictObject({
  playbackChecked: z.literal(true),
  releaseAt: z.iso.datetime().optional(),
  announce: z.boolean().optional(),
});
const filters = {
  classification: classification.optional(),
  q: text(80).optional(),
  genre: genre.optional(),
  language: language.optional(),
  year: z.coerce.number().int().min(1888).max(2100).optional(),
  availability: z.enum(['released', 'upcoming']).optional(),
  sort: z.enum(['newest', 'title', '-title', 'year']).default('newest'),
};
export const publicList = listInput({
  ...filters,
  minimumRating: z.coerce.number().min(0.5).max(5).multipleOf(0.5).optional(),
  ratings: z.literal('true').optional(),
});
export const adminList = listInput({ ...filters, status: status.optional() });
export const publicDetail = z.object({
  params: z.object({ slug }),
  query: z.object({ classification: classification.optional() }),
});
export const adminDetail = z.object({ params: idParams });
export const adminCreate = z.object({
  body: details({
    classification,
    slug: slug.optional(),
  }),
});
const revision = z.number().int().nonnegative();
export const adminEdit = z.object({
  params: idParams,
  body: details({ revision, keepPublished: z.literal(true).optional() }),
});
export const adminStatus = z.object({
  params: idParams,
  body: z.discriminatedUnion('action', [
    z.strictObject({
      action: z.literal('publish'),
      revision,
      release: releaseInput,
    }),
    z.strictObject({ action: z.enum(['unpublish', 'archive']), revision }),
  ]),
});
