import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client.js';
import { protectedRequest } from '../auth/api.js';
import { useAccount } from '../auth/guards.jsx';
import { useAuthStore } from '../auth/state.js';
import { useSiteSettings } from '../site/public.jsx';

export const stars = Array.from({ length: 10 }, (_, index) => (index + 1) / 2);
export const kinds = {
  movie: 'Movies',
  cinema: 'Cinema',
  original: 'Originals',
};
export const reviewLink = (id) => '/reviews/' + id;
export const reviewApi = ({ type, slug }) => '/reviews/' + type + '/' + slug;
export const rateApi = ({ type, slug }) => '/ratings/' + type + '/' + slug;
export function useRead(
  url,
  { params, enabled = true, privateRead = false, ...options } = {},
) {
  return useQuery({
    queryKey: ['reviews', url, params, privateRead],
    enabled,
    meta: { public: !privateRead },
    queryFn: ({ signal }) =>
      privateRead
        ? protectedRequest({ url, params, signal })
        : apiClient.get(url, { params, signal }),
    ...options,
  });
}
export function useReviewAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: protectedRequest,
    onSuccess: () => client.invalidateQueries({ queryKey: ['reviews'] }),
  });
}
export function useParticipation() {
  const status = useAuthStore((state) => state.status);
  const account = useAccount();
  const settings = useSiteSettings();
  return {
    checking:
      status === 'checking' ||
      (status === 'authenticated' && account.isPending),
    account: account.data,
    guest: status === 'guest',
    allowed:
      account.data?.status === 'active' &&
      account.data.emailVerified &&
      settings.communityOpen !== false,
    closed: settings.communityOpen === false,
  };
}
