import { z } from 'zod';
import { parseYouTube } from '../../../../shared/youtube.js';
import { participantRoles } from '../../../../shared/podcasts.js';
import { idParams, listInput, publicId } from '../../utils/list.js';
import { language, releaseInput, slug, status } from '../films/schemas.js';

const text = (length) => z.string().trim().min(1).max(length);
const url = text(2048)
  .pipe(z.url({ protocol: /^https$/ }))
  .refine((value) => {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password;
  });
const link = z.strictObject({ label: text(80), url });
const distinct = (schema, max) =>
  z
    .array(schema)
    .max(max)
    .refine((rows) => new Set(rows).size === rows.length);
const safeVideo = text(2048).refine(
  (value) => Boolean(parseYouTube(value)),
  'Enter a supported HTTPS YouTube URL.',
);
const tags = text(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const season = z.number().int().min(1).max(999);
const releaseDate = z.iso.datetime();
const revision = z.number().int().nonnegative();

export const showContent = z.strictObject({
  introduction: text(280),
  description: text(6000),
  coverId: publicId.optional(),
  bannerId: publicId.optional(),
  hostIds: distinct(publicId, 20).default([]),
  languages: distinct(language, 12).refine((items) => items.length > 0),
  links: z.array(link).max(10).default([]),
  rightsConfirmed: z.boolean().default(false),
});

export const episodeFields = {
  title: text(140),
  synopsis: text(280),
  notes: text(12000).optional(),
  number: z.number().int().min(1).max(9999),
  season: season.default(1),
  language,
  topics: distinct(tags, 12).default([]),
  duration: z.number().int().min(1).max(28800),
  thumbnailId: publicId.optional(),
  bannerId: publicId.optional(),
  mainUrl: safeVideo.optional(),
  teaserUrl: safeVideo.optional(),
  chapters: z
    .array(
      z.strictObject({
        title: text(100),
        start: z.number().int().nonnegative(),
        description: text(400).optional(),
      }),
    )
    .max(60)
    .default([]),
  participants: z
    .array(
      z.strictObject({
        personalityId: publicId,
        role: z.enum(Object.keys(participantRoles)),
        introduction: text(300).optional(),
      }),
    )
    .max(40)
    .default([]),
  links: z.array(link).max(15).default([]),
  advisory: text(300).optional(),
  releaseAt: releaseDate.optional(),
  rightsConfirmed: z.boolean().default(false),
  rightsNotes: text(1000).optional(),
};
const episode = (fields = {}) =>
  z
    .strictObject({ ...episodeFields, ...fields })
    .superRefine((value, ctx) => {
      const starts = value.chapters.map(({ start }) => start);
      if (
        new Set(starts).size !== starts.length ||
        starts.some((start) => start >= value.duration)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['chapters'],
          message:
            'Chapter times must be unique and before the end of the episode.',
        });
      }
      const people = value.participants.map(
        ({ personalityId, role }) => personalityId + ':' + role,
      );
      if (new Set(people).size !== people.length)
        ctx.addIssue({
          code: 'custom',
          path: ['participants'],
          message: 'Remove duplicate participant roles.',
        });
      if (
        value.mainUrl &&
        value.teaserUrl &&
        parseYouTube(value.mainUrl)?.providerVideoId ===
          parseYouTube(value.teaserUrl)?.providerVideoId
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['teaserUrl'],
          message: 'Use a different video for the teaser.',
        });
      }
    })
    .transform((value) => ({
      ...value,
      chapters: value.chapters.toSorted((a, b) => a.start - b.start),
    }));

export const episodeContent = episode();
const filters = {
  q: text(80).optional(),
  topic: tags.optional(),
  language: language.optional(),
  season: z.coerce.number().pipe(season).optional(),
  availability: z.enum(['released', 'upcoming']).optional(),
  sort: z.enum(['newest', 'oldest', 'number']).default('newest'),
};
export const episodeList = listInput(filters);
export const adminEpisodeList = listInput({
  ...filters,
  status: status.optional(),
});
export const slugInput = z.object({ params: z.object({ slug }) });
export const adminId = z.object({ params: idParams });
export const saveShowInput = z.object({
  body: showContent.extend({ revision: revision.optional() }),
});
export const showStatusInput = z.object({
  body: z.strictObject({
    action: z.enum(['publish', 'unpublish', 'archive']),
    revision,
  }),
});
export const createEpisodeInput = z.object({
  body: episode({ slug: slug.optional() }),
});
export const editEpisodeInput = z.object({
  params: idParams,
  body: episode({ revision }),
});
export const publishEpisodeInput = z.object({
  params: idParams,
  body: z.discriminatedUnion('action', [
    z.strictObject({
      action: z.literal('publish'),
      revision,
      release: releaseInput.extend({ publicationAt: releaseDate.optional() }),
    }),
    z.strictObject({ action: z.enum(['unpublish', 'archive']), revision }),
  ]),
});
