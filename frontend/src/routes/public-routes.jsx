import { LegalPage } from '../features/site/public.jsx';
import { PublicLayout } from '../layouts/PublicLayout.jsx';
import { RouteError, RouteLoading, NotFound } from '../pages/RouteStates.jsx';
import { modules } from './modules.js';
import { accountRoutes } from '../features/auth/routes.jsx';
import { administrationRoutes } from '../features/admin/routes.jsx';
import { filmPaths } from '../../../shared/films.js';

const reviewsPage = (name) => async () => ({
  Component: (await import('../features/reviews/Public.jsx'))[name],
});

const directory = (name) => async () => ({
  Component: (await import('../features/public-ui/Directories.jsx'))[name],
});
function modulePage(path, detail = false) {
  if (path === '/reviews')
    return reviewsPage(detail ? 'MovieDetail' : 'ReviewsLanding');
  if (path === '/live')
    return detail
      ? async () => ({
          Component: (await import('../features/live/Public.jsx')).LiveDetail,
        })
      : directory('LiveDirectory');
  if (path === '/podcasts')
    return detail
      ? async () => ({
          Component: (await import('../features/podcasts/Public.jsx'))
            .EpisodeDetail,
        })
      : directory('PodcastLanding');
  if (path === '/talent')
    return detail
      ? async () => ({
          Component: (await import('../features/talent/Public.jsx'))
            .TalentProfile,
        })
      : directory('TalentDirectory');
  const classification = Object.keys(filmPaths).find(
    (key) => filmPaths[key] === path,
  );
  if (!classification) return async () => ({ Component: NotFound });
  return async () => {
    const Page = detail
      ? (await import('../features/films/Public.jsx')).FilmDetail
      : (await import('../features/public-ui/Directories.jsx')).FilmDirectory;
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
              Component: (await import('../features/public-ui/Home.jsx'))
                .default,
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
          {
            path: '/reviews/:reviewId',
            handle: { module: modules.find(({ path }) => path === '/reviews') },
            lazy: async () => ({
              Component: (await import('../features/reviews/Community.jsx'))
                .ReviewDetail,
            }),
          },
          { path: '/reviews/movies', lazy: reviewsPage('MoviesCatalogue') },
          {
            path: '/reviews/short-films',
            lazy: reviewsPage('ShortFilmDiscovery'),
          },
          { path: '/reviews/community', lazy: reviewsPage('CommunityFeed') },
          {
            path: '/search',
            lazy: async () => ({
              Component: (await import('../features/discovery/Search.jsx'))
                .SearchResults,
            }),
          },
          { path: '/legal/:kind', element: <LegalPage /> },
          ...[
            ['/support', 'SupportHome'],
            ['/support/new', 'NewTicket'],
            ['/support/tickets', 'UserTickets'],
            ['/support/tickets/:id', 'TicketDetail'],
            ['/support/guest', 'GuestTicket'],
          ].map(([path, name]) => ({
            path,
            lazy: async () => ({
              Component: (await import('../features/operations/Support.jsx'))[
                name
              ],
            }),
          })),
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
