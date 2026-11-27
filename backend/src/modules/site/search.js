import { z } from 'zod';
import { discoveryModules, sources } from '../../../../shared/homepage.js';
import { genres } from '../../../../shared/films.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { listInput } from '../../utils/list.js';
import { allowedSource } from './homepage.js';
import { discover } from './discovery.js';
import { normalizedName } from '../talent/models.js';

const genre = z.enum(Object.keys({ ...genres, ...reviewGenres }));
export const searchInput = listInput({
  q: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .refine((value) => /[\p{L}\p{N}]/u.test(value))
    .optional(),
  genre: genre.optional(),
  module: z.enum(discoveryModules).optional(),
}).refine(({ query }) => Boolean(query.q || query.genre) && query.page <= 100);
export const suggestInput = z.object({
  query: z.object({
    q: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .refine((value) => /[\p{L}\p{N}]/u.test(value)),
  }),
});
const eligibleGenres = ['independent', 'original', 'movies'];
function score(row, q) {
  const title = normalizedName(row.title);
  const text = normalizedName(q);
  return title === text ? 0 : title.startsWith(text) ? 1 : 2;
}
export async function globalSearch(
  { q, genre, module, page = 1, limit = 8, suggest = false },
  hidden = [],
) {
  const groups = (module ? [module] : discoveryModules).filter(
    (key) =>
      allowedSource(key, hidden) && (!genre || eligibleGenres.includes(key)),
  );
  const bounded = suggest ? 2 : Math.min(limit, 12);
  const results = await Promise.all(
    groups.map(async (key) => {
      const { items, count } = await discover(key, {
        q,
        genre,
        mode: 'public',
        page,
        limit: bounded,
        withCount: !suggest,
        hiddenModules: hidden,
      });
      if (q)
        items.sort(
          (a, b) =>
            score(a, q) - score(b, q) ||
            a.title.localeCompare(b.title) ||
            a.id.localeCompare(b.id),
        );
      return {
        module: key,
        label: sources[key].label,
        items,
        count,
        totalPages: Math.ceil(count / bounded),
      };
    }),
  );
  return {
    groups: results,
    page,
    limit: bounded,
    doesMatch: results.some((group) => group.count > 0),
  };
}
