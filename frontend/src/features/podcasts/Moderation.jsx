import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Textarea } from '../../components/ui/fields.jsx';
import { Badge, SectionHeading } from '../../components/ui/surfaces.jsx';
import {
  date,
  DetailLink,
  Records,
  Select,
  useChange,
  useRecords,
} from '../admin/common.jsx';

const root = '/admin/podcasts';
const states = ['visible', 'hidden', 'deleted'];
const keys = [
  root + '/reports',
  root + '/comments',
  'podcast-comments',
  '/admin/audit',
];

export function PodcastModeration({ reports = false }) {
  const [params] = useSearchParams();
  const path = root + (reports ? '/reports' : '/comments');
  const records = useRecords(
    path,
    reports
      ? { status: 'open' }
      : { episodeId: params.get('episodeId') ?? undefined },
  );
  const [selected, setSelected] = useState(null);
  const change = useChange(keys);
  function choose(kind, id) {
    change.reset();
    setSelected({ kind, id });
  }
  function action(comment) {
    if (!comment || !['hidden', 'visible'].includes(comment.status))
      return null;
    const hide = comment.status === 'visible';
    return (
      <Button
        variant="outline"
        onClick={() => choose(hide ? 'hide' : 'restore', comment.id)}
      >
        {hide ? 'Hide comment' : 'Restore comment'}
      </Button>
    );
  }
  const columns = reports
    ? [
        {
          title: 'Report reason',
          render: (record) => (
            <>
              <Badge>{record.reason}</Badge>
              <p className="whitespace-pre-wrap">{record.details}</p>
            </>
          ),
        },
        {
          title: 'Comment',
          render: (record) => (
            <p className="whitespace-pre-wrap">
              {record.comment?.text || 'Comment removed'}
            </p>
          ),
        },
        {
          title: 'State',
          render: (record) => (
            <>
              <Badge>{record.status}</Badge>
              <p>{record.resolution}</p>
            </>
          ),
        },
        {
          title: 'Action',
          render: (record) => (
            <div className="flex flex-wrap gap-2">
              {action(record.comment)}
              {record.status === 'open' && (
                <Button
                  variant="outline"
                  onClick={() => choose('resolve', record.id)}
                >
                  Resolve report
                </Button>
              )}
            </div>
          ),
        },
      ]
    : [
        {
          title: 'Comment',
          render: (record) => (
            <>
              <p className="font-semibold">{record.author}</p>
              <p className="whitespace-pre-wrap">
                {record.text || 'Comment removed'}
              </p>
            </>
          ),
        },
        { title: 'Posted', render: (record) => date(record.createdAt) },
        {
          title: 'State',
          render: (record) => (
            <>
              <Badge>{record.status}</Badge>
              <p>{record.moderationReason}</p>
            </>
          ),
        },
        { title: 'Action', render: action },
      ];
  const label =
    selected?.kind === 'resolve'
      ? 'Resolve report'
      : selected?.kind === 'hide'
        ? 'Hide comment'
        : 'Restore comment';
  return (
    <>
      <DetailLink to={root}>Back to podcast management</DetailLink>
      <SectionHeading as="h1">
        {reports ? 'Podcast reports' : 'Podcast comments'}
      </SectionHeading>
      <DetailLink to={root + (reports ? '/comments' : '/reports')}>
        {reports ? 'View comments' : 'View reports'}
      </DetailLink>
      <Select
        label="Status"
        options={(reports ? ['open', 'resolved'] : states).map((value) => [
          value,
          value,
        ])}
        value={records.params.status ?? ''}
        onChange={(value) =>
          records.filter('status', reports && !value ? 'open' : value)
        }
      />
      <Records
        records={records}
        columns={columns}
        label={reports ? 'Podcast reports' : 'Podcast comments'}
        empty={reports ? 'No reports found' : 'No comments found'}
      />
      <Dialog
        open={Boolean(selected)}
        onClose={() => {
          if (!change.isPending) setSelected(null);
        }}
        title={label}
      >
        {selected && (
          <form
            className="grid min-w-0 gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = new FormData(event.currentTarget).get('reason');
              const resolve = selected.kind === 'resolve';
              change.mutate(
                {
                  url:
                    root +
                    (resolve
                      ? '/reports/' + selected.id + '/resolve'
                      : '/comments/' + selected.id + '/moderate'),
                  method: 'post',
                  data: resolve
                    ? { reason }
                    : { action: selected.kind, reason },
                },
                { onSuccess: () => setSelected(null) },
              );
            }}
          >
            <label className="grid min-w-0 gap-1 text-sm">
              Moderation reason
              <Textarea name="reason" required minLength={3} maxLength={500} />
            </label>
            {change.isError && (
              <p role="alert" className="text-danger-text">
                {change.error.message}
              </p>
            )}
            <div>
              <Button type="submit" loading={change.isPending}>
                {label}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
