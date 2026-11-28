import { useOutletContext } from 'react-router';
import { can } from '../../../../shared/admin.js';
import { EmptyState } from '../../components/ui/states.jsx';
import { AccountGuard } from '../auth/guards.jsx';

const submissionPage = (name) => async () => ({
  Component: (await import('./Submissions.jsx'))[name],
});
const adminSubmissionPage = (name) => async () => {
  const Page = (await import('./Submissions.jsx'))[name];
  return { Component: () => <Page admin /> };
};
const adminTalentPage = (name) => async () => ({
  Component: guarded(
    (await import('../talent/Admin.jsx'))[name],
    'content',
    'talent',
  ),
});
const filmPage = (name, props) => async () => {
  const Page = (await import('../films/Manage.jsx'))[name];
  return {
    Component: props?.classification
      ? guarded(() => <Page {...props} />, 'content', props.classification)
      : () => <Page {...props} />,
  };
};
const adminPage = (file, name, props) => async () => {
  const Page = (
    await (file === 'Site' ? import('./Site.jsx') : import('./Moderation.jsx'))
  )[name];
  return { Component: () => <Page {...props} /> };
};
const podcastPage = (name) => async () => ({
  Component: guarded(
    (await import('../podcasts/Admin.jsx'))[name],
    'content',
    'podcasts',
  ),
});
const podcastModeration = (reports) => async () => {
  const { PodcastModeration } = await import('../podcasts/Moderation.jsx');
  return {
    Component: guarded(
      () => <PodcastModeration reports={reports} />,
      'moderation',
    ),
  };
};

const livePage = (name, props) => async () => {
  const Page = (await import('../live/Manage.jsx'))[name];
  return {
    Component: props.admin
      ? guarded(() => <Page {...props} />, 'content', 'live')
      : () => <Page {...props} />,
  };
};

const guarded = (Page, permission, module) => () => (
  <StaffPermission permission={permission} module={module}>
    <Page />
  </StaffPermission>
);

function StaffPermission({ permission, module, children }) {
  return can(useOutletContext(), permission, module) ? (
    children
  ) : (
    <EmptyState title="Access restricted" />
  );
}
const operationsPage =
  (name, permission, support = false, props = {}) =>
  async () => {
    const Page = (
      await (support
        ? import('../operations/Support.jsx')
        : import('../operations/OpsAdmin.jsx'))
    )[name];
    return {
      Component: () => (
        <StaffPermission permission={permission}>
          <Page {...props} />
        </StaffPermission>
      ),
    };
  };

const promotionsPage = (name) => async () => {
  const Page = (await import('../discovery/PromotionsAdmin.jsx'))[name];
  return {
    Component: () => (
      <StaffPermission permission="promotions">
        <Page />
      </StaffPermission>
    ),
  };
};

const moviePage = (name) => async () => {
  const Page = (await import('../reviews/Admin.jsx'))[name];
  return {
    Component: () => (
      <StaffPermission permission="content" module="movies">
        <Page />
      </StaffPermission>
    ),
  };
};

export const administrationRoutes = [
  {
    element: (
      <AccountGuard
        verified
        roles={[
          'admin',
          'super_admin',
          'content_manager',
          'moderator',
          'support_agent',
        ]}
      />
    ),
    children: [
      {
        path: '/admin',
        lazy: async () => ({
          Component: (await import('./Admin.jsx')).AdminLayout,
        }),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('./Admin.jsx')).OverviewPage,
            }),
          },
          {
            path: 'content',
            lazy: async () => ({
              Component: (await import('./Workspace.jsx')).ContentWorkspace,
            }),
          },
          {
            path: 'community',
            lazy: async () => {
              const { WorkspaceRedirect } = await import('./Admin.jsx');
              return {
                Component: () => <WorkspaceRedirect name="Community" />,
              };
            },
          },
          {
            path: 'system',
            lazy: async () => ({
              Component: (await import('./Workspace.jsx')).SystemWorkspace,
            }),
          },
          {
            path: 'notifications',
            lazy: async () => {
              const { NotificationsPage } =
                await import('../operations/NotificationsPage.jsx');
              return { Component: () => <NotificationsPage administrator /> };
            },
          },
          {
            path: 'movies/requests',
            lazy: async () => {
              const { MovieRequestsAdmin } =
                await import('../reviews/MovieRequestsAdmin.jsx');
              return {
                Component: () => (
                  <StaffPermission permission="content" module="movies">
                    <MovieRequestsAdmin />
                  </StaffPermission>
                ),
              };
            },
          },
          {
            path: 'security',
            lazy: async () => {
              const { UsersPage } = await import('./Users.jsx');
              return {
                Component: guarded(() => <UsersPage sessions />, 'users'),
              };
            },
          },
          { path: 'movies', lazy: moviePage('MoviesAdmin') },
          { path: 'movies/new', lazy: moviePage('NewMovie') },
          { path: 'movies/:id', lazy: moviePage('ManageMovie') },
          {
            path: 'review-moderation/reviews/:id',
            lazy: async () => {
              const { ManageReview } =
                await import('../reviews/ReviewManagement.jsx');
              return {
                Component: () => (
                  <StaffPermission permission="moderation">
                    <ManageReview />
                  </StaffPermission>
                ),
              };
            },
          },
          {
            path: 'review-moderation',
            lazy: async () => {
              const { ReviewsModeration } =
                await import('../reviews/Moderation.jsx');
              return {
                Component: () => (
                  <StaffPermission permission="moderation">
                    <ReviewsModeration />
                  </StaffPermission>
                ),
              };
            },
          },
          {
            path: 'analytics',
            lazy: async () => {
              const { HistoricalAnalytics } =
                await import('../operations/Analytics.jsx');
              return {
                Component: () => (
                  <StaffPermission permission="analytics">
                    <HistoricalAnalytics />
                  </StaffPermission>
                ),
              };
            },
          },
          {
            path: 'activity',
            lazy: operationsPage('LiveActivity', 'analytics'),
          },
          {
            path: 'support',
            lazy: operationsPage('StaffTickets', 'support', true),
          },
          {
            path: 'support/:id',
            lazy: operationsPage('TicketDetail', 'support', true, {
              staff: true,
            }),
          },
          {
            path: 'announcements',
            lazy: operationsPage('AnnouncementList', 'announcements'),
          },
          {
            path: 'announcements/new',
            lazy: operationsPage('ManageAnnouncement', 'announcements'),
          },
          {
            path: 'announcements/:id',
            lazy: operationsPage('ManageAnnouncement', 'announcements'),
          },
          {
            path: 'system-health',
            lazy: operationsPage('SystemHealth', 'operations'),
          },
          {
            path: 'users',
            lazy: async () => ({
              Component: (await import('./Users.jsx')).UsersPage,
            }),
          },
          {
            path: 'users/:id',
            lazy: async () => ({
              Component: (await import('./Users.jsx')).UserDetailPage,
            }),
          },
          {
            path: 'roles',
            lazy: async () => ({
              Component: (await import('./Users.jsx')).RolesPage,
            }),
          },
          {
            path: 'roles/:id',
            lazy: async () => ({
              Component: (await import('./Users.jsx')).UserDetailPage,
            }),
          },
          { path: 'promotions', lazy: promotionsPage('PromotionsList') },
          { path: 'promotions/new', lazy: promotionsPage('ManagePromotion') },
          { path: 'promotions/:id', lazy: promotionsPage('ManagePromotion') },
          { path: 'homepage', lazy: adminPage('Site', 'HomepageAdmin') },
          { path: 'settings', lazy: adminPage('Site', 'SettingsAdmin') },
          {
            path: 'moderation',
            lazy: adminPage('Moderation', 'CommunityAdmin'),
          },
          {
            path: 'reports',
            lazy: adminPage('Moderation', 'CommunityAdmin', { reports: true }),
          },
          {
            path: 'moderation/live/:id',
            lazy: adminPage('Moderation', 'LiveModerationAdmin'),
          },
          {
            path: 'cinema',
            lazy: filmPage('AdminFilms', { classification: 'independent' }),
          },
          {
            path: 'cinema/new',
            lazy: filmPage('NewOriginal', { classification: 'independent' }),
          },
          {
            path: 'originals',
            lazy: filmPage('AdminFilms', { classification: 'original' }),
          },
          {
            path: 'originals/new',
            lazy: filmPage('NewOriginal', { classification: 'original' }),
          },
          { path: 'submissions', lazy: adminSubmissionPage('SubmissionList') },
          { path: 'talent', lazy: adminTalentPage('AdminTalentList') },
          { path: 'talent/new', lazy: adminTalentPage('AdminNewTalent') },
          { path: 'talent/:id', lazy: adminTalentPage('AdminTalentDetail') },
          { path: 'films', lazy: filmPage('AdminFilms') },
          { path: 'films/new', lazy: filmPage('NewOriginal') },
          { path: 'films/:id', lazy: filmPage('AdminFilmDetail') },
          { path: 'live', lazy: livePage('LiveManagement', { admin: true }) },
          { path: 'live/new', lazy: livePage('NewLiveEvent', { admin: true }) },
          {
            path: 'live/:id',
            lazy: livePage('ManageLiveEvent', { admin: true }),
          },
          { path: 'podcasts', lazy: podcastPage('AdminPodcasts') },
          { path: 'podcasts/show', lazy: podcastPage('AdminShow') },
          { path: 'podcasts/episodes/new', lazy: podcastPage('NewEpisode') },
          { path: 'podcasts/episodes/:id', lazy: podcastPage('ManageEpisode') },
          { path: 'podcasts/comments', lazy: podcastModeration(false) },
          { path: 'podcasts/reports', lazy: podcastModeration(true) },
          {
            path: 'submissions/:id',
            lazy: adminSubmissionPage('SubmissionDetail'),
          },
          {
            path: 'media',
            lazy: async () => ({
              Component: (await import('./Media.jsx')).MediaPage,
            }),
          },
          {
            path: 'audit',
            lazy: async () => ({
              Component: (await import('./Admin.jsx')).AuditPage,
            }),
          },
          {
            path: '*',
            element: <EmptyState title="Administration page unavailable" />,
          },
        ],
      },
    ],
  },
  {
    element: <AccountGuard verified roles={['organizer']} />,
    children: [
      { path: '/organizer/live', lazy: livePage('LiveManagement') },
      { path: '/organizer/live/new', lazy: livePage('NewLiveEvent') },
      { path: '/organizer/live/:id', lazy: livePage('ManageLiveEvent') },
      {
        path: '/organizer/live/:id/correction',
        lazy: livePage('ManageLiveEvent', { correction: true }),
      },
    ],
  },
  {
    element: <AccountGuard verified roles={['creator']} />,
    children: [
      { path: '/creator/films', lazy: filmPage('CreatorFilms') },
      { path: '/creator/films/new', lazy: filmPage('NewCreatorFilm') },
      {
        path: '/creator/films/:id/correction',
        lazy: filmPage('NewCreatorFilm'),
      },
    ],
  },
  {
    element: <AccountGuard verified />,
    children: [
      { path: '/submissions', lazy: submissionPage('SubmissionList') },
      { path: '/submissions/new', lazy: submissionPage('NewSubmissionPage') },
      { path: '/submissions/:id', lazy: submissionPage('SubmissionDetail') },
    ],
  },
];
