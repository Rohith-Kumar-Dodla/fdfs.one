export const reviewTargets = ['movie', 'cinema', 'original'];
export const reportReasons = [
  'harassment',
  'spam',
  'inappropriate',
  'spoiler',
  'impersonation',
  'other',
];
export const reviewGenres = {
  action: 'Action',
  adventure: 'Adventure',
  crime: 'Crime',
  family: 'Family',
  history: 'History',
  music: 'Music',
  mystery: 'Mystery',
  war: 'War',
  western: 'Western',
};
export const moviePath = (slug) => '/movies/' + slug;
export const reviewTargetPath = (type, slug) =>
  type === 'movie'
    ? moviePath(slug)
    : (type === 'cinema' ? '/cinema/' : '/originals/') + slug;
