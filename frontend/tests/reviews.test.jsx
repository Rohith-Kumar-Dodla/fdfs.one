import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RatingEditor } from '../src/features/reviews/Rating.jsx';
import { MoviesCatalogue } from '../src/features/reviews/Public.jsx';
import { apiClient } from '../src/api/client.js';

function route(element, path = '/reviews/movies') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter([{ path: '/reviews/movies', element }], {
    initialEntries: [path],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
beforeEach(() => {
  vi.restoreAllMocks();
});
it('offers ten labelled half-star choices and saves the selected value', () => {
  const save = vi.fn();
  render(<RatingEditor current={null} save={save} />);
  expect(screen.getAllByRole('radio')).toHaveLength(10);
  expect(screen.getByRole('button', { name: 'Save rating' }).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('radio', { name: '3.5 stars' }));
  expect(screen.getByRole('radio', { name: '3.5 stars' }).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save rating' }));
  expect(save).toHaveBeenCalledWith(3.5, expect.any(Function));
});
it('retains the authoritative value after a failure and exposes removal', () => {
  const remove = vi.fn();
  const save = vi.fn();
  render(
    <RatingEditor
      current={2.5}
      save={save}
      remove={remove}
      error={Error('Rating update failed')}
    />,
  );
  expect(screen.getByRole('radio', { name: '2.5 stars' }).checked).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain(
    'Rating update failed',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove rating' }));
  expect(remove).toHaveBeenCalledOnce();
});
it('filters the catalogue on the server, exposes progress and can reset URL filters', async () => {
  let finish;
  const empty = {
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  };
  const read = vi
    .spyOn(apiClient, 'get')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(empty);
        }),
    )
    .mockResolvedValue(empty);
  const router = route(
    <MoviesCatalogue />,
    '/reviews/movies?q=No+movie&genre=drama&sort=title',
  );
  expect(
    screen.getByRole('status', { name: 'Loading catalogue' }),
  ).toBeVisible();
  expect(read.mock.calls[0]).toMatchObject([
    '/movies',
    {
      params: { q: 'No movie', genre: 'drama', sort: 'title', page: 1 },
      signal: expect.any(AbortSignal),
    },
  ]);
  finish();
  expect(
    await screen.findByText('No results match your filters.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reset search' }));
  expect(router.state.location.search).toBe('');
});
