import { z } from 'zod';
import { artworkKey } from '../media/video.js';
import { broadcasts, eventCategories } from '../../../../shared/live.js';
import { parseYouTube } from '../../../../shared/youtube.js';
import { publicId, idParams, listInput } from '../../utils/list.js';
import { language, slug } from '../films/schemas.js';

const text = (max) => z.string().trim().min(1).max(max);
const time = z.iso.datetime();
export const timezone = z
  .string()
  .min(1)
  .max(64)
  .refine((zone) => {
    if (!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(zone)) return false;
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'Use an IANA timezone such as Asia/Kolkata.');
export const youtubeUrl = text(2048).refine(
  (url) => Boolean(parseYouTube(url)),
  'Enter a supported HTTPS YouTube URL.',
);
const category = z.enum(Object.keys(eventCategories));
const dateOrder = ({ startAt, endAt }) =>
  !endAt || new Date(endAt) > new Date(startAt);
export const schedule = {
  startAt: time,
  endAt: time.optional(),
  timeZone: timezone,
};
const fields = {
  title: text(140).min(3),
  summary: text(280).min(10),
  description: text(6000),
  category,
  topic: text(100).optional(),
  language,
  venue: text(200).optional(),
  ...schedule,
  talentIds: z
    .array(publicId)
    .max(20)
    .refine((values) => new Set(values).size === values.length)
    .default([]),
  posterId: publicId.optional(),
  bannerId: publicId.optional(),
  videoUrl: youtubeUrl.optional(),
  videoArtwork: artworkKey.optional(),
  rightsConfirmed: z.boolean().default(false),
  rightsNotes: text(1000).optional(),
};
const ordered = (shape) =>
  z.strictObject(shape).refine(dateOrder, {
    path: ['endAt'],
    message: 'The event must end after its start.',
  });
export const eventContent = ordered(fields);
export const eventProposal = z.strictObject({
  targetId: publicId.optional(),
  event: eventContent,
});
export const revision = z.number().int().nonnegative();
export const adminCreate = z.object({
  body: ordered({
    ...fields,
    slug: slug.optional(),
    organizerId: publicId.optional(),
    plannedReplayUrl: youtubeUrl.optional(),
    chatEnabled: z.boolean().optional(),
    remindersEnabled: z.boolean().optional(),
    publication: z
      .discriminatedUnion('mode', [
        z.strictObject({ mode: z.literal('upcoming') }),
        z.strictObject({
          mode: z.literal('live'),
          broadcasting: z.literal(true),
        }),
      ])
      .optional(),
  }),
});
export const adminEdit = z.object({
  params: idParams,
  body: ordered({ ...fields, revision }),
});
export const slugInput = z.object({ params: z.object({ slug }) });
export const eventId = z.object({ params: idParams });
const discovery = {
  q: text(80).optional(),
  category: category.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  availability: z.enum(['live', 'upcoming', 'replay']).optional(),
  sort: z.enum(['soonest', 'latest']).default('soonest'),
};
export const publicList = listInput(discovery);
export const managedList = listInput({
  ...discovery,
  organizer: publicId.optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  moderation: z.enum(['pending', 'approved']).optional(),
  broadcast: z.enum(broadcasts).optional(),
});
const action = (values) => z.strictObject({ action: z.enum(values), revision });
export const staffAction = z.object({
  params: idParams,
  body: z.union([
    action([
      'unpublish',
      'archive',
      'cancel',
      'postpone',
      'end',
      'remove_replay',
    ]),
    z.strictObject({
      action: z.literal('publish'),
      revision,
      publicationAt: time.optional(),
    }),
    z.strictObject({
      action: z.literal('start'),
      revision,
      broadcasting: z.literal(true),
    }),
    ordered({ action: z.literal('reschedule'), revision, ...schedule }),
    z.strictObject({
      action: z.literal('replay'),
      revision,
      replayUrl: youtubeUrl,
      thumbnailId: publicId.optional(),
      rightsConfirmed: z.literal(true),
    }),
  ]),
});
export const ownerAction = z.object({
  params: idParams,
  body: z.discriminatedUnion('action', [
    z.strictObject({
      action: z.literal('start'),
      revision,
      broadcasting: z.literal(true),
    }),
    z.strictObject({ action: z.literal('end'), revision }),
  ]),
});
export const eventOptions = z.object({
  params: idParams,
  body: z.strictObject({
    revision,
    chatEnabled: z.boolean(),
    slowSeconds: z.number().int().min(0).max(120),
    remindersEnabled: z.boolean().optional(),
  }),
});
