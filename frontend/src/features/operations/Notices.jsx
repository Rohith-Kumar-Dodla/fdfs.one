import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { apiClient } from '../../api/client.js';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Button } from '../../components/ui/Button.jsx';
import {
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import {
  EmptyState,
  ErrorState,
  Spinner,
} from '../../components/ui/states.jsx';
import { date, DetailLink } from '../admin/common.jsx';
import { protectedRequest } from '../auth/api.js';
import { useAuthStore } from '../auth/state.js';

export function AnnouncementBanners() {
  const authenticated = useAuthStore(
    (state) => state.status === 'authenticated',
  );
  const publicRows = useQuery({
    queryKey: ['announcements', 'public'],
    meta: { public: true },
    refetchInterval: 30000,
    queryFn: ({ signal }) =>
      apiClient.get('/announcements', { signal }).then(({ data }) => data),
  });
  const accountRows = useQuery({
    queryKey: ['announcements', 'account'],
    enabled: authenticated,
    refetchInterval: 30000,
    queryFn: ({ signal }) =>
      protectedRequest({ url: '/announcements/account', signal }).then(
        ({ data }) => data,
      ),
  });
  const rows = [
    ...(Array.isArray(publicRows.data) ? publicRows.data : []),
    ...(authenticated && Array.isArray(accountRows.data)
      ? accountRows.data
      : []),
  ];
  if (!rows.length) return null;
  return (
    <Container
      className="grid gap-2 py-3"
      as="section"
      aria-label="Platform announcements"
    >
      {rows.map((item) => (
        <article
          key={item.id}
          className="grid gap-1 rounded-control border border-line bg-surface px-4 py-3 wrap-anywhere"
        >
          <h2 className="font-semibold text-accent">{item.title}</h2>
          <p className="whitespace-pre-wrap text-sm">{item.message}</p>
        </article>
      ))}
    </Container>
  );
}

export function NotificationsLink({ onNavigate, className, icon = false }) {
  const query = useQuery({
    queryKey: ['notices', 'unread'],
    refetchInterval: 60000,
    queryFn: ({ signal }) =>
      protectedRequest({ url: '/notifications/unread', signal }).then(
        ({ data }) => data,
      ),
  });
  return (
    <Link
      to="/account/notifications"
      onClick={onNavigate}
      className={className}
      aria-label={
        icon
          ? 'Notifications' +
            (query.data?.count > 0 ? ' (' + query.data.count + ' unread)' : '')
          : undefined
      }
    >
      {icon ? (
        <>
          <Bell aria-hidden="true" className="size-5" />
          {query.data?.count > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 size-2 rounded-full bg-accent"
            />
          )}
        </>
      ) : (
        <>
          Notifications{query.data?.count > 0 && ' (' + query.data.count + ')'}
        </>
      )}
    </Link>
  );
}

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('');
  const [unread, setUnread] = useState(false);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['notices', 'list', page, kind, unread],
    refetchInterval: 60000,
    queryFn: ({ signal }) =>
      protectedRequest({
        url: '/notifications',
        params: {
          page,
          kind: kind || undefined,
          unread: unread ? 'true' : undefined,
        },
        signal,
      }),
  });
  const change = useMutation({
    mutationFn: (id) =>
      protectedRequest({
        url: id ? '/notifications/' + id + '/read' : '/notifications/read',
        method: 'patch',
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notices'] }),
  });
  return (
    <Container className="grid min-w-0 gap-4 py-8 sm:py-12">
      <SectionHeading as="h1">Notifications</SectionHeading>
      <DetailLink to="/dashboard">Back to dashboard</DetailLink>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          Notification category
          <select
            className="min-h-11 rounded-control border border-line bg-base px-3"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All notifications</option>
            <option value="releases">Releases and reminders</option>
            <option value="reviews">Reviews and comments</option>
            <option value="support">Support tickets</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unread}
            onChange={(event) => {
              setUnread(event.target.checked);
              setPage(1);
            }}
          />
          Unread only
        </label>
      </div>
      {query.isPending && <Spinner label="Loading notifications" />}
      {query.isError && (
        <ErrorState
          title="Could not load notifications"
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isSuccess &&
        (query.data.data.length ? (
          <>
            <div>
              <Button
                variant="outline"
                loading={change.isPending}
                onClick={() => change.mutate(null)}
              >
                Mark all as read
              </Button>
            </div>
            <ul className="grid gap-2">
              {query.data.data.map((entry) => (
                <Card
                  as="li"
                  className="grid min-w-0 gap-2 wrap-anywhere"
                  key={entry.id}
                >
                  <DetailLink to={entry.destination}>{entry.label}</DetailLink>
                  <p className="text-sm text-muted">
                    {date(entry.createdAt)} · {entry.readAt ? 'Read' : 'Unread'}
                  </p>
                  {!entry.readAt && (
                    <div>
                      <Button
                        variant="outline"
                        disabled={change.isPending}
                        onClick={() => change.mutate(entry.id)}
                      >
                        Mark as read
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </ul>
            <Pagination
              page={page}
              totalPages={query.data.pagination.totalPages}
              onPageChange={setPage}
            />
          </>
        ) : (
          <EmptyState title="No notifications" />
        ))}
      {change.isError && <p role="alert">{change.error.message}</p>}
    </Container>
  );
}
