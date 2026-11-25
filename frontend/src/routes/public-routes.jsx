import { PublicLayout } from '../layouts/PublicLayout.jsx';
import { RouteError, RouteLoading, NotFound } from '../pages/RouteStates.jsx';
import { modules } from './modules.js';

async function loadModulePage() {
  return { Component: (await import('../pages/ModulePending.jsx')).default };
}

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
            { path: module.path, handle: { module }, lazy: loadModulePage },
            {
              path: module.detailPath ?? `${module.path}/:slug`,
              handle: { module },
              lazy: loadModulePage,
            },
          ]),
          ...(import.meta.env.DEV
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
