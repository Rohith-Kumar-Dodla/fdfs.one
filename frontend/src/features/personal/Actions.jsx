import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { Bookmark, UserRoundPlus } from 'lucide-react';
import { saveTypes } from '../../../../shared/personal.js';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { useAuthStore } from '../auth/state.js';
import { personalRequest, savedStatus, scopedKey } from './api.js';

function OwnedAction({ item, follow }) {
  const { id, module, title } = item;
  const client = useQueryClient();
  const generation = useAuthStore((state) => state.generation);
  const status = useAuthStore((state) => state.status);
  const location = useLocation();
  const path = follow ? '/following/' + id : '/watchlist/' + module + '/' + id;
  const label = follow ? 'Follow' : 'Save';
  const property = follow ? 'following' : 'saved';
  const key = scopedKey(generation, 'status', path);
  const state = useQuery({
    queryKey: key,
    enabled: status === 'authenticated' && !!id,
    staleTime: 30000,
    queryFn: ({ signal }) =>
      follow
        ? personalRequest(path, { signal }).then((data) => data[property])
        : savedStatus(generation, module, id),
  });
  const change = useMutation({
    mutationFn: (value) =>
      personalRequest(path, { method: value ? 'put' : 'delete' }),
    onMutate: async (value) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData(key);
      if (useAuthStore.getState().generation === generation)
        client.setQueryData(key, value);
      return previous;
    },
    onError: (_error, _value, previous) => {
      if (useAuthStore.getState().generation === generation)
        client.setQueryData(key, previous ?? false);
    },
    onSuccess: async (data) => {
      if (useAuthStore.getState().generation !== generation) return;
      client.setQueryData(key, data[property]);
      await client.invalidateQueries({
        queryKey: scopedKey(generation),
        predicate: (query) => query.queryKey[2] !== 'status',
      });
    },
  });
  if (!id || status === 'checking') return null;
  const Icon = follow ? UserRoundPlus : Bookmark;
  if (status !== 'authenticated') {
    const back = location.pathname + location.search;
    return (
      <Link
        to="/login"
        state={{ from: back }}
        className={buttonClasses('outline')}
        aria-label={
          'Sign in to ' + label.toLowerCase() + ' ' + (title ?? 'content')
        }
      >
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </Link>
    );
  }
  return (
    <div className="grid min-w-0 gap-1">
      <Button
        variant="outline"
        disabled={state.isPending || change.isPending}
        aria-pressed={Boolean(state.data)}
        aria-label={
          (state.data ? (follow ? 'Unfollow' : 'Remove saved') : label) +
          ' ' +
          (title ?? 'content')
        }
        onClick={() => change.mutate(!state.data)}
      >
        <Icon
          aria-hidden="true"
          className={
            'size-4 shrink-0 ' + (state.data ? 'fill-accent text-accent' : '')
          }
        />
        {state.data ? (follow ? 'Following' : 'Saved') : label}
      </Button>
      {change.isError && (
        <p role="alert" className="text-sm text-danger-text wrap-anywhere">
          {change.error.message}
        </p>
      )}
    </div>
  );
}
export function SaveAction({ item, module = item.module }) {
  return saveTypes.includes(module) ? (
    <OwnedAction item={{ ...item, module }} />
  ) : null;
}
export function FollowAction({ profile }) {
  return (
    <OwnedAction item={{ id: profile.id, title: profile.displayName }} follow />
  );
}
