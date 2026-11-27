import { z } from 'zod';
import {
  personalConfigDefaults,
  personalSections,
} from '../../../../shared/personal.js';

export const personalConfigSchema = z.strictObject({
  recommendations: z.boolean(),
  recommendationLimit: z.number().int().min(4).max(12),
  position: z.enum(['after-hero', 'after-explore', 'before-footer']),
  sections: z
    .array(z.enum(Object.keys(personalSections)))
    .max(5)
    .refine((keys) => new Set(keys).size === keys.length),
});
export const readPersonalConfig = (value) => ({
  ...personalConfigDefaults,
  ...value?.personalization,
});
