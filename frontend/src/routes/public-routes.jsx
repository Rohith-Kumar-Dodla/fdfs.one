import { PublicLayout } from '../layouts/PublicLayout.jsx';
import { RouteError, RouteLoading, NotFound } from '../pages/RouteStates.jsx';
import { modules } from './modules.js';
import { accountRoutes } from '../features/auth/routes.jsx';
import { administrationRoutes } from '../features/admin/routes.jsx';
import { filmPaths } from '../../../shared/films.js';

async function loadModulePage() {
  return { Component: (await import('../pages/ModulePending.jsx')).default };
}

const talentPage = (name) => async () => ({
  Component: (await import('../features/talent/Public.jsx'))[name],
});
function modulePage(path, detail = false) {
  if (path === '/podcasts')
    return async () => {
      const views = await import('../features/podcasts/Public.jsx');
      return { Component: detail ? views.EpisodeDetail : views.PodcastLanding };
    };
  if (path === '/talent')
    return talentPage(detail ? 'TalentProfile' : 'TalentDirectory');
  const classification = Object.keys(filmPaths).find(
    (key) => filmPaths[key] === path,
  );
  if (!classification) return loadModulePage;
  return async () => {
    const views = await import('../features/films/Public.jsx');
    const Page = detail ? views.FilmDetail : views.FilmDirectory;
    return { Component: () => <Page classification={classification} /> };
  };
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
            {
              path: module.path,
              handle: { module },
              lazy: modulePage(module.path),
            },
            {
              path: module.detailPath ?? `${module.path}/:slug`,
              handle: { module },
              lazy: modulePage(module.path, true),
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
