import {
  defaultHomepage,
  homepageSections,
  permittedRail,
  placementKey,
  sources,
} from '../../../../shared/homepage.js';
import { publicHeroLimit } from '../../../../shared/public-home.js';
import { refinedSections } from './public-home.js';
import { genres } from '../../../../shared/films.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { trendingReviews } from '../reviews/community.js';
import {
  discover,
  discoveryAssets,
  discoveryImage,
  genresForHomepage,
  featureForReference,
  publicPodcastShow,
  resolveFeatures,
} from './discovery.js';
import { activePromotions } from './promotions.js';
import { readConfig } from './service.js';

const genreNames = { ...genres, ...reviewGenres };
const open = ({ startAt, endAt }, now) =>
  (!startAt || new Date(startAt) <= now) && (!endAt || new Date(endAt) > now);
const origins = {
  independent: '/cinema',
  original: '/originals',
  movies: '/reviews',
  reviews: '/reviews',
};
export const allowedSource = (module, hidden = []) =>
  !hidden.includes(origins[module] ?? sources[module]?.path);
const statusLabel = (item) =>
  item.live
    ? 'Watch Live'
    : item.module === 'live'
      ? item.upcoming
        ? 'View Event'
        : 'Watch Replay'
      : item.module === 'movies'
        ? 'Explore Movie'
        : item.module === 'talent'
          ? 'View Profile'
          : item.module === 'reviews'
            ? 'Read Review'
            : item.upcoming
              ? 'Learn More'
              : item.module === 'podcasts'
                ? 'Watch Episode'
                : 'Watch Film';
const featureSlide = (item, override = {}) => ({
  ...item,
  title: override.title ?? item.title,
  summary: override.description ?? item.summary,
  image: override.image ?? item.landscape ?? item.image,
  mobile: override.mobile,
  focal: override.focal,
  primary: { label: statusLabel(item), href: item.path },
  ...(item.reminder && {
    secondary: { label: 'Set Reminder', href: item.path + '#live-reminder' },
  }),
});
const referenceList = (config) => [
  ...(config.hero?.featured ? [config.hero.featured] : []),
  ...(config.heroSlides ?? []).flatMap((slide) =>
    slide.target ? [slide.target] : [],
  ),
  ...Object.values(config.featuredPicks ?? {}).flat(),
  ...config.sections.flatMap((section) => section.items ?? []),
];
const orderByDate = (items, ascending = false) =>
  items.sort(
    (a, b) =>
      (ascending ? 1 : -1) *
        (Date.parse(a.date ?? 0) - Date.parse(b.date ?? 0)) ||
      a.id.localeCompare(b.id),
  );
function campaigns(items, slot, sectionId, limit = 2) {
  const key = placementKey({ slot, sectionId });
  return items
    .filter((row) =>
      row.placements.some((placement) => placementKey(placement) === key),
    )
    .slice(0, limit)
    .map(({ placements: _placements, ...item }) => ({
      ...item,
      placement: key,
    }));
}
const trendProjection = (row) => ({
  id: row.id,
  module: 'reviews',
  title:
    !row.spoiler && row.title ? row.title : 'Review of ' + row.target.title,
  summary: row.target.title,
  path: '/reviews/' + row.id,
  date: row.createdAt,
  spoiler: row.spoiler,
  likes: row.likes,
  comments: row.comments,
  rating: row.rating,
});
async function rowsForSections(modules, mode, options, allow, logger) {
  const found = await Promise.allSettled(
    modules
      .filter(allow)
      .map((module) => discover(module, { ...options, mode })),
  );
  if (found.some((row) => row.status === 'rejected'))
    logger?.warn('A homepage content query was unavailable');
  return found.flatMap((row) =>
    row.status === 'fulfilled' ? row.value.items : [],
  );
}

export async function assembledHomepage({
  preview = false,
  refined = false,
  now = new Date(),
  logger,
  settings: providedSettings,
} = {}) {
  const [record, settings] = await Promise.all([
    readConfig('homepage'),
    providedSettings ?? readConfig('settings').then(({ value }) => value),
  ]);
  const stored = preview ? record.value : record.published;
  const config = { ...defaultHomepage, ...stored };
  config.sections = homepageSections(stored);
  const hidden = settings.hiddenModules ?? [];
  const allow = (module) => allowedSource(module, hidden);
  const visible = config.sections.filter(
    (row) => row.visible && open(row, now),
  );
  const refs = referenceList(config).filter((row) => allow(row.module));
  let show;
  const discovery = {
    podcastShow: () => (show ??= publicPodcastShow().exec()),
    recordIds: refined ? new Map() : undefined,
  };
  const safe = async (operation, fallback) => {
    try {
      return await operation();
    } catch {
      logger?.warn('An optional homepage section was unavailable');
      return fallback;
    }
  };
  const assetIds = [
    config.hero?.imageId,
    ...(config.heroSlides ?? []).flatMap((slide) => [
      slide.imageId,
      slide.mobileId,
    ]),
    ...(config.genres ?? []).map((row) => row.imageId),
  ];
  const [art, selected, promotions] = await Promise.all([
    safe(() => discoveryAssets(assetIds), new Map()),
    safe(
      () =>
        resolveFeatures(refs, {
          allowUpcoming: true,
          now,
          hiddenModules: hidden,
          ...discovery,
        }),
      new Map(),
    ),
    safe(() => activePromotions(now, hidden), { items: [] }),
  ]);
  const get = (ref) => featureForReference(selected, ref);
  const explore = visible.some((section) => section.type === 'explore')
    ? '#explore'
    : (Object.keys(sources)
        .filter(allow)
        .map((key) => sources[key].path)[0] ?? '/support');
  const media = (id) => discoveryImage(art.get(id));
  const cache = new Map();
  const releasedQueries = new Map();
  const readReleased = async (module, limit) => {
    if (!releasedQueries.has(module))
      releasedQueries.set(
        module,
        discover(module, { now, ...discovery, limit: Math.max(2, limit) }),
      );
    return (await releasedQueries.get(module)).items.slice(0, limit);
  };
  const rows = (modules, mode, options = {}) => {
    const key = JSON.stringify([modules, mode, options]);
    if (!cache.has(key))
      cache.set(
        key,
        rowsForSections(
          modules,
          mode,
          { now, ...options, ...discovery },
          allow,
          logger,
        ),
      );
    return cache.get(key);
  };
  const released = [
    'independent',
    'original',
    'podcasts',
    ...(!refined ? ['movies'] : []),
  ];
  const upcoming = ['live', ...released];
  const canSlide = (item) =>
    !refined ||
    (item?.module === 'live' && (item.live || item.upcoming)) ||
    released.includes(item?.module);
  const heroCampaigns = campaigns(
    promotions.items,
    'hero',
    undefined,
    Number.MAX_SAFE_INTEGER,
  );
  const slides = config.heroSlides
    .toSorted((a, b) => (a.slot ?? 6) - (b.slot ?? 6))
    .filter(
      (slide) =>
        open(slide, now) &&
        (slide.campaignId
          ? heroCampaigns.some((item) => item.id === slide.campaignId)
          : get(slide.target) && canSlide(get(slide.target))),
    )
    .map((slide) =>
      slide.campaignId
        ? heroCampaigns.find((item) => item.id === slide.campaignId)
        : featureSlide(get(slide.target), {
            title: slide.title,
            description: slide.description,
            image: media(slide.imageId),
            mobile: media(slide.mobileId),
            focal: slide.focal,
          }),
    );
  if (!config.managedHero && config.hero && open(config.hero, now)) {
    const legacy = get(config.hero.featured);
    if (legacy && canSlide(legacy))
      slides.unshift(
        featureSlide(legacy, {
          title: config.hero.title,
          description: config.hero.description,
          image: media(config.hero.imageId),
        }),
      );
    else if (!refined && !config.hero.featured)
      slides.unshift({
        id: 'editorial',
        title: config.hero.title,
        summary: config.hero.description,
        image: media(config.hero.imageId),
        primary: { label: 'Explore FDFS', href: explore },
      });
  }
  if (!config.managedHero)
    slides.unshift(
      ...heroCampaigns
        .filter((item) => !slides.some((slide) => slide.id === item.id))
        .slice(0, 3),
    );
  const refinedRows = refined
    ? refinedSections({
        visible,
        picks: config.featuredPicks,
        selected: get,
        promotions: promotions.items,
        hidden,
        allow,
        now,
        safe,
        campaigns,
        recordIds: discovery.recordIds,
        readReleased,
      })
    : undefined;
  if (
    !config.managedHero &&
    !slides.length &&
    (!refined || (!config.heroSlides.length && !config.hero?.featured))
  ) {
    const four = await Promise.all([
      rows(['live'], 'live', { limit: 1 }),
      refined
        ? Promise.all(
            released
              .filter(allow)
              .map((module) => safe(() => readReleased(module, 2), [])),
          ).then((results) => results.flat())
        : rows(released, 'released', { limit: 2 }),
      rows(upcoming, 'upcoming', { limit: 1 }),
    ]);
    const selectedDefault = [
      ...four[0],
      ...orderByDate(four[1]).slice(0, 4),
      ...orderByDate(four[2], true).slice(0, 2),
    ];
    slides.push(...selectedDefault.map((item) => featureSlide(item)));
  }
  const sections = refinedRows
    ? await refinedRows
    : (
        await Promise.all(
          visible.map((section) =>
            safe(async () => {
              const limit = section.limit ?? 8;
              let items = [];
              let more = section.module
                ? sources[section.module].path
                : undefined;
              switch (section.type) {
                case 'explore':
                  break;
                case 'promotion':
                  break;
                case 'featured':
                  items = section.items
                    .map(get)
                    .filter(Boolean)
                    .slice(0, limit);
                  break;
                case 'latest':
                  items = await rows([section.module], 'released', { limit });
                  break;
                case 'live':
                  items = await rows(['live'], 'live', { limit });
                  more = '/live';
                  break;
                case 'upcoming':
                  items = orderByDate(
                    await rows(upcoming, 'upcoming', { limit }),
                    true,
                  ).slice(0, limit);
                  more = '/live';
                  break;
                case 'releases':
                  items = orderByDate(
                    await rows(released, 'released', {
                      limit,
                      releaseDays: config.releaseDays,
                    }),
                  ).slice(0, limit);
                  more = '/reviews/movies';
                  break;
                case 'popular':
                  items = await rows(['movies'], 'popular', { limit });
                  more = '/reviews/movies?sort=popular';
                  break;
                case 'trending':
                  if (allow('reviews'))
                    items = (
                      await trendingReviews(
                        { page: 1, limit, summary: true },
                        now,
                      )
                    ).data
                      .filter((row) =>
                        allow(
                          {
                            cinema: 'independent',
                            original: 'original',
                            movie: 'movies',
                          }[row.target.type],
                        ),
                      )
                      .map(trendProjection);
                  more = '/reviews/community?sort=trending';
                  break;
                case 'genres': {
                  const totals = await genresForHomepage(now, hidden);
                  const configured = config.genres.length
                    ? config.genres
                    : [...totals]
                        .sort(([a, m], [b, n]) => n - m || a.localeCompare(b))
                        .map(([genre]) => ({ genre }));
                  items = configured
                    .filter((row) => totals.has(row.genre))
                    .slice(0, limit)
                    .map(({ genre, imageId }) => ({
                      id: genre,
                      title: genreNames[genre],
                      count: totals.get(genre),
                      group: 'genre',
                      image: media(imageId),
                      path: '/search?genre=' + genre,
                    }))
                    .filter((row) => row.title);
                  break;
                }
              }
              if (
                more &&
                hidden.includes('/' + more.split('/')[1]?.split('?')[0])
              )
                more = undefined;
              const sponsored = permittedRail(section.type)
                ? campaigns(promotions.items, 'rail', section.id, 1)
                : [];
              const between = campaigns(
                promotions.items,
                'between',
                section.id,
                2,
              );
              if (
                section.type !== 'explore' &&
                !items.length &&
                !sponsored.length &&
                !between.length
              )
                return null;
              return {
                id: section.id,
                type: section.type,
                heading: section.heading,
                description: section.description,
                layout: section.layout ?? 'auto',
                items,
                more,
                sponsored,
                between,
              };
            }, null),
          ),
        )
      ).filter(Boolean);
  const next = [
    promotions.nextAt,
    ...[config.hero, ...config.heroSlides, ...config.sections]
      .filter(Boolean)
      .flatMap(({ startAt, endAt }) => [startAt, endAt]),
  ]
    .map((entry) => entry && new Date(entry))
    .filter((entry) => entry && entry > now)
    .sort((a, b) => a - b)[0];
  const shownSlides = [
    ...new Map(
      slides.map((slide) => [slide.module + ':' + slide.id, slide]),
    ).values(),
  ].slice(0, refined ? publicHeroLimit : 8);
  const used = new Set(
    shownSlides
      .filter((slide) => slide.module === 'promotion')
      .map((slide) => slide.id),
  );
  const distinctCampaigns = (items) =>
    (items ?? []).filter((item) => {
      if (used.has(item.id)) return false;
      used.add(item.id);
      return true;
    });
  return {
    serverNow: now,
    nextChangeAt: next,
    rotationSeconds: config.rotationSeconds,
    slides: shownSlides,
    sections: refined
      ? sections.map((section) => ({
          ...section,
          above: distinctCampaigns(section.above),
          sponsored: distinctCampaigns(section.sponsored),
          between: distinctCampaigns(section.between),
        }))
      : sections,
    footer: refined
      ? distinctCampaigns(campaigns(promotions.items, 'footer', undefined, 2))
      : campaigns(promotions.items, 'footer', undefined, 2),
  };
}
