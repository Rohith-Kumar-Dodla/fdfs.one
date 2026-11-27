import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { apiClient } from '../src/api/client.js';
import { TalentForm } from '../src/features/talent/Form.jsx';
import {
  TalentDirectory,
  TalentProfile,
} from '../src/features/talent/Public.jsx';

const adapter = apiClient.defaults.adapter;
const profile = {
  id: 'f3b1f70b-0661-496d-afa7-3b1882dba9c9',
  slug: 'fixture-professional',
  displayName: 'Fixture Professional',
  introduction: 'A professional biography fixture.',
  biography: 'An isolated profile biography.',
  professions: ['editor', 'writer'],
  achievements: [{ title: 'Fixture award' }],
  links: [
    { kind: 'portfolio', label: 'Portfolio', url: 'https://example.test' },
  ],
};
const response = (data, pagination) => ({
  status: 200,
  headers: {},
  data: { success: true, message: 'OK', data, pagination },
});
const pagination = { page: 1, limit: 12, total: 1, totalPages: 1 };

function route(path, element) {
  const router = createMemoryRouter([{ path, element }], {
    initialEntries: [path.replace(':slug', profile.slug)],
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

afterEach(() => {
  apiClient.defaults.adapter = adapter;
});

it('shows directory loading skeletons followed by an honest empty state', async () => {
  let complete;
  apiClient.defaults.adapter = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  route('/talent', <TalentDirectory />);
  expect(
    screen.getByRole('status', { name: 'Loading catalogue' }),
  ).toBeVisible();
  await waitFor(() => expect(complete).toBeTypeOf('function'));
  complete(response([], { ...pagination, total: 0, totalPages: 0 }));
  expect(
    await screen.findByRole('heading', {
      name: 'No Talent Profiles have been published yet.',
    }),
  ).toBeVisible();
});

it('keeps applied search, filters, and pagination synchronized with the URL', async () => {
  apiClient.defaults.adapter = vi.fn(async () =>
    response([profile], { ...pagination, totalPages: 2 }),
  );
  const router = route('/talent', <TalentDirectory />);
  const events = userEvent.setup();
  expect(
    await screen.findByRole('link', { name: profile.displayName }),
  ).toHaveAttribute('href', '/talent/' + profile.slug);
  await events.click(screen.getByRole('button', { name: 'Filters' }));
  const search = screen.getByRole('searchbox', { name: 'Search by name' });
  await events.type(search, 'Fixture');
  expect(search).toHaveFocus();
  await events.selectOptions(screen.getByLabelText('Profession'), 'editor');
  await events.click(screen.getByRole('button', { name: 'Apply Filters' }));
  expect(router.state.location.search).toContain('q=Fixture');
  expect(router.state.location.search).toContain('profession=editor');
  await events.click(await screen.findByRole('button', { name: 'Next' }));
  expect(router.state.location.search).toContain('page=2');
});

it('renders only supplied profile fields, honest related-content sections, and canonical metadata', async () => {
  apiClient.defaults.adapter = async () => response(profile);
  route('/talent/:slug', <TalentProfile />);
  expect(
    await screen.findByRole('heading', { name: profile.displayName }),
  ).toBeVisible();
  expect(screen.getByText('Fixture award')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Portfolio' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  expect(
    screen.getByText('No published film credits are listed.'),
  ).toBeVisible();
  expect(
    screen.getByText('No published podcast appearances are listed.'),
  ).toBeVisible();
  expect(document.title).toBe(profile.displayName + ' | FDFS Talent Profiles');
  expect(
    new URL(document.querySelector('link[rel=canonical]').href).pathname,
  ).toBe('/talent/' + profile.slug);
});

it('validates administrator profile fields and accepts more than one profession', async () => {
  const events = userEvent.setup();
  const submit = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TalentForm
        admin
        create
        submit={submit}
        change={{}}
        label="Create draft"
      />
    </QueryClientProvider>,
  );
  await events.type(screen.getByLabelText('Display name'), 'Fixture');
  await events.type(
    screen.getByLabelText('Short professional introduction'),
    'Fixture introduction.',
  );
  await events.click(screen.getByRole('button', { name: 'Create draft' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose at least one profession.',
  );
  expect(submit).not.toHaveBeenCalled();
  await events.click(screen.getByLabelText('Actor'));
  await events.click(screen.getByLabelText('Director'));
  await events.click(screen.getByRole('button', { name: 'Create draft' }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ professions: ['actor', 'director'] }),
    ),
  );
});
