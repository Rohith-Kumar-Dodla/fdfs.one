import { AccountGuard } from '../auth/guards.jsx';

const submissionPage = (name) => async () => ({
  Component: (await import('./Submissions.jsx'))[name],
});
const adminSubmissionPage = (name) => async () => {
  const Page = (await import('./Submissions.jsx'))[name];
  return { Component: () => <Page admin /> };
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
    element: <AccountGuard verified />,
    children: [
      { path: '/submissions', lazy: submissionPage('SubmissionList') },
      { path: '/submissions/new', lazy: submissionPage('NewSubmissionPage') },
      { path: '/submissions/:id', lazy: submissionPage('SubmissionDetail') },
    ],
  },
];
