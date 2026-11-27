export const contentModules = [
  'independent',
  'original',
  'podcasts',
  'live',
  'talent',
  'movies',
  'promotions',
];
export const staffRoles = [
  'super_admin',
  'admin',
  'content_manager',
  'moderator',
  'support_agent',
];
export const roleLabels = {
  viewer: 'Viewer',
  creator: 'Creator',
  organizer: 'Organizer',
  super_admin: 'Super Administrator',
  admin: 'Administrator',
  content_manager: 'Content Manager',
  moderator: 'Moderator',
  support_agent: 'Support Agent',
};

const permissions = new Set([
  'dashboard',
  'roles',
  'users',
  'audit',
  'content',
  'media',
  'media_manage',
  'moderation',
  'site',
  'analytics',
  'support',
  'announcements',
  'promotions',
  'operations',
]);

export function can(account, permission, module) {
  if (
    !permissions.has(permission) ||
    (permission === 'content' && !contentModules.includes(module))
  )
    return false;
  const roles = account?.roles ?? [];
  if (roles.includes('super_admin')) return true;
  if (permission === 'roles') return false;
  if (permission === 'promotions')
    return (
      roles.includes('content_manager') &&
      account.cmsModules?.includes('promotions')
    );
  if (roles.includes('admin')) return true;
  if (permission === 'support') return roles.includes('support_agent');
  if (permission === 'dashboard')
    return roles.includes('content_manager') || roles.includes('moderator');
  if (permission === 'moderation') return roles.includes('moderator');
  if (permission === 'content')
    return (
      roles.includes('content_manager') && account.cmsModules?.includes(module)
    );
  if (permission === 'media')
    return roles.includes('content_manager') && account.cmsModules?.length > 0;
  return false;
}
