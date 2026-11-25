import { z } from 'zod';

function positiveInteger(max) {
  return z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(max));
}

export const paginationSchema = z.object({
  page: positiveInteger(Number.MAX_SAFE_INTEGER).default(1),
  limit: positiveInteger(100).default(20),
});
