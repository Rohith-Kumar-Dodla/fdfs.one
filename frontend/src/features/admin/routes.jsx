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
