import { z } from 'zod';
import {
  canonicalGmail,
  gmailMessage,
  isGmailAddress,
} from '../../../../shared/gmail.js';

export const normalizedEmail = z
  .string()
  .trim()
  .max(254)
  .toLowerCase()
  .pipe(z.email());
const currentPassword = z
  .string()
  .min(1)
  .max(72)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72);
export const password = currentPassword.pipe(z.string().min(12));
const fullName = z.string().trim().min(2).max(100);
const code = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const body = (fields) => z.object({ body: z.strictObject(fields) });

export const schemas = {
  register: body({
    email: normalizedEmail
      .refine(isGmailAddress, gmailMessage)
      .transform(canonicalGmail),
    fullName,
    password,
  }),
  login: body({ email: normalizedEmail, password: currentPassword }),
  email: body({ email: normalizedEmail }),
  verify: body({ token: code, password: currentPassword }),
  reset: body({ token: code, password }),
  change: body({ currentPassword, password }),
  removeAccount: body({
    password: currentPassword,
    confirmation: z.literal('DELETE'),
  }),
  welcome: body({ action: z.enum(['present', 'acknowledge']) }),
  empty: z.object({ body: z.strictObject({}).optional() }),
  session: z.object({ params: z.object({ sessionId: z.uuid() }) }),
  profile: z.object({
    body: z
      .strictObject({
        fullName: fullName.optional(),
        bio: z.string().trim().max(500).optional(),
        preferences: z.strictObject({ emailUpdates: z.boolean() }).optional(),
      })
      .refine((input) => Object.keys(input).length > 0),
  }),
};
