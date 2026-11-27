export const saveTypes = [
  'independent',
  'original',
  'podcasts',
  'movies',
  'live',
];
export const progressTypes = ['independent', 'original', 'podcasts', 'live'];
export const preferenceDefaults = {
  genres: [],
  types: [],
  recommendations: false,
  history: false,
  talentNotices: false,
};
export const personalSections = {
  progress: 'Continue Watching',
  recommended: 'Recommended for You',
  watchlist: 'My Watchlist',
  followed: 'New releases from followed talent',
  reminders: 'Upcoming subscribed events',
};
export const personalConfigDefaults = {
  recommendations: true,
  recommendationLimit: 8,
  position: 'after-explore',
  sections: Object.keys(personalSections),
};
export const resumeMinimum = 10;
export const progressInterval = 15000;
export const completionFraction = 0.95;
