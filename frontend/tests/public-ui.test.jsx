import { afterEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../src/api/client.js';
import { useAuthStore } from '../src/features/auth/state.js';
import PublicHome from '../src/features/public-ui/Home.jsx';
import { PublicReviews } from '../src/features/public-ui/Reviews.jsx';
import { FilterDrawer } from '../src/features/public-ui/Catalogue.jsx';
import { publicHomeSections } from '../../shared/public-home.js';

function view(component, path = '/') {
  const router = createMemoryRouter([{ path, element: component }], {
    initialEntries: [path],
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
afterEach(() => useAuthStore.setState(useAuthStore.getInitialState()));
const slide = (i) => ({
  id: String(i),
  module: 'independent',
  title: 'Fixture title ' + i,
  primary: { label: 'Watch Film', href: '/cinema/example-' + i },
});

it.each([0, 2, 6])(
  'uses eligible hero indicators and keeps required shelf links with %i fixture slides',
  async (length) => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => ({
      data:
        url === '/homepage'
          ? {
              slides: Array.from({ length }, (_, i) => slide(i + 1)),
              sections: [],
            }
          : null,
    }));
    view(<PublicHome />);
    await screen.findByText(publicHomeSections[0].empty);
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((node) => node.textContent),
    ).toEqual(publicHomeSections.map((row) => row.heading));
    for (const row of publicHomeSections)
      expect(
        screen.getByRole('link', { name: 'Show More ' + row.heading }),
      ).toHaveAttribute('href', row.more);
    expect(
      screen.queryAllByRole('button', { name: /Show slide/ }),
    ).toHaveLength(Math.min(length, 5));
    expect(document.querySelector('iframe')).toBeNull();
    if (length) {
      expect(screen.getByRole('link', { name: 'Watch Now' })).toHaveAttribute(
        'href',
        '/cinema/example-1',
      );
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Next slide' }));
      expect(
        screen.getByRole('heading', { level: 1, name: 'Fixture title 2' }),
      ).toBeVisible();
    } else {
      expect(
        screen.getByRole('heading', { level: 1, name: 'FDFS.ONE' }),
      ).toBeVisible();
      expect(screen.queryByRole('link', { name: 'Watch Now' })).toBeNull();
    }
  },
);

it('does not commit filter edits until Apply and restores trigger focus after dismissal or reset', async () => {
  const apply = vi.fn();
  view(
    <FilterDrawer
      fields={[{ key: 'genre', label: 'Genre', options: [['drama', 'Drama']] }]}
      values={{}}
      apply={apply}
    />,
  );
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: 'Filters' });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Filters' });
  await user.selectOptions(within(dialog).getByLabelText('Genre'), 'drama');
  expect(apply).not.toHaveBeenCalled();
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  await user.selectOptions(screen.getByLabelText('Genre'), 'drama');
  await user.click(screen.getByRole('button', { name: 'Apply Filters' }));
  expect(apply).toHaveBeenLastCalledWith({ genre: 'drama' });
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Reset Filters' }));
  expect(apply).toHaveBeenLastCalledWith({ genre: '' });
  expect(document.body.style.overflow).toBe('');
});

it('opens a guest review dialog and sends sign-in back to the approved review flow', async () => {
  useAuthStore.setState({ status: 'guest' });
  vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] });
  view(<PublicReviews />, '/reviews');
  const user = userEvent.setup();
  const launch = screen.getAllByRole('button', {
    name: 'Write Your Review',
  })[0];
  await user.click(launch);
  const dialog = screen.getByRole('dialog', { name: 'Write Your Review' });
  expect(
    await within(dialog).findByRole('link', { name: 'Sign in' }),
  ).toHaveAttribute('href', '/login');
  expect(within(dialog).getByText('Sign in to write a review.')).toBeVisible();
});
