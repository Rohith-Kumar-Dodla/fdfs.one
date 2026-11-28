import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { eventCategories, formatEventTime } from '../../../../shared/live.js';
import { languages } from '../../../../shared/films.js';
import { apiClient } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import { PlaybackGate } from '../media/PlaybackGate.jsx';
import {
  Badge,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../components/ui/states.jsx';
import {
  unavailableMetadata,
  usePageMetadata,
} from '../../hooks/use-page-metadata.js';
import { DetailLink } from '../admin/common.jsx';
import { protectedRequest } from '../auth/api.js';
import { useAccount } from '../auth/guards.jsx';
import { useSiteSettings } from '../site/public.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { ProgressPlayer } from '../personal/Playback.jsx';
import { SaveAction } from '../personal/Actions.jsx';
import { Related } from '../personal/Related.jsx';
import { LiveChat, useLiveConnection } from './Chat.jsx';

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

export { LiveDirectory } from '../public-ui/Directories.jsx';

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
  const settings = useSiteSettings();
  const { data: account } = useAccount();
  const realtime = useLiveConnection(slug, account);
  const chat =
    settings.communityOpen &&
    event.chatEnabled &&
    event.broadcast !== 'cancelled';
  const video = event.video ?? event.replay;
  return (
    <>
      <header className="grid min-w-0 gap-3 rounded-panel bg-surface/45 p-4 wrap-anywhere sm:p-6">
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
        <div className="flex flex-wrap items-start gap-3">
          {!['cancelled', 'postponed'].includes(event.broadcast) && (
            <SaveAction item={event} module="live" />
          )}
          <div tabIndex={-1} id="live-reminder">
            <ReminderControl event={event} account={account} />
          </div>
        </div>
      </header>
      <div
        className={
          'grid min-w-0 items-start gap-5' +
          (chat ? ' lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]' : '')
        }
      >
        <div
          id="playback"
          tabIndex={-1}
          className="grid min-w-0 scroll-mt-24 gap-4 wrap-anywhere"
        >
          {video ? (
            <PlaybackGate
              module="live"
              slug={slug}
              artwork={event.banner ?? event.poster}
              id="playback-access"
            >
              {({ video, replay }) =>
                (video || replay) && (
                  <ProgressPlayer
                    item={
                      event.broadcast === 'ended' && event.replay
                        ? { id: event.id, module: 'live' }
                        : undefined
                    }
                    key={(video ?? replay).playbackType}
                    video={video ?? replay}
                    title={
                      event.title +
                      (event.replay ? ' replay' : ' live broadcast')
                    }
                  />
                )
              }
            </PlaybackGate>
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
      <Related module="live" id={event.id} />
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
    query.error?.status === 404
      ? unavailableMetadata
      : event && {
          title: event.title + ' | FDFS Live',
          description: event.summary,
          path,
          image: event.thumbnail?.url,
          structured: event.startAt && {
            '@type': 'Event',
            name: event.title,
            description: event.summary,
            startDate: event.startAt,
            eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
            location: {
              '@type': 'VirtualLocation',
              url: new URL(path, window.location.origin).href,
            },
          },
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
