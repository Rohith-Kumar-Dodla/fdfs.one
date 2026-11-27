import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient } from '../src/api/client.js';
import { useAuthStore } from '../src/features/auth/state.js';
import { publicRoutes } from '../src/routes/public-routes.jsx';

const defaultAdapter = apiClient.defaults.adapter;
beforeEach(() => {
  useAuthStore.setState({ ...useAuthStore.getInitialState(), status: 'guest' });
  apiClient.defaults.adapter = async (config) => ({
    status: 200,
    headers: {},
    data: {
      success: true,
      message: 'OK',
      data:
        config.url === '/movies/movie'
          ? {
              id: 'test',
              title: 'Published movie',
              slug: 'movie',
              path: '/movies/movie',
              genres: [],
              languages: [],
            }
          : [],
      pagination: { page: 1, total: 0, totalPages: 0 },
    },
  });
});
afterEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState());
  apiClient.defaults.adapter = defaultAdapter;
});

function renderRoute(path) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider
        router={createMemoryRouter(publicRoutes, { initialEntries: [path] })}
      />
    </QueryClientProvider>,
  );
}

describe('public routes', () => {
  it('renders the public shell, landing page and all module entry points', async () => {
    renderRoute('/');
    expect(
      await screen.findByRole('heading', {
        name: 'FDFS.ONE',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Skip to content' }),
    ).toHaveAttribute('href', '/#main-content');
    const navigation = within(
      screen.getByRole('navigation', { name: 'Primary' }),
    );
    expect(navigation.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(navigation.getAllByRole('link')).toHaveLength(7);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .slice(0, 5)
        .map((node) => node.textContent),
    ).toEqual([
      'FDFS Cinema',
      'FDFS Originals',
      '404 Reality Not Found',
      'Reviews',
      'Top Picked Profiles',
    ]);
    expect(screen.queryByRole('region', { name: 'Explore FDFS' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open search' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Show More Top Picked Profiles' }),
    ).toHaveAttribute('href', '/talent?category=short-films');
    expect(
      within(
        screen.getByRole('navigation', { name: 'Quick Links' }),
      ).getAllByRole('link'),
    ).toHaveLength(7);
    expect(screen.getByRole('contentinfo')).toBeVisible();
  });

  it('moves keyboard focus to the targets of in-page links', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it.each([
    ['/reviews', 'FDFS Reviews'],
    ['/reviews/movies', 'Movie catalogue'],
    ['/movies/movie', 'Published movie'],
  ])('resolves %s and highlights its module', async (path, title) => {
    renderRoute(path);
    expect(
      await screen.findByRole('heading', { name: title, level: 1 }),
    ).toBeVisible();
    if (path === '/reviews/movies')
      expect(
        await screen.findByText('No movies have been published yet.'),
      ).toBeVisible();
    expect(
      within(screen.getByRole('navigation', { name: 'Primary' })).getByRole(
        'link',
        { name: 'Reviews' },
      ),
    ).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['/live', 'FDFS Live'],
    ['/live/event', 'Event not found'],
  ])('resolves %s with the live routes', async (path, heading) => {
    if (path === '/live/event')
      apiClient.defaults.adapter = async (config) => {
        throw new AxiosError(
          'Event not found',
          'ERR_BAD_REQUEST',
          config,
          undefined,
          {
            status: 404,
            headers: {},
            data: {
              success: false,
              message: 'Event not found',
              error: { code: 'LIVE_NOT_FOUND' },
            },
          },
        );
      };
    renderRoute(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(
      within(screen.getByRole('navigation', { name: 'Primary' })).getByRole(
        'link',
        { name: 'Live' },
      ),
    ).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['/podcasts', '404 Reality Not Found', false],
    ['/podcasts/episode', 'Episode unavailable', true],
  ])('resolves %s with the podcast routes', async (path, heading, detail) => {
    apiClient.defaults.adapter = async (config) => {
      if (detail)
        throw new AxiosError(
          'Episode not found',
          'ERR_BAD_REQUEST',
          config,
          undefined,
          {
            status: 404,
            headers: {},
            data: {
              success: false,
              message: 'Episode not found',
              error: { code: 'EPISODE_NOT_FOUND' },
            },
          },
        );
      return {
        status: 200,
        headers: {},
        data: { success: true, message: 'OK', data: null },
      };
    };
    renderRoute(path);
    expect(
      await screen.findByRole(
        'heading',
        { name: heading, level: 1 },
        { timeout: 5000 },
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole('navigation', { name: 'Primary' })).getByRole(
        'link',
        { name: '404 Podcasts' },
      ),
    ).toHaveAttribute('aria-current', 'page');
  });
  it.each([
    ['/cinema', 'FDFS Cinema', 'Cinema', false],
    ['/cinema/short-film', 'Film unavailable', 'Cinema', true],
    ['/originals', 'FDFS Originals', 'Originals', false],
    ['/originals/original-film', 'Film unavailable', 'Originals', true],
  ])(
    'resolves %s with the shared film pages',
    async (path, title, nav, detail) => {
      const original = apiClient.defaults.adapter;
      apiClient.defaults.adapter = async (config) => {
        if (config.url.startsWith('/films'))
          expect(config.params.classification).toBe(
            nav === 'Cinema' ? 'independent' : 'original',
          );
        if (detail)
          throw new AxiosError(
            'Fixture not found',
            'ERR_BAD_REQUEST',
            config,
            undefined,
            {
              status: 404,
              headers: {},
              data: {
                success: false,
                message: 'Fixture not found',
                error: { code: 'FILM_NOT_FOUND' },
              },
            },
          );
        return {
          status: 200,
          headers: {},
          data: {
            success: true,
            message: 'OK',
            data: [],
            pagination: { totalPages: 0 },
          },
        };
      };
      try {
        renderRoute(path);
        expect(
          await screen.findByRole(
            'heading',
            { name: title, level: 1 },
            { timeout: 5000 },
          ),
        ).toBeVisible();
        if (!detail)
          expect(
            await screen.findByRole('heading', {
              name: 'No films published yet',
            }),
          ).toBeVisible();
        expect(
          within(screen.getByRole('navigation', { name: 'Primary' })).getByRole(
            'link',
            { name: nav },
          ),
        ).toHaveAttribute('aria-current', 'page');
      } finally {
        apiClient.defaults.adapter = original;
      }
    },
  );
  it.each([
    ['/talent', 'FDFS Talent', 'No Talent Profiles have been published yet.'],
    ['/talent/profile', 'Talent profile unavailable', null],
  ])(
    'resolves %s and highlights the Talent module',
    async (path, title, empty) => {
      const original = apiClient.defaults.adapter;
      apiClient.defaults.adapter = async (config) => {
        if (config.url === '/talent/profile')
          throw new AxiosError(
            'Fixture not found',
            'ERR_BAD_REQUEST',
            config,
            undefined,
            {
              status: 404,
              headers: {},
              data: {
                success: false,
                message: 'Fixture not found',
                error: { code: 'TALENT_NOT_FOUND' },
              },
            },
          );
        return {
          status: 200,
          headers: {},
          data: {
            success: true,
            message: 'OK',
            data: [],
            pagination: { totalPages: 0 },
          },
        };
      };
      try {
        renderRoute(path);
        expect(
          await screen.findByRole(
            'heading',
            { name: title, level: 1 },
            { timeout: 5000 },
          ),
        ).toBeVisible();
        if (empty)
          expect(
            await screen.findByRole('heading', { name: empty }),
          ).toBeVisible();
        expect(
          within(screen.getByRole('navigation', { name: 'Primary' })).getByRole(
            'link',
            { name: 'Talent' },
          ),
        ).toHaveAttribute('aria-current', 'page');
      } finally {
        apiClient.defaults.adapter = original;
      }
    },
  );

  it('toggles mobile navigation, restores focus on Escape and focuses main after navigation', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    await screen.findByRole('heading', { level: 1 });
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const links = within(
      screen.getByRole('navigation', { name: 'Mobile primary' }),
    );
    links.getByRole('link', { name: 'Cinema' }).focus();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    await user.click(links.getByRole('link', { name: 'Cinema' }));
    expect(
      await screen.findByRole('heading', { name: 'FDFS Cinema', level: 1 }),
    ).toBeVisible();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('renders a not-found page and provides an accessible way back', async () => {
    const user = userEvent.setup();
    renderRoute('/unknown');
    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Back to home' }));
    expect(
      await screen.findByRole('heading', {
        name: 'FDFS.ONE',
      }),
    ).toBeVisible();
  });
});
