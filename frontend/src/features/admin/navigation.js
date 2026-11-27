import { can } from '../../../../shared/admin.js';

const overview = ['/admin', 'Overview', 'dashboard'];
const support = ['/admin/support', 'Support Tickets', 'support'];
const media = ['/admin/media', 'Media Library', 'media'];
const promotions = ['/admin/promotions', 'Promotions', 'promotions'];
const homepage = ['/admin/homepage', 'Homepage Management', 'site'];

export const groups = [
  ['Overview', '/admin', [overview]],
  [
    'Content',
    '/admin/content',
    [
      ['/admin/cinema', 'FDFS Cinema', 'content', 'independent'],
      ['/admin/originals', 'FDFS Originals', 'content', 'original'],
      ['/admin/podcasts', '404 Reality Not Found', 'content', 'podcasts'],
      ['/admin/live', 'FDFS Live', 'content', 'live'],
      ['/admin/movies', 'Movies & Reviews', 'content', 'movies'],
      ['/admin/talent', 'Talent Profiles', 'content', 'talent'],
    ],
  ],
  [
    'Reviews',
    '/admin/review-moderation?view=reviews',
    [['/admin/review-moderation', 'Reports and Moderation', 'moderation']],
  ],
  [
    'Community',
    '/admin/community',
    [
      ['/admin/users', 'Users', 'users'],
      ['/admin/roles', 'Roles and Permissions', 'roles'],
      [
        '/admin/submissions',
        'Creator and Organizer Submissions',
        'submissions',
      ],
      ['/admin/reports', 'Community Moderation', 'moderation'],
      ['/admin/moderation', 'Comments and Chat Moderation', 'moderation'],
    ],
  ],
  ['Support Tickets', '/admin/support', [support]],
  ['Media Library', '/admin/media', [media]],
  ['Promotions', '/admin/promotions', [promotions]],
  ['Homepage Management', '/admin/homepage', [homepage]],
  [
    'System',
    '/admin/system',
    [
      ['/admin/settings', 'Website Settings', 'site'],
      ['/admin/analytics', 'Platform Analytics', 'analytics'],
      ['/admin/activity', 'Live Activity', 'analytics'],
      [
        '/admin/announcements',
        'Notifications and Announcements',
        'announcements',
      ],
      ['/admin/system-health', 'System Health', 'operations'],
      ['/admin/audit', 'Audit Logs', 'audit'],
      ['/admin/security', 'Security and Sessions', 'users'],
    ],
  ],
];

export function visibleGroups(account) {
  return groups
    .map(([name, path, entries]) => [
      name,
      path,
      entries.filter(([, , permission, module]) =>
        permission === 'submissions'
          ? can(account, 'moderation') ||
            ['independent', 'original', 'podcasts', 'live', 'talent'].some(
              (item) => can(account, 'content', item),
            )
          : can(account, permission, module),
      ),
    ])
    .filter(([, , entries]) => entries.length);
}

export function currentWorkspace(pathname) {
  if (/^\/admin\/films(?:\/|$)/.test(pathname)) return groups[1];
  return groups.find(
    ([, path, entries]) =>
      pathname === path ||
      entries.some(
        ([entry]) => entry !== '/admin' && pathname.startsWith(entry + '/'),
      ) ||
      entries.some(([entry]) => pathname === entry),
  );
}
