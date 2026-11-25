import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { publicRoutes } from '../src/routes/public-routes.jsx';

function renderRoute(path) {
  return render(
    <RouterProvider
      router={createMemoryRouter(publicRoutes, { initialEntries: [path] })}
    />,
  );
}

describe('public routes', () => {
  it('renders the public shell, landing page and all module entry points', async () => {
    renderRoute('/');
    expect(
      await screen.findByRole('heading', {
        name: 'For the love of the screen.',
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
      within(screen.getByRole('region', { name: 'Explore FDFS' })).getAllByRole(
        'link',
      ),
    ).toHaveLength(6);
    expect(screen.getByRole('contentinfo')).toBeVisible();
  });

  it('moves keyboard focus to the targets of in-page links', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('link', { name: 'Explore FDFS' }));
    expect(screen.getByRole('region', { name: 'Explore FDFS' })).toHaveFocus();
    await user.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it.each([
    ['/cinema', 'Cinema'],
    ['/cinema/short-film', 'Cinema'],
    ['/originals', 'Originals'],
    ['/originals/original-film', 'Originals'],
    ['/podcasts', '404 Podcasts'],
    ['/podcasts/episode', '404 Podcasts'],
    ['/live', 'Live'],
    ['/live/event', 'Live'],
    ['/reviews', 'Reviews'],
    ['/movies/movie', 'Reviews'],
    ['/talent', 'Talent'],
    ['/talent/profile', 'Talent'],
  ])('resolves %s and highlights its module', async (path, title) => {
    renderRoute(path);
    expect(
      await screen.findByRole('heading', { name: title, level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Content is not available yet' }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('navigation', { name: 'Primary' })).getByRole(
        'link',
        { name: title },
      ),
    ).toHaveAttribute('aria-current', 'page');
  });

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
      await screen.findByRole('heading', { name: 'Cinema', level: 1 }),
    ).toBeVisible();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('main')).toHaveFocus();
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
        name: 'For the love of the screen.',
      }),
    ).toBeVisible();
  });
});
