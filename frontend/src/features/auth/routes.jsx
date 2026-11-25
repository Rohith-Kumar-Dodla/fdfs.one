import { AccountGuard } from './guards.jsx';

export const accountRoutes = [
  ...[
    ['/login', 'LoginPage'],
    ['/register', 'RegisterPage'],
    ['/verification-pending', 'VerificationPendingPage'],
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
