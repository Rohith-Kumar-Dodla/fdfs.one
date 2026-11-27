import { CompactLiveForm } from '../admin/CompactVideoForms.jsx';
import {
  ContentGrid,
  ContentHeading,
  RecordFilters,
} from '../admin/ContentGrid.jsx';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import {
  broadcasts,
  eventCategories,
  formatEventTime,
} from '../../../../shared/live.js';
import { YouTubePlayer } from '../media/YouTubePlayer.jsx';
import { Button } from '../../components/ui/Button.jsx';
import {
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import {
  ConfirmAction,
  control,
  DetailLink,
  get,
  QueryState,
  readable,
  useChange,
  useRecords,
} from '../admin/common.jsx';
import {
  ArtworkUpload,
  EventForm,
  EventProposalReview,
  field,
  readSchedule,
  ScheduleFields,
} from './Form.jsx';

const options = (values) => values.map((value) => [value, readable(value)]);
const listPath = (admin) => (admin ? '/admin/live' : '/organizer/live');
const queryKeys = [
  '/admin/live',
  '/organizer/live',
  '/admin/audit',
  '/admin/overview',
  'live',
  'site-homepage',
];
function Workspace({ admin, children }) {
  return admin ? (
    children
  ) : (
    <Container className="grid gap-6 py-8 sm:py-12">{children}</Container>
  );
}

export function LiveManagement({ admin = false }) {
  const base = listPath(admin);
  const records = useRecords(base);
  const fields = [
    ['q', 'Search events'],
    ['category', 'Category', Object.entries(eventCategories)],
    ['broadcast', 'Broadcast', options(broadcasts)],
    ['status', 'Publication', options(['draft', 'published', 'archived'])],
    ...(admin
      ? [
          ['moderation', 'Moderation', options(['pending', 'approved'])],
          ['organizer', 'Organizer account ID'],
        ]
      : []),
  ];
  return (
    <Workspace admin={admin}>
      <ContentHeading
        title={admin ? 'FDFS Live' : 'My Live Events'}
        create={base + '/new'}
        action={admin ? 'Create Live Event' : 'Create Event Draft'}
      >
        <RecordFilters records={records} fields={fields} />
      </ContentHeading>
      <DetailLink to={(admin ? '/admin' : '') + '/submissions?category=live'}>
        {admin ? 'Review event submissions' : 'My event submissions'}
      </DetailLink>
      <ContentGrid
        records={records}
        empty="No events found"
        entry={(row) => ({
          title: row.title,
          image: row.banner ?? row.poster ?? row.replayThumbnail,
          meta: [
            eventCategories[row.category],
            formatEventTime(row.startAt, row.timeZone),
            readable(row.broadcast),
          ].join(' · '),
          edit: base + '/' + row.id,
          preview:
            row.status === 'published' &&
            (!row.publicationAt || Date.parse(row.publicationAt) <= Date.now())
              ? '/live/' + row.slug
              : base + '/' + row.id + '#preview',
        })}
      />
    </Workspace>
  );
}

export function NewLiveEvent({ admin = false }) {
  if (admin)
    return (
      <>
        <SectionHeading as="h1">Create Live Event</SectionHeading>
        <CompactLiveForm />
      </>
    );
  return (
    <Workspace admin={admin}>
      <DetailLink to={listPath(admin)}>Back to live events</DetailLink>
      <SectionHeading as="h1">
        {admin ? 'Create Live Event' : 'Create event draft'}
      </SectionHeading>
      <EventForm admin={admin} />
    </Workspace>
  );
}

function EventActions({ event, admin, path }) {
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState('');
  const [thumb, setThumb] = useState(event.replayThumbnail);
  const [publication, setPublication] = useState('');
  const change = useChange(queryKeys);
  const ask = (action, label, details) => {
    change.reset();
    setConfirmation({
      title:
        action === 'archive'
          ? 'Remove “' + event.title + '”?'
          : action === 'remove_replay'
            ? 'Remove replay for “' + event.title + '”?'
            : label + '?',
      description:
        action === 'archive'
          ? 'This archives the event, removes the event and replay from public view, and cancels unsent reminders. Records, artwork and the YouTube video are retained.'
          : action === 'remove_replay'
            ? 'The replay will leave public view. The event and externally hosted YouTube video will be retained.'
            : action === 'start'
              ? 'Confirm that the authorized YouTube broadcast is live and ready to embed.'
              : event.title,
      request: {
        url: path + '/status',
        method: 'patch',
        data: { action, revision: event.revision, ...details },
      },
    });
  };
  const scheduled = event.broadcast === 'scheduled';
  const editable = scheduled || event.broadcast === 'postponed';
  const published = event.status === 'published';
  const actions = [
    ...(published &&
    scheduled &&
    (!event.publicationAt ||
      Date.parse(event.publicationAt) <= Date.parse(event.serverNow))
      ? [['start', 'Start broadcast', { broadcasting: true }]]
      : []),
    ...(event.broadcast === 'live' ? [['end', 'End broadcast']] : []),
    ...(admin && event.broadcast !== 'live'
      ? [
          ...(published
            ? [['unpublish', 'Unpublish event']]
            : scheduled || event.moderation === 'approved'
              ? [['publish', 'Approve and publish event']]
              : []),
          ...(editable ? [['cancel', 'Cancel event']] : []),
          ...(scheduled ? [['postpone', 'Postpone event']] : []),
          ...(event.hasReplay ? [['remove_replay', 'Remove replay']] : []),
        ]
      : []),
    ...(admin ? [['archive', 'Remove event']] : []),
  ];
  return (
    <>
      {actions.length > 0 && (
        <Card className="grid min-w-0 gap-3">
          <h2 className="text-lg font-semibold">Broadcast and publication</h2>
          {admin &&
            !published &&
            (scheduled || event.moderation === 'approved') && (
              <label className={field}>
                Announcement publication time (optional, local)
                <input
                  type="datetime-local"
                  className={control}
                  value={publication}
                  onChange={(event) => setPublication(event.target.value)}
                />
              </label>
            )}
          {published &&
            event.publicationAt &&
            Date.parse(event.publicationAt) > Date.parse(event.serverNow) && (
              <p>
                Announcement scheduled for{' '}
                {new Date(event.publicationAt).toLocaleString()}.
              </p>
            )}
          <div className="flex flex-wrap gap-2">
            {actions.map(([action, label, details]) => (
              <Button
                key={action}
                variant="outline"
                onClick={() =>
                  ask(
                    action,
                    label,
                    action === 'publish' && publication
                      ? { publicationAt: new Date(publication).toISOString() }
                      : details,
                  )
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </Card>
      )}
      {admin && editable && (
        <Card className="grid gap-3">
          <h2 className="text-lg font-semibold">Reschedule</h2>
          <form
            className="grid min-w-0 gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              try {
                ask(
                  'reschedule',
                  'Confirm new schedule',
                  readSchedule(new FormData(e.currentTarget)),
                );
              } catch (failure) {
                setError(
                  failure instanceof RangeError
                    ? 'Enter a valid IANA timezone.'
                    : failure.message,
                );
              }
            }}
          >
            <ScheduleFields event={event} />
            <div className="self-end">
              <Button type="submit" variant="outline">
                Reschedule event
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-danger-text">
                {error}
              </p>
            )}
          </form>
        </Card>
      )}
      {admin && event.broadcast === 'ended' && (
        <Card className="grid min-w-0 gap-3">
          <h2 className="text-lg font-semibold">Replay</h2>
          <ArtworkUpload
            admin
            label="Replay thumbnail (optional)"
            image={thumb}
            onChange={setThumb}
          />
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              ask('replay', 'Publish replay', {
                replayUrl: data.get('url').trim(),
                thumbnailId: thumb?.id,
                rightsConfirmed: data.has('rights'),
              });
            }}
          >
            <label className={field}>
              Replay YouTube URL
              <input
                name="url"
                type="url"
                className={control}
                maxLength={2048}
                required
                defaultValue={event.replay?.sourceUrl ?? event.plannedReplayUrl}
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input name="rights" type="checkbox" required />I confirm
              permission to publish this replay.
            </label>
            <div>
              <Button type="submit">Publish replay</Button>
            </div>
          </form>
        </Card>
      )}
      <ConfirmAction
        action={confirmation}
        change={change}
        onClose={() => setConfirmation(null)}
      />
    </>
  );
}

function ChatSettings({ event, admin, path }) {
  const change = useChange(queryKeys);
  return (
    <Card className="grid min-w-0 gap-3">
      <h2 className="text-lg font-semibold">Chat and reminders</h2>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          change.mutate({
            url: path + '/options',
            method: 'patch',
            data: {
              revision: event.revision,
              chatEnabled: data.has('chat'),
              slowSeconds: Number(data.get('slow')),
              ...(admin && { remindersEnabled: data.has('reminders') }),
            },
          });
        }}
      >
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name="chat"
            defaultChecked={event.chatEnabled}
          />
          Enable event chat
        </label>
        <label className={field}>
          Slow mode (seconds between messages)
          <input
            className={control}
            name="slow"
            defaultValue={event.slowSeconds}
            type="number"
            min="0"
            max="120"
            required
          />
        </label>
        {admin && (
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="reminders"
              defaultChecked={event.remindersEnabled}
            />
            Enable reminder subscriptions
          </label>
        )}
        <div>
          <Button type="submit" variant="outline" loading={change.isPending}>
            Save settings
          </Button>
        </div>
        {change.isError && <p role="alert">{change.error.message}</p>}
        {change.isSuccess && <p role="status">Settings saved.</p>}
      </form>
    </Card>
  );
}

export function ChatModeration({ path }) {
  const [reports, setReports] = useState(false);
  const [reason, setReason] = useState('');
  const [cursor, setCursor] = useState();
  const [confirmation, setConfirmation] = useState(null);
  const url = path + '/chat';
  const query = useQuery({
    queryKey: [url, reports, cursor],
    staleTime: 0,
    refetchInterval: 12000,
    queryFn: ({ signal }) =>
      get(url + (reports ? '/reports' : ''), signal, { cursor }),
  });
  const change = useChange([
    url,
    '/admin/audit',
    '/admin/moderation/live-reports',
    '/admin/overview',
  ]);
  function action(operation, id, label, minutes) {
    change.reset();
    setConfirmation({
      title: label + '?',
      request: {
        url,
        method: 'patch',
        data: {
          action: operation,
          ...(operation === 'resolve' ? { reportId: id } : { messageId: id }),
          ...(minutes && { minutes }),
          ...(reason.trim() && { reason: reason.trim() }),
        },
      },
    });
  }
  return (
    <Card className="grid min-w-0 gap-4">
      <h2 className="text-lg font-semibold">Chat moderation</h2>
      <label className={field}>
        Moderation reason (optional)
        <input
          className={control}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          aria-pressed={!reports}
          onClick={() => {
            setReports(false);
            setCursor(undefined);
          }}
        >
          Messages
        </Button>
        <Button
          variant="outline"
          aria-pressed={reports}
          onClick={() => {
            setReports(true);
            setCursor(undefined);
          }}
        >
          Open reports
        </Button>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Refresh
        </Button>
      </div>
      <QueryState query={query}>
        {(data) => {
          const rows = reports ? data.reports : data.messages;
          return (
            <>
              {rows.length === 0 && (
                <p className="text-muted">
                  {reports ? 'No open reports.' : 'No chat messages.'}
                </p>
              )}
              <ul className="grid gap-3">
                {rows.map((row) => {
                  const message = reports ? row.message : row;
                  return (
                    <li
                      key={row.id}
                      className="grid min-w-0 gap-2 border-b border-line pb-3 wrap-anywhere"
                    >
                      <p>
                        <strong>{message.name}</strong>
                        {row.hidden && ' · Hidden'}
                        {reports && ' · ' + readable(row.reason)}
                      </p>
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      <div className="flex flex-wrap gap-2">
                        {row.hidden ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              action('restore', message.id, 'Restore message')
                            }
                          >
                            Restore message
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() =>
                              action('hide', message.id, 'Hide message')
                            }
                          >
                            Hide message
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          onClick={() =>
                            action('unmute', message.id, 'Unmute participant')
                          }
                        >
                          Unmute
                        </Button>
                        {reports && (
                          <Button
                            variant="outline"
                            onClick={() =>
                              action('resolve', row.id, 'Resolve report')
                            }
                          >
                            Resolve report
                          </Button>
                        )}
                      </div>
                      <form
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          action(
                            'mute',
                            message.id,
                            'Mute participant',
                            Number(
                              new FormData(e.currentTarget).get('minutes'),
                            ),
                          );
                        }}
                      >
                        <label className={field}>
                          Mute duration (minutes)
                          <input
                            className={control}
                            name="minutes"
                            defaultValue="10"
                            type="number"
                            min="1"
                            max="1440"
                            required
                          />
                        </label>
                        <Button variant="outline" type="submit">
                          Mute
                        </Button>
                      </form>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                {data.cursor && (
                  <Button
                    variant="outline"
                    onClick={() => setCursor(data.cursor)}
                  >
                    Older entries
                  </Button>
                )}
                {cursor && (
                  <Button
                    variant="outline"
                    onClick={() => setCursor(undefined)}
                  >
                    Recent entries
                  </Button>
                )}
              </div>
            </>
          );
        }}
      </QueryState>
      <ConfirmAction
        action={confirmation}
        change={change}
        onClose={() => setConfirmation(null)}
      />
    </Card>
  );
}

function EventPreview({ event }) {
  const [show, setShow] = useState(false);
  const video = event.broadcast === 'ended' ? event.replay : event.video;
  if (!video) return null;
  return (
    <Card className="grid min-w-0 gap-2">
      <h2 className="font-semibold">Protected playback preview</h2>
      <div>
        <Button variant="outline" onClick={() => setShow(!show)}>
          {show ? 'Close video preview' : 'Preview event video'}
        </Button>
      </div>
      {show && <YouTubePlayer video={video} title={event.title + ' preview'} />}
    </Card>
  );
}

export function ManageLiveEvent({ admin = false, correction = false }) {
  const { id } = useParams();
  const base = listPath(admin);
  const path = base + '/' + id;
  const [edit, setEdit] = useState(false);
  const query = useQuery({
    queryKey: [base, id],
    staleTime: 0,
    queryFn: ({ signal }) => get(path, signal),
  });
  return (
    <Workspace admin={admin}>
      <DetailLink to={base}>Back to live events</DetailLink>
      <QueryState query={query}>
        {(event) => {
          const editable =
            ['scheduled', 'postponed'].includes(event.broadcast) &&
            event.status !== 'archived';
          const manageChat =
            event.status !== 'archived' &&
            (admin || event.status === 'published');
          if (correction)
            return (
              <>
                <SectionHeading as="h1">Propose event changes</SectionHeading>
                {editable ? (
                  <EventForm event={event} correction />
                ) : (
                  <p>Changes are closed for this event.</p>
                )}
              </>
            );
          return (
            <>
              <SectionHeading as="h1">{event.title}</SectionHeading>
              <p className="text-sm text-muted">
                {readable(event.moderation)} · {readable(event.status)} ·{' '}
                {readable(event.broadcast)}
              </p>
              <div className="flex flex-wrap gap-3">
                {event.status === 'published' && (
                  <DetailLink to={'/live/' + event.slug}>
                    Open public event
                  </DetailLink>
                )}
                {editable &&
                  (admin ? (
                    <Button variant="outline" onClick={() => setEdit(!edit)}>
                      {edit ? 'Close editor' : 'Edit event'}
                    </Button>
                  ) : (
                    <DetailLink to={path + '/correction'}>
                      Propose event changes
                    </DetailLink>
                  ))}
              </div>
              {editable && edit && admin ? (
                <EventForm admin event={event} />
              ) : (
                <EventProposalReview
                  record={{
                    eventProposal: {
                      event: { ...event, videoUrl: event.video?.sourceUrl },
                    },
                    eventTalent: event.talent,
                    eventImages: { poster: event.poster, banner: event.banner },
                  }}
                />
              )}
              {admin && (
                <div id="preview" tabIndex={-1}>
                  <EventPreview key={event.revision} event={event} />
                </div>
              )}
              {event.status !== 'archived' && (
                <EventActions
                  key={event.revision}
                  event={event}
                  admin={admin}
                  path={path}
                />
              )}
              {admin &&
                event.status !== 'archived' &&
                event.broadcast === 'live' && (
                  <p className="text-sm text-muted">
                    End the live broadcast before removing this event.
                  </p>
                )}
              {manageChat && (
                <ChatSettings event={event} admin={admin} path={path} />
              )}
              {(manageChat || admin) && <ChatModeration path={path} />}
            </>
          );
        }}
      </QueryState>
    </Workspace>
  );
}
