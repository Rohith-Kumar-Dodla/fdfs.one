import { describe, expect, it } from 'vitest';
import { visibleGroups } from '../src/features/admin/navigation.js';

const paths = (account) =>
  visibleGroups(account).flatMap(([, , entries]) =>
    entries.map(([path]) => path),
  );

describe('CMS navigation', () => {
  it('gives the owner a dedicated Reviews workspace', () => {
    expect(
      visibleGroups({ roles: ['super_admin'] }).map(([name]) => name),
    ).toEqual([
      'Overview',
      'Content',
      'Reviews',
      'Community',
      'Support Tickets',
      'Media Library',
      'Promotions',
      'Homepage Management',
      'System',
    ]);
  });
  it('exposes only assigned modules and shared media to a content manager', () => {
    expect(
      paths({
        roles: ['viewer', 'content_manager'],
        cmsModules: ['independent'],
      }),
    ).toEqual([
      '/admin',
      '/admin/cinema',
      '/admin/submissions',
      '/admin/media',
    ]);
  });

  it('isolates moderation and reserves role assignment for the Super Administrator', () => {
    expect(paths({ roles: ['moderator'] })).toEqual([
      '/admin',
      '/admin/review-moderation',
      '/admin/submissions',
      '/admin/reports',
      '/admin/moderation',
    ]);
    expect(paths({ roles: ['support_agent'] })).toEqual(['/admin/support']);
    expect(paths({ roles: ['admin'] })).not.toContain('/admin/roles');
    expect(paths({ roles: ['super_admin'] })).toContain('/admin/roles');
  });
});
