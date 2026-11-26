import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { SectionHeading } from '../../components/ui/surfaces.jsx';
import { ChatModeration } from '../live/Manage.jsx';
import {
  control,
  date,
  DetailLink,
  readable,
  Records,
  Select,
  useRecords,
} from './common.jsx';

export function CommunityAdmin({ reports = false }) {
  const records = useRecords(
    reports
      ? '/admin/moderation/live-reports'
      : '/admin/moderation/live-events',
  );
  const link = (event) =>
    event && (
      <DetailLink to={'/admin/moderation/live/' + event.id}>
        {event.title}
      </DetailLink>
    );
  const columns = reports
    ? [
        { title: 'Event', render: (row) => link(row.event) },
        { title: 'Message', render: (row) => row.message?.text },
        { title: 'Reason', render: (row) => readable(row.reason) },
        { title: 'Reported', render: (row) => date(row.createdAt) },
      ]
    : [
        { title: 'Event', render: link },
        { title: 'Broadcast', render: (row) => readable(row.broadcast) },
      ];
  return (
    <>
      <SectionHeading as="h1">
        {reports ? 'Reports and Moderation' : 'Comments and Live Chat'}
      </SectionHeading>
      <div className="flex flex-wrap gap-x-4">
        <DetailLink
          to={reports ? '/admin/podcasts/reports' : '/admin/podcasts/comments'}
        >
          {reports ? 'Podcast reports' : 'Podcast comments'}
        </DetailLink>
        <DetailLink to="/admin/submissions">Submission review</DetailLink>
      </div>
      <h2 className="text-lg font-semibold">
        {reports ? 'Live chat reports' : 'Live event conversations'}
      </h2>
      {reports ? (
        <Select
          label="Report status"
          options={[
            ['open', 'Open'],
            ['resolved', 'Resolved'],
          ]}
          value={records.params.status ?? 'open'}
          onChange={(value) => records.filter('status', value)}
        />
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            records.filter(
              'q',
              new FormData(event.currentTarget).get('query').trim(),
            );
          }}
        >
          <label className="grid flex-1 gap-1 text-sm">
            Search events
            <input name="query" maxLength={80} className={control} />
          </label>
          <Button type="submit">Search</Button>
        </form>
      )}
      <Records
        records={records}
        columns={columns}
        label={reports ? 'Live chat reports' : 'Live events'}
      />
    </>
  );
}

export function LiveModerationAdmin() {
  const { id } = useParams();
  return (
    <>
      <DetailLink to="/admin/moderation">
        Back to Comments and Live Chat
      </DetailLink>
      <SectionHeading as="h1">Live chat moderation</SectionHeading>
      <ChatModeration path={'/admin/live/' + id} />
    </>
  );
}
