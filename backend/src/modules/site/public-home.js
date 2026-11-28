import { publicHomeSections } from '../../../../shared/public-home.js';
import { guestNames } from '../podcasts/read.js';
import { RatingTotals } from '../reviews/models.js';
import { discover, refKey } from './discovery.js';
import { trendingReviews } from '../reviews/community.js';
import { eligibleShortFilmProfiles } from '../talent/categories.js';

async function metadata(key, items, recordIds) {
  if (!['podcasts', 'independent', 'original'].includes(key) || !items.length)
    return items;
  const ids = items.map((item) => recordIds.get(refKey(item))).filter(Boolean);
  if (key === 'podcasts') {
    const guests = await guestNames(ids);
    return items.map((item) => ({
      ...item,
      guests: guests.get(String(recordIds.get(refKey(item)))) ?? [],
    }));
  }
  const totals = await RatingTotals.find({
    targetType: key === 'independent' ? 'cinema' : 'original',
    target: { $in: ids },
    count: { $gt: 0 },
  })
    .select('target count sum')
    .lean();
  const ratings = new Map(
    totals.map((row) => [String(row.target), row.sum / (row.count * 2)]),
  );
  return items.map((item) => ({
    ...item,
    rating: ratings.get(String(recordIds.get(refKey(item)))),
  }));
}
export async function refinedSections({
  visible,
  picks,
  selected,
  promotions,
  hidden,
  allow,
  now,
  safe,
  campaigns,
  recordIds,
  readReleased,
}) {
  return Promise.all(
    publicHomeSections.map((entry) =>
      safe(
        async () => {
          const { key } = entry;
          if (!allow(key)) return { ...entry, items: [] };
          const curated = visible.filter(
            (row) =>
              row.type === 'featured' &&
              row.items.some((item) => item.module === key),
          );
          const natural = visible.filter(
            (row) => row.type === 'latest' && row.module === key,
          );
          const slots = [
            ...visible.filter(
              (row) => curated.includes(row) || natural.includes(row),
            ),
          ];
          const limit = slots[0]?.limit ?? 8;
          const configured =
            picks?.[key] ??
            curated.flatMap((row) =>
              row.items.filter((item) => item.module === key),
            );
          let featured = configured
            .map(selected)
            .filter((item) => item && !item.upcoming);
          let items;
          if (key === 'talent') {
            const [picked, fallback] = await Promise.all([
              eligibleShortFilmProfiles(
                featured.map((item) => item.id),
                now,
                hidden,
                96,
              ),
              eligibleShortFilmProfiles(undefined, now, hidden, limit),
            ]);
            featured = featured.filter((item) => picked.includes(item.id));
            items = fallback.length
              ? (await discover(key, { ids: fallback, limit, now })).items
              : [];
          } else if (key === 'reviews') {
            const { data } = await trendingReviews(
              {
                page: 1,
                limit: Math.min(24, limit + featured.length),
                type: 'movie',
                summary: true,
                sort: 'recent',
                preferredIds: featured.map((item) => item.id),
              },
              now,
            );
            const artwork = data.length
              ? (
                  await discover('movies', {
                    slugs: data.map((item) => item.target.slug),
                    limit: data.length,
                    now,
                  })
                ).items
              : [];
            const images = new Map(
              artwork.map((item) => [item.slug, item.image ?? item.landscape]),
            );
            items = data.map((item) => ({
              id: item.id,
              module: key,
              title: item.target.title,
              path: '/reviews/' + item.id,
              image: images.get(item.target.slug),
              rating: item.rating,
              author: item.author?.name,
              excerpt: item.spoiler ? undefined : item.body,
              spoiler: item.spoiler,
            }));
            featured = [];
          } else {
            items = await readReleased(key, limit);
          }
          const output = [
            ...new Map(
              [...featured, ...items].map((item) => [item.id, item]),
            ).values(),
          ].slice(0, limit);
          return {
            ...entry,
            items: await metadata(key, output, recordIds),
            above: campaigns(promotions, 'above', entry.placementId, 1),
            sponsored: slots.flatMap((row) =>
              campaigns(promotions, 'rail', row.id, 1),
            ),
            between: slots
              .flatMap((row) => campaigns(promotions, 'between', row.id, 1))
              .concat(campaigns(promotions, 'below', entry.placementId, 1)),
          };
        },
        { ...entry, items: [], unavailable: true },
      ),
    ),
  );
}
