import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { protectedRequest } from '../auth/api.js';
import { useAuthStore } from '../auth/state.js';

export const scopedKey = (generation, ...keys) => [
  'personal',
  generation,
  ...keys,
];
export const personalRequest = (url, request) =>
  protectedRequest({ url: '/personal' + url, ...request }).then(
    (result) => result.data,
  );
export function usePersonal(
  url,
  { params, enabled = true, staleTime = 20000 } = {},
) {
  const generation = useAuthStore((state) => state.generation);
  const authenticated = useAuthStore(
    (state) => state.status === 'authenticated',
  );
  return useQuery({
    queryKey: scopedKey(generation, url, params),
    enabled: authenticated && enabled,
    staleTime,
    queryFn: ({ signal }) => personalRequest(url, { signal, params }),
  });
}
export function usePersonalChange() {
  const client = useQueryClient();
  const generation = useAuthStore((state) => state.generation);
  return useMutation({
    mutationFn: ({ path, method = 'delete', data }) =>
      personalRequest(path, { method, data }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: scopedKey(generation) }),
  });
}
export function referencePath({ module, id }) {
  return '/' + module + '/' + id;
}

// Cards mounted in the same tick share a bounded owned-status request.
const queues = new Map();
export function savedStatus(generation, module, id) {
  return new Promise((resolve, reject) => {
    let queue = queues.get(generation);
    if (!queue) {
      queue = [];
      queues.set(generation, queue);
      queueMicrotask(() => {
        queues.delete(generation);
        if (useAuthStore.getState().generation !== generation) {
          for (const item of queue) item.resolve(false);
          return;
        }
        for (let offset = 0; offset < queue.length; offset += 40) {
          const group = queue.slice(offset, offset + 40);
          personalRequest('/watchlist/status', {
            params: { targets: group.map((item) => item.key).join(',') },
          }).then(
            (rows) => {
              const set = new Set(
                rows
                  .filter((item) => item.saved)
                  .map((item) => item.module + ':' + item.id),
              );
              for (const item of group) item.resolve(set.has(item.key));
            },
            (error) => {
              for (const item of group) item.reject(error);
            },
          );
        }
      });
    }
    queue.push({ key: module + ':' + id, resolve, reject });
  });
}
