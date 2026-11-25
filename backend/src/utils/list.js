import { z } from 'zod';
import { paginationSchema } from './pagination.js';
import { sendSuccess } from './responses.js';

export const publicId = z.uuid();
export const idParams = z.object({ id: publicId });
export function listInput(filters = {}) {
  return z.object({
    query: paginationSchema.extend(filters).refine(({ page }) => page <= 10000),
  });
}

export function searchPattern(text) {
  return new RegExp(RegExp.escape(text), 'i');
}

export async function sendList(
  res,
  model,
  filter,
  { page, limit },
  view,
  select,
  sort = { createdAt: -1, _id: -1 },
  configure = (query) => query,
) {
  const query = model
    .find(filter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
  if (select) query.select(select);
  configure(query);
  const [records, total] = await Promise.all([
    query.lean(),
    model.countDocuments(filter),
  ]);
  return sendSuccess(res, records.map(view), {
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
