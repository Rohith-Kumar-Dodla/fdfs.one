import { escapeMarkup, publicPages } from '../../../../shared/public-pages.js';
import { sources } from '../../../../shared/homepage.js';
import { publicTargetStages } from '../reviews/community.js';
import { Review } from '../reviews/models.js';
import { models, sourceFilter } from './discovery.js';
import { allowedSource } from './homepage.js';

const limit = 1000;
const publicModules = [
  'independent',
  'original',
  'podcasts',
  'live',
  'movies',
  'talent',
];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reviewId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const pathEligible = (path, hidden) =>
  !hidden.some((root) => path === root || path.startsWith(root + '/'));

async function publicReviews(hidden, now) {
  if (hidden.includes('/reviews')) return [];
  const hiddenTargetTypes = Object.entries({
    cinema: '/cinema',
    original: '/originals',
  })
    .filter(([, path]) => hidden.includes(path))
    .map(([type]) => type);
  const rows = await Review.aggregate([
    {
      $match: {
        status: 'published',
        spoiler: { $ne: true },
        targetType: { $nin: hiddenTargetTypes },
      },
    },
    { $sort: { createdAt: -1, _id: -1 } },
    { $limit: limit * 4 },
    ...publicTargetStages(now),
    { $match: { 'titleRecord.slug': { $type: 'string' } } },
    { $limit: limit },
    { $project: { _id: 0, publicId: 1 } },
  ]);
  return rows
    .filter(({ publicId }) => reviewId.test(publicId))
    .map(({ publicId }) => '/reviews/' + publicId);
}

export async function publicSitemap(origin, hidden = [], now = new Date()) {
  const [catalogues, reviews] = await Promise.all([
    Promise.all(
      publicModules
        .filter((module) => allowedSource(module, hidden))
        .map(async (module) => {
          const filter = await sourceFilter(module, { now, mode: 'public' });
          const rows = await models[module]
            .find(filter)
            .sort({ _id: -1 })
            .limit(limit)
            .select('slug -_id')
            .lean();
          const root = module === 'movies' ? '/movies' : sources[module].path;
          return rows
            .filter(({ slug }) => slugPattern.test(slug))
            .map(({ slug }) => root + '/' + slug);
        }),
    ),
    publicReviews(hidden, now),
  ]);
  const paths = new Set([
    ...Object.keys(publicPages).filter((path) => pathEligible(path, hidden)),
    ...catalogues.flat(),
    ...reviews,
  ]);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [...paths]
      .map(
        (path) =>
          '  <url><loc>' +
          escapeMarkup(new URL(path, origin).href) +
          '</loc></url>',
      )
      .join('\n') +
    '\n</urlset>\n'
  );
}
