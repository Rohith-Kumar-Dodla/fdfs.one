import { z } from 'zod';
import { gmailMessage, isGmailAddress } from '../../../../shared/gmail.js';

const email = z
  .string()
  .trim()
  .max(254)
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address.' }));
const fullName = z
  .string()
  .trim()
  .min(2, 'Enter at least two characters.')
  .max(100);
const currentPassword = z
  .string()
  .min(1, 'Enter your password.')
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    'Use at most 72 UTF-8 bytes.',
  );
const password = currentPassword.pipe(
  z.string().min(12, 'Use at least 12 characters.'),
);

export const forms = {
  login: z.object({ email, password: currentPassword }),
  register: z.object({
    email: email.refine(isGmailAddress, gmailMessage),
    fullName,
    password,
  }),
  email: z.object({ email }),
  verify: z.object({ password: currentPassword }),
  reset: z.object({ password }),
  change: z.object({ currentPassword, password }),
  removeAccount: z.object({
    password: currentPassword,
    confirmation: z.literal('DELETE', { error: 'Type DELETE to confirm.' }),
  }),
  profile: z.object({
    fullName,
    bio: z.string().trim().max(500, 'Use at most 500 characters.'),
  }),
  preferences: z.object({ emailUpdates: z.boolean() }),
};
