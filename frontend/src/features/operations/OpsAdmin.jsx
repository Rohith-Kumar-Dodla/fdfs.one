import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { announcementTypes, audiences } from '../../../../shared/operations.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import {
  ConfirmAction,
  control,
  date,
  DetailLink,
  get,
  QueryState,
  readable,
  Records,
  Select,
  useChange,
  useRecords,
} from '../admin/common.jsx';
import { useRealtime } from './Realtime.jsx';

const field = 'grid min-w-0 gap-1 text-sm';
const choices = (keys) => keys.map((key) => [key, readable(key)]);
const nullLabel = (value) =>
  value == null ? 'Unavailable' : value.toLocaleString();
const announcementPath = '/admin/announcements';
const announcementKeys = [announcementPath, '/admin/audit', 'announcements'];

function usePresence() {
  const socket = useRealtime();
  const initial = useQuery({
    queryKey: ['/admin/activity'],
    queryFn: ({ signal }) => get('/admin/activity', signal),
    retry: false,
  });
  const [stream, setStream] = useState({ online: false });
  useEffect(() => {
    if (!socket) return;
    let disposed = false;
    const update = (data) => {
      if (!disposed) setStream({ data, online: true });
    };
    const down = () => {
      if (!disposed) setStream((current) => ({ ...current, online: false }));
    };
    const subscribe = () =>
      socket.timeout(5000).emit('ops:subscribe', {}, (error, result) => {
        if (!error && result?.ok) update(result.data);
        else down();
      });
    socket.on('connect', subscribe);
    socket.on('disconnect', down);
    socket.on('ops:presence', update);
    socket.on('ops:revoked', down);
    if (socket.connected) subscribe();
    return () => {
      disposed = true;
      socket.off('connect', subscribe);
      socket.off('disconnect', down);
      socket.off('ops:presence', update);
      socket.off('ops:revoked', down);
      if (socket.connected)
        socket.timeout(4000).emit('ops:unsubscribe', {}, () => {});
    };
  }, [socket]);
  return {
    data: stream.data ?? initial.data?.data,
    online: stream.online,
    initial,
  };
}

export function StatCards({ rows }) {
  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map(([title, value]) => (
        <Card key={title} className="min-w-0 wrap-anywhere">
          <dt className="text-sm text-muted">{title}</dt>
          <dd className="text-xl font-semibold">{nullLabel(value)}</dd>
        </Card>
      ))}
    </dl>
  );
}
const onlineRows = (data) => [
  ['Estimated online visitors', data?.estimatedVisitors],
  ['Authenticated users online', data?.authenticated],
  ['Estimated online guests', data?.estimatedGuests],
  ['Presence connections', data?.connections],
];

function PresenceStatus({ data, online }) {
  return (
    <p role="status" className="text-sm text-muted">
      {data?.available
        ? data.initializing
          ? 'Presence is initializing'
          : online
            ? 'Live updates connected'
            : 'Last known counts. Live updates unavailable'
        : 'Online counts unavailable'}
      {data?.at && ' · ' + date(data.at)}
    </p>
  );
}

export function OperationsOverview() {
  const presence = usePresence();
  const query = useQuery({
    queryKey: ['/admin/analytics/overview'],
    queryFn: ({ signal }) => get('/admin/analytics/overview', signal),
    refetchInterval: 60000,
    retry: false,
  });
  const summary = query.data?.data;
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">Visitors and support</h2>
      <PresenceStatus data={presence.data} online={presence.online} />
      <StatCards
        rows={[
          ...onlineRows(presence.data),
          ['Valid login sessions', summary?.sessions],
          ['New registrations today', summary?.registrations],
          ['Daily active registered users', summary?.daily],
          ['Weekly active registered users', summary?.weekly],
          ['Monthly active registered users', summary?.monthly],
          ['Open support tickets', summary?.openTickets],
        ]}
      />
      {summary?.at && (
        <p className="text-sm text-muted">
          Account and ticket metrics updated {date(summary.at)}.
        </p>
      )}
    </section>
  );
}

export function Breakdown({ title, entries, label = 'Category' }) {
  return (
    <Card className="grid min-w-0 gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {entries.length ? (
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr>
              <th scope="col">{label}</th>
              <th scope="col" className="w-20">
                Count
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, count]) => (
              <tr key={key} className="border-t border-line">
                <th scope="row" className="py-2 font-normal wrap-anywhere">
                  {key}
                </th>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted">No activity in this group.</p>
      )}
    </Card>
  );
}

export function LiveActivity() {
  const { data, online, initial } = usePresence();
  return (
    <>
      <SectionHeading as="h1">Live activity</SectionHeading>
      <PresenceStatus data={data} online={online} />
      <StatCards rows={onlineRows(data)} />
      <p className="text-sm text-muted">
        Counts are based on recent visible activity and active live playback.
        Event counts measure FDFS event pages.
      </p>
      {initial.isError && !data && (
        <div>
          <Button variant="outline" onClick={() => void initial.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data?.available && (
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <Breakdown
            title="Public modules"
            entries={Object.entries(data.modules)}
          />
          <Breakdown
            title="Device categories"
            entries={Object.entries(data.devices)}
          />
          <Breakdown
            title="Authentication categories"
            entries={[
              ['Authenticated', data.authenticated],
              ['Estimated guests', data.estimatedGuests],
            ]}
          />
          <Breakdown
            title="Live event page presence"
            entries={Object.entries(data.events)}
            label="Event"
          />
        </div>
      )}
    </>
  );
}
export function SystemHealth() {
  const query = useQuery({
    queryKey: ['/admin/system-health'],
    queryFn: ({ signal }) => get('/admin/system-health', signal),
    refetchInterval: 60000,
  });
  const names = {
    api: 'Express API',
    mongodb: 'MongoDB readiness',
    sockets: 'Socket.IO',
    presence: 'Presence service',
    analytics: 'Analytics aggregation',
    reminderWorker: 'Live reminder worker',
    supportWorker: 'Support notification worker',
    cloudinary: 'Cloudinary operations',
    backup: 'Backup status',
  };
  return (
    <>
      <SectionHeading as="h1">System health</SectionHeading>
      <div>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Refresh status
        </Button>
      </div>
      <QueryState query={query}>
        {(report) => (
          <>
            <p className="text-muted">
              Version {report.version} · Checked {date(report.at)}
            </p>
            <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(names).map(([key, title]) => (
                <Card key={key} className="min-w-0">
                  <dt className="font-semibold">{title}</dt>
                  <dd className="mt-1 text-sm">
                    {readable(report[key].status).replace(/^./, (letter) =>
                      letter.toUpperCase(),
                    )}
                    {report[key].checkedAt &&
                      ' · ' + date(report[key].checkedAt)}
                  </dd>
                </Card>
              ))}
            </dl>
            <StatCards
              rows={[
                [
                  'Failed or uncertain support emails in 24 hours',
                  report.failedSupportJobs,
                ],
                ['Failed or uncertain reminders', report.failedReminders],
              ]}
            />
            <Breakdown
              title="Support email outcomes in the last 24 hours"
              entries={(report.recentEmail ?? []).map(
                ({ status, count, latest }) => [
                  readable(status) + ' · ' + date(latest),
                  count,
                ],
              )}
              label="Outcome"
            />
          </>
        )}
      </QueryState>
    </>
  );
}

export function AnnouncementList() {
  const records = useRecords(announcementPath);
  return (
    <>
      <SectionHeading as="h1">Announcements</SectionHeading>
      <DetailLink to={announcementPath + '/new'}>
        Create announcement
      </DetailLink>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          records.filter(
            'q',
            new FormData(event.currentTarget).get('q').trim(),
          );
        }}
      >
        <label className={field}>
          Search announcements
          <input name="q" className={control} maxLength={80} />
        </label>
        <Button type="submit">Search</Button>
      </form>
      <Select
        label="Status"
        options={choices(['draft', 'published', 'archived'])}
        value={records.params.status ?? ''}
        onChange={(value) => records.filter('status', value)}
      />
      <Records
        records={records}
        label="Announcements"
        empty="No announcements"
        columns={[
          {
            title: 'Announcement',
            render: (row) => (
              <DetailLink to={announcementPath + '/' + row.id}>
                {row.title}
              </DetailLink>
            ),
          },
          { title: 'Audience', render: (row) => readable(row.audience) },
          { title: 'Status', render: (row) => readable(row.status) },
          { title: 'Starts', render: (row) => date(row.startAt) },
        ]}
      />
    </>
  );
}
const local = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(+date - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
function AnnouncementForm({ record, save }) {
  const [preview, setPreview] = useState(null);
  return (
    <Card className="grid min-w-0 gap-3">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const values = {
            title: form.get('title').trim(),
            message: form.get('message').trim(),
            type: form.get('type'),
            audience: form.get('audience'),
            startAt: new Date(form.get('startAt')).toISOString(),
            endAt: form.get('endAt')
              ? new Date(form.get('endAt')).toISOString()
              : undefined,
          };
          if (event.nativeEvent.submitter?.value === 'preview')
            setPreview(values);
          else save(values);
        }}
      >
        <label className={field}>
          Title
          <input
            className={control}
            name="title"
            required
            minLength={3}
            maxLength={100}
            defaultValue={record?.title}
          />
        </label>
        <label className={field}>
          Audience
          <select
            className={control}
            name="audience"
            defaultValue={record?.audience}
          >
            {audiences.map((value) => (
              <option value={value} key={value}>
                {readable(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={field + ' sm:col-span-2'}>
          Message
          <textarea
            className={control}
            rows={4}
            name="message"
            required
            minLength={3}
            maxLength={1200}
            defaultValue={record?.message}
          />
        </label>
        <label className={field}>
          Type
          <select className={control} name="type" defaultValue={record?.type}>
            {announcementTypes.map((value) => (
              <option value={value} key={value}>
                {readable(value)}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Start time (local)
          <input
            className={control}
            name="startAt"
            type="datetime-local"
            required
            defaultValue={local(record?.startAt ?? new Date())}
          />
        </label>
        <label className={field}>
          End time (local)
          <input
            className={control}
            name="endAt"
            type="datetime-local"
            defaultValue={local(record?.endAt)}
          />
        </label>
        <div className="flex flex-wrap gap-2 self-end">
          <Button type="submit" variant="outline" value="preview">
            Preview
          </Button>
          <Button type="submit">Save announcement draft</Button>
        </div>
      </form>
      {preview && (
        <section
          className="rounded-control border border-line p-3 wrap-anywhere"
          aria-label="Announcement preview"
        >
          <h2 className="font-semibold text-accent">{preview.title}</h2>
          <p className="whitespace-pre-wrap">{preview.message}</p>
        </section>
      )}
    </Card>
  );
}

export function ManageAnnouncement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [action, setAction] = useState(null);
  const url = id ? announcementPath + '/' + id : announcementPath;
  const query = useQuery({
    queryKey: [announcementPath, id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => get(url, signal),
  });
  const change = useChange(announcementKeys, (result) => {
    if (!id) navigate(announcementPath + '/' + result.data.id);
  });
  const save = (values) =>
    change.mutate({ url, method: id ? 'patch' : 'post', data: values });
  function transition(record, operation) {
    change.reset();
    setAction({
      title: readable(operation) + ' announcement?',
      description: record.title,
      request: {
        url: url + '/status',
        method: 'post',
        data: { action: operation, revision: record.revision },
      },
    });
  }
  return (
    <>
      <DetailLink to={announcementPath}>Back to announcements</DetailLink>
      <SectionHeading as="h1">
        {id ? 'Manage announcement' : 'Create announcement'}
      </SectionHeading>
      {!id ? (
        <AnnouncementForm save={save} />
      ) : (
        <QueryState query={query}>
          {(record) => (
            <>
              <Card className="grid gap-2 wrap-anywhere">
                <h2 className="font-semibold text-accent">{record.title}</h2>
                <p className="whitespace-pre-wrap">{record.message}</p>
                <p className="text-sm text-muted">
                  {readable(record.status)} · {readable(record.audience)} ·
                  Starts {date(record.startAt)}
                </p>
              </Card>
              {record.status === 'draft' && (
                <AnnouncementForm
                  key={record.revision}
                  record={record}
                  save={(values) =>
                    save({ ...values, revision: record.revision })
                  }
                />
              )}
              {record.status !== 'archived' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      transition(
                        record,
                        record.status === 'draft' ? 'publish' : 'unpublish',
                      )
                    }
                  >
                    {record.status === 'draft'
                      ? 'Publish announcement'
                      : 'Unpublish announcement'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => transition(record, 'archive')}
                  >
                    Archive announcement
                  </Button>
                </div>
              )}
            </>
          )}
        </QueryState>
      )}
      {!action && change.isError && (
        <p role="alert" className="text-danger-text">
          {change.error.message}
        </p>
      )}
      <ConfirmAction
        action={action}
        change={change}
        onClose={() => setAction(null)}
      />
    </>
  );
}
