import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: (failureCount, error) =>
        failureCount < 1 &&
        (['NETWORK_ERROR', 'TIMEOUT'].includes(error.code) ||
          error.status >= 500),
    },
    mutations: { retry: false },
  },
});
