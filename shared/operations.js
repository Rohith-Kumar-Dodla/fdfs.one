export const supportCategories = {
  account: 'Account and authentication',
  playback: 'Video playback',
  live: 'Live streaming',
  corrections: 'Content corrections',
  copyright: 'Copyright concerns',
  technical: 'Technical problems',
  safety: 'Community safety',
  feedback: 'General feedback',
  other: 'Other',
};
export const ticketStatuses = [
  'open',
  'in_progress',
  'awaiting_user',
  'resolved',
  'closed',
];
export const priorities = ['low', 'medium', 'high', 'urgent'];
export const announcementTypes = [
  'general',
  'maintenance',
  'content',
  'live',
  'community',
];
export const audiences = ['public', 'authenticated', 'creator', 'organizer'];
export const presenceModules = [
  'home',
  'account',
  'dashboard',
  'cinema',
  'originals',
  'podcasts',
  'live',
  'talent',
  'reviews',
  'support',
  'other',
];
export const deviceCategories = ['mobile', 'tablet', 'desktop', 'unknown'];
export const supportMaxBytes = 2 * 1024 * 1024;
export const supportMaxImages = 3;
export const presenceDefaults = {
  heartbeatMs: 30000,
  staleMs: 90000,
  idleMs: 300000,
  updateMs: 5000,
  maxConnections: 10000,
};
export const analyticsDefaults = {
  enabled: true,
  rawDays: 30,
  aggregateDays: 365,
  timezone: 'Asia/Kolkata',
};
