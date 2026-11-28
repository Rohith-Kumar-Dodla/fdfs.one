import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { apiClient } from '../../api/client.js';
import { Container } from '../../components/ui/surfaces.jsx';
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

export function NotificationsLink({
  onNavigate,
  className,
  icon = false,
  administrator = false,
}) {
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
      to={administrator ? '/admin/notifications' : '/account/notifications'}
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
