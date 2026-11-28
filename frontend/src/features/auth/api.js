import { apiClient, ApiError } from '../../api/client.js';
import { queryClient } from '../../api/query-client.js';
import { useAuthStore } from './state.js';

const cookieConfig = { withCredentials: true, headers: { 'X-FDFS-CSRF': '1' } };
const verificationConfig = { ...cookieConfig, timeout: 16000 };
const state = () => useAuthStore.getState();
let cookieQueue = Promise.resolve();
let refreshFlight;

export const accountKeys = {
  all: ['account'],
  me: (generation) => ['account', generation, 'me'],
  sessions: (generation) => ['account', generation, 'sessions'],
};

function setIdentity(session) {
  queryClient.removeQueries({
    predicate: (query) => query.meta?.public !== true,
  });
  queryClient.getMutationCache().clear();
  useAuthStore.setState(({ generation }) => ({
    accessToken: session?.accessToken ?? null,
    sessionId: session?.sessionId ?? null,
    generation: generation + 1,
    status: session ? 'authenticated' : 'guest',
    welcomePending: false,
  }));
}

function withCookieLock(action) {
  const operation = cookieQueue.then(() => {
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request('fdfs-web-session', action) : action();
  });
  cookieQueue = operation.catch(() => {});
  return operation;
}

function sessionData(response) {
  if (
    typeof response.data?.accessToken !== 'string' ||
    !response.data.accessToken ||
    typeof response.data?.sessionId !== 'string' ||
    !response.data.sessionId
  ) {
    throw new ApiError('The server returned an invalid session.', {
      code: 'INVALID_RESPONSE',
    });
  }
  return response.data;
}

export function refreshSession(previousToken) {
  if (refreshFlight) return refreshFlight;
  refreshFlight = withCookieLock(async () => {
    if (previousToken && previousToken !== state().accessToken) {
      if (state().accessToken) return state().accessToken;
      throw new ApiError('Please sign in to continue.', {
        code: 'AUTH_REQUIRED',
        status: 401,
      });
    }

    try {
      let response;
      try {
        response = await apiClient.post(
          '/auth/refresh',
          undefined,
          cookieConfig,
        );
      } catch (error) {
        if (error.code !== 'REFRESH_IN_PROGRESS') throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
        response = await apiClient.post(
          '/auth/refresh',
          undefined,
          cookieConfig,
        );
      }
      const session = sessionData(response);
      if (state().sessionId === session.sessionId)
        useAuthStore.setState({ accessToken: session.accessToken });
      else setIdentity(session);
      return session.accessToken;
    } catch (error) {
      if (error.status === 401 && state().status !== 'guest') setIdentity(null);
      throw error;
    }
  }).finally(() => {
    refreshFlight = undefined;
  });
  return refreshFlight;
}

export async function initializeAuth() {
  if (!['checking', 'unavailable'].includes(state().status)) return;
  useAuthStore.setState({ status: 'checking' });
  try {
    await refreshSession();
  } catch (error) {
    if (error.status !== 401 && state().status === 'checking')
      useAuthStore.setState({ status: 'unavailable' });
  }
}

export async function protectedRequest(config, { cookieLock = false } = {}) {
  const initial = state();
  if (!initial.accessToken)
    throw new ApiError('Please sign in to continue.', {
      code: 'AUTH_REQUIRED',
      status: 401,
    });

  const request = (token) => {
    const send = () => {
      if (state().generation !== initial.generation)
        throw new ApiError('Please sign in to continue.', {
          code: 'AUTH_REQUIRED',
          status: 401,
        });
      return apiClient.request({
        ...config,
        headers: { ...config.headers, Authorization: `Bearer ${token}` },
      });
    };
    return cookieLock ? withCookieLock(send) : send();
  };

  try {
    return await request(initial.accessToken);
  } catch (error) {
    if (
      error.status !== 401 ||
      error.code !== 'AUTH_REQUIRED' ||
      config.signal?.aborted ||
      state().generation !== initial.generation
    )
      throw error;
    const replacement = await refreshSession(initial.accessToken);
    if (state().generation !== initial.generation || config.signal?.aborted)
      throw error;
    return request(replacement);
  }
}

export const accounts = {
  register: (data) => apiClient.post('/auth/register', data),
  beginVerification: (credentials) =>
    apiClient.post(
      '/auth/verification-session',
      credentials,
      verificationConfig,
    ),
  verificationStatus: ({ signal } = {}) =>
    apiClient.post('/auth/verification-status', undefined, {
      ...cookieConfig,
      signal,
    }),
  resendVerification: () =>
    apiClient.post('/auth/resend-verification', undefined, verificationConfig),
  verifyEmail: (data) =>
    apiClient.post('/auth/verify-email', data, verificationConfig),
  forgotPassword: (data) => apiClient.post('/auth/forgot-password', data),
  resetPassword: (data) => apiClient.post('/auth/reset-password', data),
  login: (data) =>
    withCookieLock(async () => {
      const response = await apiClient.post('/auth/login', data, cookieConfig);
      setIdentity(sessionData(response));
    }),
  logout: () =>
    withCookieLock(async () => {
      await apiClient.post('/auth/logout', undefined, cookieConfig);
      setIdentity(null);
    }),
  async endCurrentSession() {
    // Credential changes and explicit revocations already invalidated the server session.
    try {
      await accounts.logout();
    } catch {
      setIdentity(null);
    }
  },
  me: ({ signal } = {}) =>
    protectedRequest({ method: 'get', url: '/users/me', signal }),
  updateProfile: (data) =>
    protectedRequest({ method: 'patch', url: '/users/me', data }),
  changePassword: (data) =>
    protectedRequest({ method: 'post', url: '/auth/change-password', data }),
  async deleteAccount(data) {
    await protectedRequest(
      { ...cookieConfig, method: 'delete', url: '/auth/account', data },
      { cookieLock: true },
    );
    setIdentity(null);
  },
  sessions: ({ signal } = {}) =>
    protectedRequest({ method: 'get', url: '/auth/sessions', signal }),
  revoke: (sessionId) =>
    protectedRequest({
      method: 'delete',
      url: `/auth/sessions/${encodeURIComponent(sessionId)}`,
    }),
  logoutAll: () =>
    protectedRequest({ method: 'post', url: '/auth/logout-all' }),
};
