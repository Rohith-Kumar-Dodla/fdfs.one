import { apiClient } from '../../api/client.js';

export const homepageQuery = {
  queryKey: ['homepage-discovery', 'entertainment'],
  meta: { public: true },
  staleTime: 15000,
  queryFn: ({ signal }) =>
    apiClient
      .get('/homepage', { params: { view: 'entertainment' }, signal })
      .then(({ data }) => ({
        ...data,
        clockOffset: Date.parse(data?.serverNow) - Date.now() || 0,
      })),
  refetchInterval: ({ state }) => {
    const next = Date.parse(state.data?.nextChangeAt);
    return Number.isFinite(next)
      ? Math.max(
          250,
          Math.min(
            30000,
            next - Date.now() - (state.data?.clockOffset ?? 0) + 150,
          ),
        )
      : 30000;
  },
};
