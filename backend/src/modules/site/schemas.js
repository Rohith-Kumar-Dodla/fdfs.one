import { personalConfigSchema } from '../personal/preferences.js';
import { supportCategories } from '../../../../shared/operations.js';
import { z } from 'zod';
import {
  discoveryModules,
  layouts,
  sectionKinds,
} from '../../../../shared/homepage.js';
import { genres } from '../../../../shared/films.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { legalSections, modulePaths } from '../../../../shared/site.js';
import { publicId } from '../../utils/list.js';

const text = (max) => z.string().trim().min(1).max(max);
const time = z.iso.datetime().optional();
const website = z
  .url({ protocol: /^https$/ })
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password;
  });
const links = z
  .array(z.strictObject({ label: text(50), url: website }))
  .max(10)
  .default([]);
const unique = (array) =>
  array.refine((items) => new Set(items).size === items.length);
const revision = z.number().int().nonnegative();
export const settings = z.strictObject({
  name: text(60),
  description: text(280),
  contact: text(280).optional(),
  supportEmail: z.email().max(254).optional(),
  logoId: publicId.optional(),
  faviconId: publicId.optional(),
  brandId: publicId.optional(),
  socialImageId: publicId.optional(),
  hiddenModules: unique(
    z.array(z.enum(modulePaths)).max(modulePaths.length),
  ).default([]),
  footer: text(400).optional(),
  links,
  socials: links,
  seoTitle: text(90).optional(),
  seoDescription: text(300).optional(),
  legal: z
    .strictObject(
      Object.fromEntries(
        Object.keys(legalSections).map((key) => [key, text(12000).optional()]),
      ),
    )
    .default({}),
  registrationOpen: z.boolean(),
  maintenance: z.boolean(),
  communityOpen: z.boolean(),
  supportOpen: z.boolean().optional(),
  supportCategories: unique(
    z
      .array(z.enum(Object.keys(supportCategories)))
      .min(1)
      .max(Object.keys(supportCategories).length),
  ).optional(),
  analyticsOpen: z.boolean().optional(),
  personalization: personalConfigSchema.optional(),
});
const reference = z.strictObject({
  module: z.enum(discoveryModules),
  id: publicId,
  upcoming: z.boolean().optional(),
});
const windowFields = { startAt: time, endAt: time };
const ordered = ({ startAt, endAt }) =>
  !startAt || !endAt || Date.parse(startAt) < Date.parse(endAt);
const section = z
  .strictObject({
    id: publicId,
    type: z.enum(sectionKinds),
    heading: text(100),
    description: text(280).optional(),
    visible: z.boolean(),
    items: z.array(reference).max(12).default([]),
    module: z.enum(discoveryModules).optional(),
    layout: z.enum(layouts).optional(),
    limit: z.number().int().min(1).max(12).optional(),
    ...windowFields,
  })
  .refine(ordered, { path: ['endAt'], message: 'End must follow start.' })
  .refine(
    (row) =>
      row.type === 'latest'
        ? row.module && row.limit && !row.items.length
        : row.type === 'featured'
          ? row.items.length > 0 && !row.module
          : !row.items.length && !row.module,
    {
      message:
        'Choose published items for Featured or a module and limit for Latest.',
    },
  )
  .refine(
    ({ items }) =>
      new Set(items.map(({ module, id }) => module + id)).size === items.length,
  );
export const homepage = z.strictObject({
  hero: z
    .strictObject({
      title: text(100),
      description: text(280).optional(),
      imageId: publicId.optional(),
      featured: reference.optional(),
      ...windowFields,
    })
    .refine(ordered, { path: ['endAt'], message: 'End must follow start.' })
    .optional(),
  sections: z
    .array(section)
    .max(16)
    .default([])
    .refine(
      (items) => new Set(items.map(({ id }) => id)).size === items.length,
    ),
  heroSlides: z
    .array(
      z
        .strictObject({
          id: publicId,
          title: text(100).optional(),
          description: text(280).optional(),
          imageId: publicId.optional(),
          mobileId: publicId.optional(),
          target: reference,
          focal: z
            .enum(['center', 'top', 'bottom', 'left', 'right'])
            .optional(),
          ...windowFields,
        })
        .refine(ordered),
    )
    .max(8)
    .optional()
    .refine(
      (rows) =>
        !rows || new Set(rows.map((row) => row.id)).size === rows.length,
    ),
  rotationSeconds: z
    .number()
    .int()
    .min(0)
    .max(60)
    .refine((value) => value === 0 || value >= 5)
    .optional(),
  releaseDays: z.number().int().min(1).max(180).optional(),
  genres: z
    .array(
      z.strictObject({
        genre: z.enum(Object.keys({ ...genres, ...reviewGenres })),
        imageId: publicId.optional(),
      }),
    )
    .max(16)
    .optional()
    .refine(
      (rows) =>
        !rows || new Set(rows.map((row) => row.genre)).size === rows.length,
    ),
});
export const settingsInput = z.object({
  body: z.strictObject({ revision, settings }),
});
export const homepageInput = z.object({
  body: z.strictObject({ revision, homepage }),
});
export const publishInput = z.object({ body: z.strictObject({ revision }) });
