import { publicHomeSections } from '../../../../shared/public-home.js';
import { Film } from '../films/models.js';
import { PodcastEpisode } from '../podcasts/models.js';
import { guestNames } from '../podcasts/read.js';
import { RatingTotals } from '../reviews/models.js';
import { discover } from './discovery.js';
import { trendingReviews } from '../reviews/community.js';
import { eligibleShortFilmProfiles } from '../talent/categories.js';

async function metadata(key, items) {
  const model =
    key === 'podcasts'
      ? PodcastEpisode
      : ['independent', 'original'].includes(key)
        ? Film
        : null;
  if (!model || !items.length) return items;
  const docs = await model
    .find({ publicId: { $in: items.map((item) => item.id) } })
    .select('publicId')
    .lean();
  const ids = new Map(docs.map((row) => [row.publicId, String(row._id)]));
  if (key === 'podcasts') {
    const guests = await guestNames(docs.map((row) => row._id));
    return items.map((item) => ({
      ...item,
      guests: guests.get(ids.get(item.id)) ?? [],
    }));
  }
  const totals = await RatingTotals.find({
    targetType: key === 'independent' ? 'cinema' : 'original',
    target: { $in: docs.map((row) => row._id) },
    count: { $gt: 0 },
  })
    .select('target count sum')
    .lean();
  const ratings = new Map(
    totals.map((row) => [String(row.target), row.sum / (row.count * 2)]),
  );
  return items.map((item) => ({
    ...item,
    rating: ratings.get(ids.get(item.id)),
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
            items = (await discover(key, { ids: fallback, limit, now })).items;
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
            const artwork = (
              await discover('movies', {
                slugs: data.map((item) => item.target.slug),
                limit: data.length || 1,
                now,
              })
            ).items;
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
            items = (await discover(key, { limit, now })).items;
          }
          const output = [
            ...new Map(
              [...featured, ...items].map((item) => [item.id, item]),
            ).values(),
          ].slice(0, limit);
          return {
            ...entry,
            items: await metadata(key, output),
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
