import { AccountGuard } from './guards.jsx';

export const accountRoutes = [
  ...[
    ['/login', 'LoginPage'],
    ['/register', 'RegisterPage'],
    ['/verification-pending', 'VerifyEmailPage'],
    ['/verify-email', 'VerifyEmailPage'],
    ['/forgot-password', 'ForgotPasswordPage'],
    ['/reset-password', 'ResetPasswordPage'],
  ].map(([path, name]) => ({
    path,
    lazy: async () => ({ Component: (await import('./AuthPages.jsx'))[name] }),
  })),
  {
    element: <AccountGuard />,
    children: [
      {
        path: '/dashboard',
        lazy: async () => ({
          Component: (await import('../personal/Dashboard.jsx')).Dashboard,
        }),
      },
      {
        path: '/dashboard/:tab',
        lazy: async () => ({
          Component: (await import('../personal/Dashboard.jsx')).Dashboard,
        }),
      },
      {
        path: '/account/notifications',
        lazy: async () => ({
          Component: (await import('../operations/NotificationsPage.jsx'))
            .NotificationsPage,
        }),
      },
      {
        path: '/account/reviews',
        lazy: async () => ({
          Component: (await import('../reviews/History.jsx')).ReviewHistory,
        }),
      },
      {
        path: '/account',
        lazy: async () => ({
          Component: (await import('./AccountPages.jsx')).AccountProfilePage,
        }),
      },
      {
        path: '/account/settings',
        lazy: async () => ({
          Component: (await import('./AccountPages.jsx')).AccountSettingsPage,
        }),
      },
    ],
  },
];
