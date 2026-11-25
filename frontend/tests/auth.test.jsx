import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../src/api/client.js';
import { queryClient } from '../src/api/query-client.js';
import {
  accountKeys,
  accounts,
  initializeAuth,
  protectedRequest,
} from '../src/features/auth/api.js';
import { useAuthStore } from '../src/features/auth/state.js';
import { publicRoutes } from '../src/routes/public-routes.jsx';

const adapter = apiClient.defaults.adapter;
const email = 'local@example.test';
const password = 'test passphrase long';
const session = { accessToken: 'access-fixture', sessionId: 'session-fixture' };
const user = {
  id: 'account-fixture',
  fullName: 'Local reader',
  email,
  roles: ['viewer'],
  status: 'active',
  emailVerified: false,
  bio: '',
  preferences: { emailUpdates: false },
};

function respond(config, data, status = 200) {
  const payload =
    status >= 400
      ? {
          success: false,
          message: data.message ?? 'Could not complete request.',
          error: { code: data.code },
        }
      : { success: true, message: 'Completed', data };
  const response = { config, status, headers: {}, data: payload };
  return status >= 400
    ? Promise.reject(
        new AxiosError(
          payload.message,
          'ERR_BAD_RESPONSE',
          config,
          undefined,
          response,
        ),
      )
    : Promise.resolve(response);
}

function renderRoute(path) {
  const router = createMemoryRouter(publicRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  queryClient.clear();
  useAuthStore.setState({ ...useAuthStore.getInitialState(), status: 'guest' });
});

afterEach(() => {
  apiClient.defaults.adapter = adapter;
  queryClient.clear();
  useAuthStore.setState(useAuthStore.getInitialState());
});

describe('frontend authentication', () => {
  it('redirects guests from a private path and signs in with accessible form controls', async () => {
    const events = userEvent.setup();
    const request = vi.fn((config) =>
      respond(config, config.url === '/auth/login' ? session : user),
    );
    apiClient.defaults.adapter = request;
    const router = renderRoute('/account/settings');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/login');
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    await events.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    await events.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
    const main = within(screen.getByRole('main'));
    await events.click(main.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your password.')).toBeVisible();
    expect(request).not.toHaveBeenCalled();
    await events.type(screen.getByLabelText('Email address'), email);
    await events.type(field, password);
    // Keep the unused session list fixture distinct from the profile.
    request.mockImplementation((config) =>
      respond(
        config,
        config.url === '/auth/login'
          ? session
          : config.url === '/auth/sessions'
            ? []
            : user,
      ),
    );
    await events.click(main.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByRole('heading', { name: 'Account settings' }),
    ).toBeVisible();
    expect(
      request.mock.calls.find(([config]) => config.url === '/auth/login')[0],
    ).toMatchObject({ withCredentials: true });
  });

  it('registers and navigates to the generic verification state', async () => {
    const events = userEvent.setup();
    const request = vi.fn((config) => respond(config, {}, 202));
    apiClient.defaults.adapter = request;
    renderRoute('/register');
    await screen.findByRole('heading', { name: 'Create an account' });
    await events.type(screen.getByLabelText('Full name'), 'Local Reader');
    await events.type(screen.getByLabelText('Email address'), email);
    await events.type(screen.getByLabelText('Password'), password);
    await events.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeVisible();
    expect(request.mock.calls[0][0].url).toBe('/auth/register');
    expect(request.mock.calls[0][0].withCredentials).toBeUndefined();
  });

  it('restores from an HttpOnly cookie and clears identity and account cache after logout', async () => {
    useAuthStore.setState({ status: 'checking' });
    const request = vi.fn((config) =>
      respond(config, config.url === '/auth/refresh' ? session : {}),
    );
    apiClient.defaults.adapter = request;
    await Promise.all([initializeAuth(), initializeAuth()]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({
      url: '/auth/refresh',
      withCredentials: true,
    });
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: session.accessToken,
    });
    const key = accountKeys.me(useAuthStore.getState().generation);
    queryClient.setQueryData(key, user);
    await accounts.logout();
    expect(request.mock.calls.at(-1)[0].url).toBe('/auth/logout');
    expect(useAuthStore.getState()).toMatchObject({
      status: 'guest',
      accessToken: null,
    });
    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  it.each([
    [
      '/verify-email',
      'Verify your email',
      'Verify email',
      'Password',
      '/auth/verify-email',
      'Your email is verified.',
    ],
    [
      '/reset-password',
      'Reset password',
      'Reset password',
      'New password',
      '/auth/reset-password',
      'Password reset. Sign in with your new password.',
    ],
  ])(
    'submits the one-time email link form at %s',
    async (path, heading, action, label, endpoint, feedback) => {
      const token = 'a'.repeat(43);
      const events = userEvent.setup();
      const request = vi.fn((config) => respond(config, {}));
      apiClient.defaults.adapter = request;
      renderRoute(`${path}#token=${token}`);
      await screen.findByRole('heading', { name: heading });
      await events.type(screen.getByLabelText(label), password);
      await events.click(screen.getByRole('button', { name: action }));
      expect(await screen.findByText(feedback)).toBeVisible();
      expect(request.mock.calls[0][0].url).toBe(endpoint);
      expect(JSON.parse(request.mock.calls[0][0].data)).toEqual({
        token,
        password,
      });
    },
  );

  it('shares one refresh for concurrent unauthorized responses and retries each request once', async () => {
    useAuthStore.setState({ ...session, status: 'authenticated' });
    const attempts = new Map();
    let refreshes = 0;
    apiClient.defaults.adapter = (config) => {
      if (config.url === '/auth/refresh') {
        refreshes++;
        return respond(config, { ...session, accessToken: 'replacement' });
      }
      attempts.set(config.url, (attempts.get(config.url) ?? 0) + 1);
      if (config.headers.get('Authorization') === 'Bearer access-fixture') {
        return respond(config, { code: 'AUTH_REQUIRED' }, 401);
      }
      return config.url === '/auth/sessions'
        ? respond(config, { code: 'AUTH_REQUIRED' }, 401)
        : respond(config, user);
    };

    const results = await Promise.allSettled([
      accounts.me(),
      accounts.sessions(),
    ]);
    expect(refreshes).toBe(1);
    expect([...attempts.values()]).toEqual([2, 2]);
    expect(results[0]).toMatchObject({
      status: 'fulfilled',
      value: { data: user },
    });
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: { code: 'AUTH_REQUIRED' },
    });
  });

  it('clears cached account data and never retries a mutation under a different session', async () => {
    useAuthStore.setState({ ...session, status: 'authenticated' });
    const key = accountKeys.me(useAuthStore.getState().generation);
    queryClient.setQueryData(key, user);
    const request = vi.fn((config) =>
      config.url === '/auth/refresh'
        ? respond(config, {
            accessToken: 'other-account',
            sessionId: 'other-session',
          })
        : respond(config, { code: 'AUTH_REQUIRED' }, 401),
    );
    apiClient.defaults.adapter = request;
    await expect(
      protectedRequest({
        method: 'patch',
        url: '/users/me',
        data: { fullName: 'Changed' },
      }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(key)).toBeUndefined();
    expect(useAuthStore.getState().sessionId).toBe('other-session');
  });

  it('does not claim logout when the server cannot confirm revocation', async () => {
    useAuthStore.setState({ ...session, status: 'authenticated' });
    apiClient.defaults.adapter = (config) =>
      respond(config, { code: 'SERVICE_ERROR' }, 503);
    await expect(accounts.logout()).rejects.toMatchObject({ status: 503 });
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});
