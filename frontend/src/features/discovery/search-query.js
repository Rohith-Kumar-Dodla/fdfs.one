import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client.js';

export const field = 'grid min-w-0 gap-1 text-sm';
export const accepted = (value) =>
  value.length >= 2 && /[\p{L}\p{N}]/u.test(value);
export const url = (options) =>
  '/search?' +
  new URLSearchParams(Object.entries(options).filter(([, v]) => v));
export function useSearch(path, params, enabled) {
  return useQuery({
    queryKey: ['global-search', path, params],
    queryFn: ({ signal }) =>
      apiClient.get(path, { params, signal }).then((result) => result.data),
    enabled,
    meta: { public: true },
  });
}
export const control =
  'min-h-11 w-full min-w-0 rounded-control border border-line bg-base px-3 py-2 text-sm text-foreground';
