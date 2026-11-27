import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiClient } from '../src/api/client.js';
import { FilmDirectory, FilmDetail } from '../src/features/films/Public.jsx';
import { FilmForm } from '../src/features/films/Form.jsx';
import { ReleaseForm } from '../src/features/films/Manage.jsx';
import { useAuthStore } from '../src/features/auth/state.js';

const adapter = apiClient.defaults.adapter;
const video = {
  provider: 'youtube',
  providerVideoId: 'aB2DefGhi-1',
  availability: 'unknown',
};
const fixture = {
  id: 'film-fixture',
  slug: 'example-film',
  classification: 'independent',
  title: 'Isolated film',
  synopsis: 'An isolated film synopsis.',
  description: 'An isolated film description.',
  genres: ['drama'],
  subtitles: ['en'],
  language: 'te',
  runtimeMinutes: 12,
  releaseYear: 2026,
  availability: 'released',
  awards: [],
  gallery: [],
  extras: [],
  mainVideo: video,
  credits: [
    {
      personalityId: 'fixture-person',
      displayName: 'Test Talent',
      role: 'actor',
      slug: 'test-talent',
    },
  ],
};
const response = (data, pagination) => ({
  status: 200,
  headers: {},
  data: { success: true, message: 'OK', data, pagination },
});
const pagination = { page: 1, limit: 12, total: 1, totalPages: 2 };

function route(path, element, initial = path) {
  const router = createMemoryRouter([{ path, element }], {
    initialEntries: [initial],
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => useAuthStore.setState({ status: 'guest' }));
afterEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState());
  apiClient.defaults.adapter = adapter;
  delete window.YT;
});

it('shows catalogue loading and honest empty states', async () => {
  let complete;
  apiClient.defaults.adapter = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  route('/cinema', <FilmDirectory classification="independent" />);
  expect(
    screen.getByRole('status', { name: 'Loading catalogue' }),
  ).toBeVisible();
  await waitFor(() => expect(complete).toBeTypeOf('function'));
  complete(response([], { ...pagination, total: 0, totalPages: 0 }));
  expect(
    await screen.findByRole('heading', { name: 'No films published yet' }),
  ).toBeVisible();
});

it('requests the selected classification and keeps filters and pagination in the URL', async () => {
  const requests = vi.fn(async () => response([fixture], pagination));
  apiClient.defaults.adapter = requests;
  const events = userEvent.setup();
  const router = route(
    '/cinema',
    <FilmDirectory classification="independent" />,
  );
  expect(
    await screen.findByRole('link', { name: fixture.title }),
  ).toHaveAttribute('href', '/cinema/example-film');
  await events.click(screen.getByRole('button', { name: 'Filters' }));
  await events.selectOptions(screen.getByLabelText('Genre'), 'drama');
  expect(router.state.location.search).toBe('');
  await events.click(screen.getByRole('button', { name: 'Apply Filters' }));
  expect(router.state.location.search).toContain('genre=drama');
  await events.click(
    screen.getByRole('button', { name: 'Filters (1 active)' }),
  );
  await events.selectOptions(
    screen.getByLabelText('Release availability'),
    'upcoming',
  );
  await events.click(screen.getByRole('button', { name: 'Apply Filters' }));
  expect(router.state.location.search).toContain('availability=upcoming');
  await events.click(await screen.findByRole('button', { name: 'Next' }));
  expect(router.state.location.search).toContain('page=2');
  expect(requests).toHaveBeenCalledWith(
    expect.objectContaining({
      params: expect.objectContaining({ classification: 'independent' }),
    }),
  );
});

it('renders cast links and initializes a responsive player only after selection', async () => {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 'fixture-access',
  });
  apiClient.defaults.adapter = async ({ url }) =>
    response(
      url === '/users/me'
        ? { status: 'active', emailVerified: true, roles: ['viewer'] }
        : url.startsWith('/playback/')
          ? { mainVideo: video }
          : url.startsWith('/personal/progress/')
            ? { enabled: false }
            : url === '/personal/watchlist/status'
              ? []
              : fixture,
    );
  window.YT = {
    Player: class {
      constructor(frame, { events }) {
        events.onReady();
      }
      destroy() {}
    },
  };
  const events = userEvent.setup();
  route(
    '/cinema/:slug',
    <FilmDetail classification="independent" />,
    '/cinema/example-film',
  );
  expect(
    await screen.findByRole('heading', { name: fixture.title }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Test Talent' })).toHaveAttribute(
    'href',
    '/talent/test-talent',
  );
  expect(document.querySelector('iframe')).toBeNull();
  await events.click(await screen.findByRole('button', { name: 'Watch film' }));
  const frame = await screen.findByTitle(fixture.title);
  expect(frame.parentElement).toHaveClass('aspect-video');
  expect(new URL(frame.src).searchParams.has('autoplay')).toBe(false);
  expect(document.querySelectorAll('iframe')).toHaveLength(1);
});

it('displays upcoming availability and trailer controls without a main playback action', async () => {
  apiClient.defaults.adapter = async () =>
    response({
      ...fixture,
      classification: 'original',
      extras: undefined,
      availability: 'upcoming',
      releaseAt: '2099-01-01T12:00:00.000Z',
      mainVideo: undefined,
      trailer: video,
    });
  route(
    '/originals/:slug',
    <FilmDetail classification="original" />,
    '/originals/example-film',
  );
  expect(
    await screen.findByRole('heading', { name: 'Sign in to watch' }),
  ).toBeVisible();
  expect(screen.getByText('Scheduled release')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Watch film' })).toBeNull();
});

it('validates creator draft genres and sends provider links and rights attestation', async () => {
  const events = userEvent.setup();
  const save = vi.fn();
  route('/create', <FilmForm change={{}} save={save} />);
  await events.type(screen.getByLabelText('Film title'), 'Isolated test');
  await events.type(
    screen.getByLabelText('Short synopsis'),
    'A browser test synopsis.',
  );
  await events.selectOptions(screen.getByLabelText('Primary language'), 'te');
  await events.type(screen.getByLabelText('Runtime in minutes'), '12');
  await events.type(screen.getByLabelText('Release year'), '2026');
  await events.click(screen.getByRole('button', { name: 'Save film draft' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'one to five genres',
  );
  await events.click(screen.getByLabelText('Drama'));
  await events.type(
    screen.getByLabelText('Main film YouTube URL'),
    'https://youtu.be/aB2DefGhi-1',
  );
  await events.click(screen.getByLabelText(/I confirm permission/));
  await events.click(screen.getByRole('button', { name: 'Save film draft' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'te',
        genres: ['drama'],
        mainUrl: 'https://youtu.be/aB2DefGhi-1',
        rightsConfirmed: true,
      }),
    ),
  );
});

it('requires administrator playback confirmation before preparing release', async () => {
  const events = userEvent.setup();
  const onRelease = vi.fn();
  render(<ReleaseForm onRelease={onRelease} />);
  await events.click(
    screen.getByRole('button', { name: 'Review publication' }),
  );
  expect(onRelease).not.toHaveBeenCalled();
  await events.click(screen.getByLabelText(/Show the announcement/));
  await events.click(screen.getByLabelText(/I checked the rights/));
  await events.click(
    screen.getByRole('button', { name: 'Review publication' }),
  );
  expect(onRelease).toHaveBeenCalledWith({
    playbackChecked: true,
    announce: true,
    releaseAt: undefined,
  });
});
