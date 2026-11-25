import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import axios, { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, normalizeApiError } from '../src/api/client.js';
import { getHealth, getReadiness } from '../src/api/status.js';
import ApiDiagnostics from '../src/pages/ApiDiagnostics.jsx';

const adapter = apiClient.defaults.adapter;
const healthy = {
  success: true,
  message: 'Request completed successfully',
  data: { status: 'ok' },
};
const ready = {
  success: true,
  message: 'Request completed successfully',
  data: { status: 'ready', database: 'connected' },
};
const unavailable = {
  success: false,
  message: 'Application is not ready',
  error: {
    code: 'DEPENDENCY_UNAVAILABLE',
    details: { database: 'unavailable' },
  },
};

function respond(config, status, data) {
  const response = {
    config,
    data,
    headers: { 'x-request-id': 'example-request' },
    status,
    statusText: String(status),
  };
  if (status >= 400)
    return Promise.reject(
      new AxiosError(
        'Request failed',
        'ERR_BAD_RESPONSE',
        config,
        undefined,
        response,
      ),
    );
  return Promise.resolve(response);
}

afterEach(() => {
  apiClient.defaults.adapter = adapter;
});

describe('API client and diagnostics', () => {
  it('unwraps the backend envelope and passes an AbortSignal to Axios', async () => {
    const signal = new AbortController().signal;
    apiClient.defaults.adapter = vi.fn((config) =>
      respond(config, 200, healthy),
    );
    expect(await getHealth({ signal })).toEqual(healthy);
    expect(apiClient.defaults.adapter).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/health', signal, timeout: 8000 }),
    );
  });

  it('normalizes an unavailable backend dependency with status and request ID', async () => {
    apiClient.defaults.adapter = (config) => respond(config, 503, unavailable);
    await expect(getReadiness()).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      code: 'DEPENDENCY_UNAVAILABLE',
      details: { database: 'unavailable' },
      requestId: 'example-request',
    });
  });

  it('sanitizes network and timeout errors and preserves cancellation', () => {
    expect(
      normalizeApiError(
        new AxiosError('private transport data', 'ERR_NETWORK'),
      ),
    ).toMatchObject({
      code: 'NETWORK_ERROR',
      status: null,
      message:
        'Could not reach the server. Check your connection and try again.',
    });
    expect(
      normalizeApiError(
        new AxiosError('private transport data', 'ECONNABORTED'),
      ),
    ).toMatchObject({ code: 'TIMEOUT' });
    const canceled = new axios.CanceledError();
    expect(normalizeApiError(canceled)).toBe(canceled);
  });

  it('rejects an HTTP 200 with an unexpected response shape', async () => {
    apiClient.defaults.adapter = (config) =>
      respond(config, 200, '<html></html>');
    await expect(getHealth()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 200,
    });
  });

  it.each([
    ['ready', 'Backend available', 'Backend and database ready'],
    ['database unavailable', 'Backend available', 'Database unavailable'],
    ['offline', 'Backend unreachable', 'Backend unreachable'],
  ])(
    'reports the %s state through the actual query and client code',
    async (state, livenessLabel, readinessLabel) => {
      apiClient.defaults.adapter = (config) => {
        if (state === 'offline')
          return Promise.reject(
            new AxiosError('Network Error', 'ERR_NETWORK', config),
          );
        if (config.url === '/health') return respond(config, 200, healthy);
        return state === 'ready'
          ? respond(config, 200, ready)
          : respond(config, 503, unavailable);
      };
      const client = new QueryClient({
        defaultOptions: { queries: { gcTime: 0 } },
      });
      render(
        <QueryClientProvider client={client}>
          <ApiDiagnostics />
        </QueryClientProvider>,
      );
      if (state === 'offline') {
        expect(await screen.findAllByText(livenessLabel)).toHaveLength(2);
      } else {
        expect(await screen.findByText(livenessLabel)).toBeVisible();
        expect(await screen.findByText(readinessLabel)).toBeVisible();
      }
    },
  );
});
