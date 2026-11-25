import { z } from 'zod';
import { linkKinds, professions } from '../../../../shared/talent.js';
import { idParams, listInput, publicId } from '../../utils/list.js';

export const profession = z.enum(Object.keys(professions));
export const profileStatus = z.enum(['draft', 'published', 'archived']);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slug = z.string().min(1).max(90).regex(slugPattern);
const text = (max) => z.string().trim().min(1).max(max);
const safeLink = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!/^https:\/\//i.test(value) || /[\s\\]/.test(value)) return false;
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !!url.hostname &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, 'Enter a valid HTTPS URL.');
const achievement = z.strictObject({
  title: text(120),
  organization: text(120).optional(),
  year: z.number().int().min(1800).max(2100).optional(),
  description: text(600).optional(),
  source: safeLink.optional(),
});
const roleList = z
  .array(profession)
  .min(1)
  .max(Object.keys(professions).length)
  .refine(
    (roles) => new Set(roles).size === roles.length,
    'Choose each profession once.',
  );

export const profileFields = {
  displayName: text(100),
  alternativeName: text(100).optional(),
  introduction: text(240),
  biography: text(5000).optional(),
  professions: roleList,
  location: text(100).optional(),
  profileImageId: publicId.optional(),
  coverImageId: publicId.optional(),
  website: safeLink.optional(),
  links: z
    .array(
      z.strictObject({
        kind: z.enum(Object.keys(linkKinds)),
        label: text(60),
        url: safeLink,
      }),
    )
    .max(8)
    .default([]),
  achievements: z.array(achievement).max(12).default([]),
};
export const profileContent = z.strictObject(profileFields);
export const talentProposal = z.strictObject({
  targetId: publicId.optional(),
  profile: profileContent,
});

const filters = {
  q: text(80).optional(),
  profession: profession.optional(),
  sort: z.enum(['name', '-name', 'newest']).default('name'),
};
export const directoryInput = listInput(filters);
export const adminListInput = listInput({
  ...filters,
  status: profileStatus.optional(),
});
export const slugInput = z.object({ params: z.object({ slug }) });
export const adminCreateInput = z.object({
  body: z.strictObject({ ...profileFields, slug: slug.optional() }),
});
export const adminEditInput = z.object({
  params: idParams,
  body: z.strictObject({
    ...profileFields,
    revision: z.number().int().nonnegative(),
  }),
});
export const adminStatusInput = z.object({
  params: idParams,
  body: z.strictObject({
    action: z.enum(['publish', 'unpublish', 'archive']),
    revision: z.number().int().nonnegative(),
  }),
});
export const associationInput = z.object({
  params: idParams,
  body: z.strictObject({
    userId: publicId.nullable(),
    revision: z.number().int().nonnegative(),
  }),
});
