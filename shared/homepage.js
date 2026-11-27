export const sources = {
  independent: { label: 'Cinema', path: '/cinema', shape: 'poster' },
  original: { label: 'FDFS Originals', path: '/originals', shape: 'poster' },
  podcasts: {
    label: '404 Reality Not Found',
    path: '/podcasts',
    shape: 'landscape',
  },
  live: { label: 'FDFS Live', path: '/live', shape: 'landscape' },
  movies: { label: 'Movies', path: '/reviews/movies', shape: 'poster' },
  reviews: {
    label: 'Community reviews',
    path: '/reviews/community',
    shape: 'landscape',
  },
  talent: { label: 'Talent Profiles', path: '/talent', shape: 'portrait' },
};
export const discoveryModules = Object.keys(sources);
export const layouts = ['auto', 'poster', 'landscape', 'portrait', 'grid'];
export const sectionKinds = [
  'explore',
  'featured',
  'latest',
  'live',
  'upcoming',
  'releases',
  'genres',
  'popular',
  'trending',
  'promotion',
];
export const promotionTypes = {
  content: 'Internal content',
  event: 'Event',
  product: 'Product',
  sponsored: 'Sponsored campaign',
  announcement: 'Platform announcement',
  external: 'External campaign',
};
export const placementTypes = {
  hero: 'Hero carousel',
  above: 'Above a homepage section',
  below: 'Below a homepage section',
  between: 'Between sections',
  rail: 'In a content rail',
  footer: 'Before the footer',
};
export const permittedRail = (type) =>
  sectionKinds.includes(type) &&
  !['explore', 'genres', 'promotion'].includes(type);
export const placementKey = ({ slot, sectionId }) =>
  [slot, sectionId].filter(Boolean).join(':');
const defaults = [
  ['explore', 'Explore FDFS'],
  ['live', 'Live now'],
  ['latest', 'Featured short films', 'independent'],
  ['promotion', 'Promotions'],
  ['latest', 'Featured FDFS Originals', 'original'],
  ['latest', 'Featured podcasts', 'podcasts'],
  ['upcoming', 'Upcoming events and releases'],
  ['releases', 'New releases'],
  ['genres', 'Browse by genre'],
  ['popular', 'Popular movies'],
  ['trending', 'Trending reviews'],
  ['latest', 'Featured Talent Profiles', 'talent'],
];
export const defaultSections = defaults.map(
  ([type, heading, module], index) => ({
    id: 'c1f00000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
    type,
    heading,
    visible: true,
    module,
    limit: 8,
    items: [],
    layout: 'auto',
  }),
);
export const homepageSections = (config) =>
  !config || (!Object.hasOwn(config, 'heroSlides') && !config.sections?.length)
    ? defaultSections
    : config.sections;
export const defaultHomepage = {
  sections: defaultSections,
  heroSlides: [],
  rotationSeconds: 0,
  releaseDays: 30,
  genres: [],
};
