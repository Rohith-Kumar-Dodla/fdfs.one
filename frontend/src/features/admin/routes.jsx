import { AccountGuard } from '../auth/guards.jsx';

const submissionPage = (name) => async () => ({
  Component: (await import('./Submissions.jsx'))[name],
});
const adminSubmissionPage = (name) => async () => {
  const Page = (await import('./Submissions.jsx'))[name];
  return { Component: () => <Page admin /> };
};
const adminTalentPage = (name) => async () => ({
  Component: (await import('../talent/Admin.jsx'))[name],
});
const filmPage = (name) => async () => ({
  Component: (await import('../films/Manage.jsx'))[name],
});
const podcastPage = (name) => async () => ({
  Component: (await import('../podcasts/Admin.jsx'))[name],
});
const podcastModeration = (reports) => async () => {
  const { PodcastModeration } = await import('../podcasts/Moderation.jsx');
  return { Component: () => <PodcastModeration reports={reports} /> };
};

const livePage = (name, props) => async () => {
  const Page = (await import('../live/Manage.jsx'))[name];
  return { Component: () => <Page {...props} /> };
};

export const administrationRoutes = [
  {
    element: <AccountGuard verified roles={['admin']} />,
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
