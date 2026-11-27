import { can } from '../../../../shared/admin.js';

export const groups = [
  [
    'Overview',
    [
      ['/admin', 'Overview', 'dashboard'],
      ['/admin/analytics', 'Analytics', 'analytics'],
      ['/admin/activity', 'Live activity', 'analytics'],
    ],
  ],
  [
    'Content',
    [
      ['/admin/cinema', 'Cinema', 'content', 'independent'],
      ['/admin/movies', 'Movies', 'content', 'movies'],
      ['/admin/originals', 'Originals', 'content', 'original'],
      ['/admin/podcasts', '404 Reality Not Found', 'content', 'podcasts'],
      ['/admin/live', 'Live Events', 'content', 'live'],
      ['/admin/talent', 'Talent Profiles', 'content', 'talent'],
    ],
  ],
  [
    'Community',
    [
      ['/admin/users', 'Users', 'users'],
      ['/admin/roles', 'Roles and Permissions', 'roles'],
      ['/admin/submissions', 'Submissions', 'submissions'],
      ['/admin/moderation', 'Comments and Live Chat', 'moderation'],
      ['/admin/reports', 'Reports and Moderation', 'moderation'],
      ['/admin/review-moderation', 'Review moderation', 'moderation'],
      ['/admin/support', 'Support tickets', 'support'],
    ],
  ],
  [
    'Platform',
    [
      ['/admin/media', 'Media library', 'media'],
      ['/admin/promotions', 'Promotions', 'promotions'],
      ['/admin/homepage', 'Homepage Management', 'site'],
      ['/admin/settings', 'Website Settings', 'site'],
      ['/admin/announcements', 'Announcements', 'announcements'],
    ],
  ],
  [
    'System',
    [
      ['/admin/audit', 'Audit Logs', 'audit'],
      ['/admin/system-health', 'System health', 'operations'],
    ],
  ],
];

export const quickActions = [
  ['/admin/cinema/new', 'Add Film', 'independent'],
  ['/admin/movies/new', 'Add Movie', 'movies'],
  ['/admin/originals/new', 'Add Original', 'original'],
  ['/admin/podcasts/episodes/new', 'Add Podcast Episode', 'podcasts'],
  ['/admin/live/new', 'Create Live Event', 'live'],
  ['/admin/talent/new', 'Add Talent Profile', 'talent'],
];

export function visibleGroups(account) {
  return groups
    .map(([name, entries]) => [
      name,
      entries.filter(([, , permission, module]) =>
        permission === 'submissions'
          ? can(account, 'moderation') ||
            ['independent', 'original', 'podcasts', 'live', 'talent'].some(
              (item) => can(account, 'content', item),
            )
          : can(account, permission, module),
      ),
    ])
    .filter(([, entries]) => entries.length);
}
