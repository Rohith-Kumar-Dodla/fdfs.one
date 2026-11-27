import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { apiClient } from '../src/api/client.js';
import { EpisodeForm } from '../src/features/podcasts/Form.jsx';
import { EpisodePlayer } from '../src/features/podcasts/Player.jsx';
import {
  EpisodeDetail,
  PodcastLanding,
} from '../src/features/podcasts/Public.jsx';

const adapter = apiClient.defaults.adapter;
const main = {
  provider: 'youtube',
  providerVideoId: 'aB2DefGhi-1',
  availability: 'unknown',
};
const show = {
  name: '404 Reality Not Found',
  introduction: 'Isolated show text.',
  description: 'Isolated description',
  hosts: [],
  links: [],
};
const episode = {
  id: 'podcast-fixture',
  slug: 'fixture-episode',
  title: 'Isolated playback fixture',
  synopsis: 'Test episode.',
  number: 2,
  season: 1,
  language: 'en',
  topics: ['film'],
  duration: 180,
  show,
  participants: [
    { displayName: 'Fixture guest', slug: 'fixture-guest', role: 'guest' },
  ],
  availability: 'released',
  mainVideo: main,
  releaseAt: '2026-01-01T10:00:00.000Z',
  links: [],
  chapters: [
    { title: 'Opening', start: 0 },
    { title: 'Second topic', start: 25 },
  ],
};
const page = { page: 1, limit: 12, total: 1, totalPages: 1 };
const response = (data, pagination) => ({
  status: 200,
  headers: {},
  data: { success: true, message: 'OK', data, pagination },
});

function route(path, component, initial = path) {
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter([{ path, element: component }], {
    initialEntries: [initial],
  });
  render(
    <QueryClientProvider client={query}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  apiClient.defaults.adapter = adapter;
  delete window.YT;
});

it('renders the episode catalogue and URL-driven discovery', async () => {
  apiClient.defaults.adapter = async (config) =>
    config.url === '/podcasts' ? response(show) : response([episode], page);
  const user = userEvent.setup();
  const router = route('/podcasts', <PodcastLanding />);
  expect(await screen.findByRole('heading', { name: show.name })).toBeVisible();
  expect(
    await screen.findByRole('heading', { name: episode.title }),
  ).toBeVisible();
  expect(
    screen.getAllByRole('link', { name: episode.title })[0],
  ).toHaveAttribute('href', '/podcasts/' + episode.slug);
  await user.click(screen.getByRole('button', { name: 'Filters' }));
  await user.selectOptions(
    screen.getByLabelText('Release availability'),
    'upcoming',
  );
  await user.click(screen.getByRole('button', { name: 'Apply Filters' }));
  expect(router.state.location.search).toContain('availability=upcoming');
});

it('renders honest unconfigured and loading states', async () => {
  let resolve;
  apiClient.defaults.adapter = () =>
    new Promise((done) => {
      resolve = done;
    });
  route('/podcasts', <PodcastLanding />);
  expect(screen.getByRole('heading', { name: show.name })).toBeVisible();
  await waitFor(() => expect(resolve).toBeTypeOf('function'));
  resolve(response(null));
  expect(
    await screen.findByRole('heading', {
      name: 'No podcast episodes have been published yet.',
    }),
  ).toBeVisible();
});

it('renders participants and public comments as plain text with a sign-in action', async () => {
  apiClient.defaults.adapter = async (config) =>
    config.url.endsWith('/comments')
      ? response(
          [
            {
              id: 'comment',
              author: 'Fixture reader',
              text: '<script>fixture</script>',
              createdAt: episode.releaseAt,
            },
          ],
          page,
        )
      : response(episode);
  route('/podcasts/:slug', <EpisodeDetail />, '/podcasts/' + episode.slug);
  expect(
    await screen.findByRole('heading', { name: episode.title }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Fixture guest' })).toHaveAttribute(
    'href',
    '/talent/fixture-guest',
  );
  expect(await screen.findByText('<script>fixture</script>')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Sign in to comment' }),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Post comment' })).toBeNull();
});

it('shows announced teasers and keeps unreleased playback and comments unavailable', async () => {
  apiClient.defaults.adapter = async () =>
    response({
      ...episode,
      availability: 'upcoming',
      mainVideo: undefined,
      teaser: main,
      chapters: undefined,
      releaseAt: '2099-01-01T10:00:00.000Z',
    });
  route('/podcasts/:slug', <EpisodeDetail />, '/podcasts/fixture-episode');
  expect(
    await screen.findByRole('button', { name: 'Watch teaser' }),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Watch episode' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Comments' })).toBeNull();
});

it('queues the chapter start and seeks after readiness while retaining a responsive, lazy player', async () => {
  const user = userEvent.setup();
  const seekTo = vi.fn();
  let callbacks;
  window.YT = {
    Player: class {
      constructor(frame, { events }) {
        callbacks = events;
        this.seekTo = seekTo;
      }
      destroy() {}
    },
  };
  render(<EpisodePlayer episode={episode} />);
  expect(document.querySelector('iframe')).toBeNull();
  await user.click(screen.getByRole('button', { name: '0:25 · Second topic' }));
  const frame = await screen.findByTitle(episode.title);
  expect(frame.parentElement).toHaveClass('aspect-video');
  expect(new URL(frame.src).searchParams.get('start')).toBe('25');
  expect(new URL(frame.src).searchParams.has('autoplay')).toBe(false);
  await user.click(screen.getByRole('button', { name: '0:00 · Opening' }));
  await waitFor(() => expect(callbacks).toBeDefined());
  act(() => callbacks.onReady({ target: { seekTo } }));
  expect(seekTo).toHaveBeenCalledWith(0, true);
  await user.click(screen.getByRole('button', { name: '0:25 · Second topic' }));
  expect(seekTo).toHaveBeenLastCalledWith(25, true);
  expect(
    screen.getByRole('button', { name: '0:25 · Second topic' }),
  ).toHaveAttribute('aria-current', 'true');
  act(() => callbacks.onError());
  expect(
    screen.getByRole('button', { name: '0:25 · Second topic' }),
  ).toBeDisabled();
});

it('rejects administrator duplicate chapter timestamps and normalizes H/M/S input', async () => {
  const save = vi.fn();
  const user = userEvent.setup();
  route('/editor', <EpisodeForm change={{}} save={save} />);
  fireEvent.input(screen.getByLabelText('Episode title'), {
    target: { value: 'Isolated episode' },
  });
  fireEvent.input(screen.getByLabelText('Short description'), {
    target: { value: 'A fixture summary' },
  });
  fireEvent.input(screen.getByLabelText('Episode number'), {
    target: { value: 1 },
  });
  fireEvent.input(screen.getByLabelText('Duration in seconds'), {
    target: { value: 600 },
  });
  await user.selectOptions(screen.getByLabelText('Primary language'), 'en');
  await user.click(screen.getByRole('button', { name: 'Add chapter' }));
  await user.click(screen.getByRole('button', { name: 'Add chapter' }));
  const titles = screen.getAllByLabelText('Chapter title');
  await user.type(titles[0], 'Opening');
  await user.type(titles[1], 'Second topic');
  await user.click(
    screen.getByRole('button', { name: 'Create episode draft' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'unique chapter times',
  );
  fireEvent.input(screen.getAllByLabelText('Minutes')[1], {
    target: { value: 1 },
  });
  fireEvent.input(screen.getAllByLabelText('Seconds')[1], {
    target: { value: 25 },
  });
  await user.click(
    screen.getByRole('button', { name: 'Create episode draft' }),
  );
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        chapters: [
          expect.objectContaining({ start: 0 }),
          expect.objectContaining({ start: 85 }),
        ],
      }),
    ),
  );
});
