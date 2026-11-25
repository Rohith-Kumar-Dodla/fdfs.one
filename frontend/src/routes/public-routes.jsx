import { PublicLayout } from '../layouts/PublicLayout.jsx';
import { RouteError, RouteLoading, NotFound } from '../pages/RouteStates.jsx';
import { modules } from './modules.js';
import { accountRoutes } from '../features/auth/routes.jsx';
import { administrationRoutes } from '../features/admin/routes.jsx';

async function loadModulePage() {
  return { Component: (await import('../pages/ModulePending.jsx')).default };
}

const talentPage = (name) => async () => ({
  Component: (await import('../features/talent/Public.jsx'))[name],
});

export const publicRoutes = [
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <RouteLoading />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('../pages/Home.jsx')).default,
            }),
          },
          ...modules.flatMap((module) => [
            {
              path: module.path,
              handle: { module },
              lazy:
                module.path === '/talent'
                  ? talentPage('TalentDirectory')
                  : loadModulePage,
            },
            {
              path: module.detailPath ?? `${module.path}/:slug`,
              handle: { module },
              lazy:
                module.path === '/talent'
                  ? talentPage('TalentProfile')
                  : loadModulePage,
            },
          ]),
          ...accountRoutes,
          ...administrationRoutes,
          ...(import.meta.env.FDFS_DEV_SERVER
            ? [
                {
                  path: '/_dev/api',
                  lazy: async () => ({
                    Component: (await import('../pages/ApiDiagnostics.jsx'))
                      .default,
                  }),
                },
              ]
            : []),
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
];
