import axios from 'axios';

export class ApiError extends Error {
  constructor(message, { code, status = null, details, requestId } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

export function normalizeApiError(error) {
  if (error instanceof ApiError || axios.isCancel(error)) return error;

  if (axios.isAxiosError(error)) {
    if (['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) {
      return new ApiError('The request timed out.', { code: 'TIMEOUT' });
    }

    const { data, status, headers } = error.response ?? {};
    if (!status && error.code === 'ERR_NETWORK') {
      return new ApiError(
        'Could not reach the server. Check your connection and try again.',
        { code: 'NETWORK_ERROR' },
      );
    }

    if (status) {
      const requestId = headers?.['x-request-id'];
      if (
        data?.success === false &&
        typeof data.error?.code === 'string' &&
        typeof data.message === 'string'
      ) {
        return new ApiError(data.message, {
          code: data.error.code,
          status,
          details: data.error.details,
          requestId,
        });
      }
      return new ApiError('The server could not complete the request.', {
        code: 'HTTP_ERROR',
        status,
        requestId,
      });
    }
  }

  return new ApiError('The request could not be completed.', {
    code: 'REQUEST_FAILED',
  });
}

export const apiClient = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:5000/api/v1',
  timeout: 8000,
  headers: { Accept: 'application/json' },
});

apiClient.interceptors.response.use(
  ({ data, status, headers }) => {
    if (
      data?.success !== true ||
      typeof data.message !== 'string' ||
      !Object.hasOwn(data, 'data')
    ) {
      throw new ApiError('The server returned an unexpected response.', {
        code: 'INVALID_RESPONSE',
        status,
        requestId: headers?.['x-request-id'],
      });
    }
    return data;
  },
  (error) => Promise.reject(normalizeApiError(error)),
);
