import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { eventCategories, formatEventTime } from '../../../../shared/live.js';
import { languages } from '../../../../shared/films.js';
import { apiClient } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import {
  Badge,
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../components/ui/states.jsx';
import { usePageMetadata } from '../../hooks/use-page-metadata.js';
import { control, DetailLink } from '../admin/common.jsx';
import { protectedRequest } from '../auth/api.js';
import { useAccount } from '../auth/guards.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { YouTubePlayer } from '../media/YouTubePlayer.jsx';
import { LiveChat, useLiveConnection } from './Chat.jsx';

const views = [
  ['live', 'Live now', 'There are no live broadcasts right now.'],
  [
    'upcoming',
    'Upcoming events',
    'There are no upcoming events for these filters.',
  ],
  ['replay', 'Replays', 'There are no published replays for these filters.'],
];
const field = 'grid min-w-0 gap-1 text-sm';
const wrapper = 'grid gap-6 py-8 sm:gap-8 sm:py-12';
const eventPath = (slug) => '/live/' + encodeURIComponent(slug);

function Status({ event }) {
  const label =
    event.broadcast === 'live'
      ? 'LIVE'
      : event.hasReplay
        ? 'Replay available'
        : event.broadcast[0].toUpperCase() + event.broadcast.slice(1);
  return event.broadcast === 'live' ? (
    <span className="inline-flex rounded-full border border-danger-text px-3 py-1 text-xs font-bold text-danger-text">
      {label}
    </span>
  ) : (
    <Badge>{label}</Badge>
  );
}

function Schedule({ event }) {
  return (
    <p className="text-sm text-muted">
      <time dateTime={event.startAt}>
        {formatEventTime(event.startAt, event.timeZone)}
      </time>
      {event.endAt && (
        <>
          {' '}
          to{' '}
          <time dateTime={event.endAt}>
            {formatEventTime(event.endAt, event.timeZone)}
          </time>
        </>
      )}
      {' · ' + event.timeZone}
    </p>
  );
}

function EventSection({
  availability,
  heading,
  empty,
  filters,
  page,
  changePage,
}) {
  const query = useQuery({
    queryKey: ['live', 'directory', availability, filters, page],
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient.get('/live', {
        signal,
        params: {
          ...filters,
          availability,
          page,
          limit: 6,
          sort: availability === 'replay' ? 'latest' : 'soonest',
        },
      }),
    refetchInterval: 60000,
  });
  return (
    <section className="grid gap-4">
      <SectionHeading>{heading}</SectionHeading>
      {query.isPending && (
        <div
          role="status"
          aria-label={'Loading ' + heading}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="aspect-video" />
          ))}
        </div>
      )}
      {query.isError && (
        <ErrorState
          title={'Could not load ' + heading.toLowerCase()}
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isSuccess && query.data.data.length === 0 && (
        <EmptyState title={empty} />
      )}
      {query.isSuccess && (
        <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.data.map((event) => (
              <Card
                key={event.id}
                as="article"
                className="grid min-w-0 content-start gap-2 wrap-anywhere"
              >
                <FilmImage
                  landscape
                  image={
                    (event.hasReplay && event.replayThumbnail) ||
                    event.banner ||
                    event.poster
                  }
                  sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 90vw"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Status event={event} />
                  <span className="text-sm text-muted">
                    {eventCategories[event.category]}
                  </span>
                </div>
                <h3 className="text-lg font-semibold">
                  <DetailLink to={eventPath(event.slug)}>
                    {event.title}
                  </DetailLink>
                </h3>
                {event.organizer && (
                  <p className="text-sm">Organized by {event.organizer}</p>
                )}
                <Schedule event={event} />
              </Card>
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={query.data.pagination.totalPages}
            onPageChange={changePage}
          />
          {page > 1 && query.data.data.length === 0 && (
            <div>
              <Button variant="outline" onClick={() => changePage(1)}>
                Return to first page
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function LiveDirectory() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category');
  const filterDate = (name) =>
    /^\d{4}-\d{2}-\d{2}$/.test(params.get(name) ?? '')
      ? params.get(name)
      : undefined;
  const filters = {
    q: params.get('q')?.trim().slice(0, 80) || undefined,
    category: Object.hasOwn(eventCategories, category) ? category : undefined,
    from: filterDate('from'),
    to: filterDate('to'),
  };
  usePageMetadata({
    title: 'FDFS Live | FDFS.ONE',
    description:
      'Watch community events, find upcoming broadcasts and catch up with replays.',
    path: '/live',
  });
  return (
    <Container className={wrapper}>
      <header className="grid gap-3">
        <SectionHeading as="h1">FDFS Live</SectionHeading>
        <p className="text-muted">
          Watch live events, find upcoming broadcasts and catch up with replays.
        </p>
      </header>
      <form
        key={JSON.stringify(filters)}
        className="grid min-w-0 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const next = new URLSearchParams();
          for (const [key, value] of new FormData(e.currentTarget))
            if (value.trim()) next.set(key, value.trim());
          setParams(next);
        }}
      >
        <label className={field}>
          Search events
          <input
            className={control}
            type="search"
            name="q"
            maxLength={80}
            defaultValue={filters.q}
          />
        </label>
        <label className={field}>
          Category
          <select
            className={control}
            name="category"
            defaultValue={filters.category ?? ''}
          >
            <option value="">All categories</option>
            {Object.entries(eventCategories).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          From date (UTC)
          <input
            className={control}
            type="date"
            name="from"
            defaultValue={filters.from}
          />
        </label>
        <label className={field}>
          To date (UTC)
          <input
            className={control}
            type="date"
            name="to"
            defaultValue={filters.to}
          />
        </label>
        <Button type="submit">Apply filters</Button>
      </form>
      {views.map(([key, heading, empty]) => {
        const page = Math.min(
          10000,
          Math.max(1, Math.trunc(Number(params.get(key)) || 1)),
        );
        return (
          <EventSection
            key={key}
            availability={key}
            heading={heading}
            empty={empty}
            filters={filters}
            page={page}
            changePage={(next) =>
              setParams((current) => {
                const search = new URLSearchParams(current);
                search.set(key, String(next));
                return search;
              })
            }
          />
        );
      })}
    </Container>
  );
}

export function Countdown({ startAt, serverNow }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const begin = performance.now();
    const timer = setInterval(
      () => setElapsed(performance.now() - begin),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(startAt) - Date.parse(serverNow) - elapsed) / 1000),
  );
  if (!seconds)
    return (
      <p role="status">Waiting for the organizer to start the broadcast.</p>
    );
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  return (
    <p className="font-semibold tabular-nums">
      Scheduled to start in {days > 0 && days + 'd '}
      {hours}h {minutes}m {seconds % 60}s
    </p>
  );
}

function ReminderControl({ event, account }) {
  const ready = account?.status === 'active' && account.emailVerified;
  const path = eventPath(event.slug) + '/reminder';
  const client = useQueryClient();
  const key = ['live-reminder', event.id, account?.id];
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(ready),
    queryFn: ({ signal }) =>
      protectedRequest({ url: path, signal }).then((response) => response.data),
  });
  const change = useMutation({
    mutationFn: (subscribed) =>
      protectedRequest({ url: path, method: subscribed ? 'delete' : 'put' }),
    onSuccess: (response) => client.setQueryData(key, response.data),
  });
  const possible =
    event.remindersEnabled &&
    event.broadcast === 'scheduled' &&
    Date.parse(event.startAt) > Date.parse(event.serverNow);
  if (!possible && !query.data?.subscribed) return null;
  if (!account)
    return (
      <Link
        to="/login"
        state={{ from: eventPath(event.slug) }}
        className="inline-flex min-h-11 items-center text-accent underline"
      >
        Sign in for a reminder
      </Link>
    );
  if (!ready)
    return (
      <p className="text-sm text-muted">
        A verified, active account is required for email reminders.
      </p>
    );
  const subscribed = query.data?.subscribed;
  return (
    <div className="grid justify-items-start gap-2">
      <Button
        variant="outline"
        disabled={!query.isSuccess}
        loading={query.isPending || change.isPending}
        onClick={() => change.mutate(subscribed)}
      >
        {subscribed ? 'Cancel reminder' : 'Remind me by email'}
      </Button>
      {subscribed && (
        <p role="status" className="text-sm text-muted">
          {{
            sent: 'Reminder sent.',
            paused: 'Reminder paused.',
            failed: 'Reminder delivery failed.',
            uncertain: 'Reminder delivery could not be confirmed.',
          }[query.data.state] ?? 'Reminder subscription active.'}
        </p>
      )}
      {query.isError && (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry reminder status
        </Button>
      )}
      {change.isError && (
        <p role="alert" className="text-sm text-danger-text">
          {change.error.message}
        </p>
      )}
    </div>
  );
}

function EventContent({ event, slug }) {
  const { data: account } = useAccount();
  const realtime = useLiveConnection(slug, account);
  const chat = event.chatEnabled && event.broadcast !== 'cancelled';
  const video = event.video ?? event.replay;
  return (
    <>
      <header className="grid min-w-0 gap-3 wrap-anywhere">
        <div className="flex flex-wrap items-center gap-3">
          <Status event={event} />
          <span>{eventCategories[event.category]}</span>
        </div>
        <SectionHeading as="h1">{event.title}</SectionHeading>
        {event.organizer && <p>Organized by {event.organizer}</p>}
        <Schedule event={event} />
        <p className="text-sm text-muted">
          {[languages[event.language], event.topic, event.venue]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <ReminderControl event={event} account={account} />
      </header>
      <div
        className={
          'grid min-w-0 items-start gap-5' +
          (chat ? ' lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]' : '')
        }
      >
        <div className="grid min-w-0 gap-4 wrap-anywhere">
          {video ? (
            <YouTubePlayer
              key={video.playbackType}
              video={video}
              title={
                event.title + (event.replay ? ' replay' : ' live broadcast')
              }
            />
          ) : (
            <FilmImage landscape eager image={event.banner || event.poster} />
          )}
          {event.broadcast === 'scheduled' && (
            <Countdown
              key={event.serverNow}
              startAt={event.startAt}
              serverNow={event.serverNow}
            />
          )}
          {event.broadcast === 'ended' && (
            <p>
              {event.replay
                ? 'Watch the broadcast replay above.'
                : 'The broadcast has ended.'}
            </p>
          )}
          {event.broadcast === 'cancelled' && <p>This event was cancelled.</p>}
          {event.broadcast === 'postponed' && (
            <p>This event was postponed. Check back for a new date.</p>
          )}
          <h2 className="text-xl font-semibold">About this event</h2>
          <p className="whitespace-pre-wrap">{event.description}</p>
          {event.talent?.length > 0 && (
            <ul className="flex flex-wrap gap-x-4" aria-label="Talent profiles">
              {event.talent.map((person) => (
                <li key={person.id}>
                  <DetailLink to={'/talent/' + person.slug}>
                    {person.displayName}
                  </DetailLink>
                </li>
              ))}
            </ul>
          )}
        </div>
        {chat && (
          <LiveChat event={event} account={account} realtime={realtime} />
        )}
      </div>
    </>
  );
}

export function LiveDetail() {
  const { slug } = useParams();
  const path = eventPath(slug);
  const query = useQuery({
    queryKey: ['live', 'event', slug],
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient.get(path, { signal }).then((response) => response.data),
    refetchInterval: 30000,
  });
  const event = query.data;
  usePageMetadata(
    event && {
      title: event.title + ' | FDFS Live',
      description: event.summary,
      path,
    },
  );
  return (
    <Container className={wrapper}>
      <Link
        to="/live"
        className="inline-flex min-h-11 items-center text-accent underline"
      >
        Back to FDFS Live
      </Link>
      {query.isPending && (
        <div role="status" aria-label="Loading event" className="grid gap-3">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="aspect-video" />
        </div>
      )}
      {query.isError &&
        (query.error.status === 404 ? (
          <EmptyState
            title="Event not found"
            description="This event may have been removed or is unavailable."
          />
        ) : (
          <ErrorState
            title="Could not load event"
            description={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ))}
      {query.isSuccess && <EventContent key={slug} slug={slug} event={event} />}
    </Container>
  );
}
