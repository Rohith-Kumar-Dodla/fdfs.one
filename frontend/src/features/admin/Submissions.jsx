import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EventForm, EventProposalReview } from '../live/Form.jsx';
import { useAccount } from '../auth/guards.jsx';
import { TalentSubmission } from '../talent/Proposal.jsx';
import { ProfileContent, TalentImage } from '../talent/Public.jsx';
import { filmPath } from '../../../../shared/films.js';
import {
  CreatorFilmForm,
  FilmProposalReview,
  ReleaseForm,
} from '../films/Manage.jsx';
import {
  Badge,
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
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
} from './common.jsx';

const adminUrl = '/admin/submissions';
const ownerUrl = '/submissions';
const categories = [
  ['film', 'Independent short film'],
  ['original', 'FDFS Original'],
  ['podcast', 'Podcast episode'],
  ['live', 'Live event'],
  ['talent', 'Talent profile submission or correction'],
];
const states = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'published',
  'archived',
];
const categoryLabel = (id) =>
  categories.find(([category]) => category === id)?.[1] ?? id;
const columns = [
  {
    title: 'Submission',
    render: (row) => <DetailLink to={row.id}>{row.title}</DetailLink>,
  },
  { title: 'Category', render: (row) => categoryLabel(row.category) },
  {
    title: 'Status',
    render: (row) => (
      <Badge tone={row.status === 'rejected' ? 'warning' : 'accent'}>
        {readable(row.status)}
      </Badge>
    ),
  },
  { title: 'Updated', render: (row) => date(row.updatedAt) },
];

function OwnerShell({ children }) {
  return <Container className="grid min-w-0 gap-5 py-8">{children}</Container>;
}

function SubmissionForm({ record }) {
  const navigate = useNavigate();
  const account = useOutletContext();
  const roles = {
    podcast: 'creator',
    live: 'organizer',
  };
  const available = categories.filter(
    ([category]) =>
      !['talent', 'film'].includes(category) &&
      (account.roles.includes('admin') ||
        account.roles.includes(roles[category])),
  );
  const change = useChange([ownerUrl], ({ data }) => {
    if (!record) navigate(ownerUrl + '/' + data.id);
  });
  if (!record && available.length === 0)
    return (
      <p className="text-sm text-muted">
        A creator or organizer role is required for other submission categories.
      </p>
    );

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        change.mutate({
          url: record ? ownerUrl + '/' + record.id : ownerUrl,
          method: record ? 'patch' : 'post',
          data,
        });
      }}
    >
      {!record && (
        <label className="grid gap-1 text-sm">
          Category
          <select name="category" className={control} required>
            {available.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="grid gap-1 text-sm">
        Title
        <input
          className={control}
          name="title"
          required
          minLength={3}
          maxLength={160}
          defaultValue={record?.title}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Summary
        <textarea
          className={control}
          name="summary"
          rows={5}
          required
          minLength={10}
          maxLength={4000}
          defaultValue={record?.summary}
        />
      </label>
      <div>
        <Button type="submit" loading={change.isPending}>
          {record ? 'Save changes' : 'Create draft'}
        </Button>
      </div>
      {change.isError && (
        <p role="alert" className="text-sm text-danger-text">
          {change.error.message}
        </p>
      )}
      {record && change.isSuccess && (
        <p role="status" className="text-sm text-success">
          Changes saved.
        </p>
      )}
    </form>
  );
}

export function NewSubmissionPage() {
  const [search] = useSearchParams();
  const talent = search.get('category') === 'talent';
  const { data: account } = useAccount();
  return (
    <OwnerShell>
      <DetailLink to={ownerUrl}>Back to submissions</DetailLink>
      {talent ? (
        <TalentSubmission
          targetId={search.get('target')}
          slug={search.get('slug')}
        />
      ) : (
        <>
          <SectionHeading as="h1">New submission</SectionHeading>
          <DetailLink to={ownerUrl + '/new?category=talent'}>
            Suggest a talent profile
          </DetailLink>
          <DetailLink to="/creator/films/new">
            Submit an independent film
          </DetailLink>
          {account?.roles?.includes('organizer') && (
            <DetailLink to="/organizer/live/new">
              Submit a live event
            </DetailLink>
          )}
          <Card>
            <SubmissionForm />
          </Card>
        </>
      )}
    </OwnerShell>
  );
}

export function SubmissionList({ admin = false }) {
  const [search] = useSearchParams();
  const category = search.get('category');
  const records = useRecords(
    admin ? adminUrl : ownerUrl,
    categories.some(([key]) => key === category) ? { category } : {},
  );
  const content = (
    <>
      <SectionHeading as="h1">
        {admin ? 'Submissions' : 'My submissions'}
      </SectionHeading>
      {!admin && (
        <div>
          <DetailLink to={ownerUrl + '/new'}>Create submission</DetailLink>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Category"
          options={categories}
          value={records.params.category ?? ''}
          onChange={(value) => records.filter('category', value)}
        />
        <Select
          label="Status"
          options={states.map((status) => [status, readable(status)])}
          value={records.params.status ?? ''}
          onChange={(value) => records.filter('status', value)}
        />
      </div>
      <Records
        records={records}
        columns={columns}
        label="Submissions"
        empty="No submissions found"
      />
    </>
  );
  return admin ? content : <OwnerShell>{content}</OwnerShell>;
}

function SubmissionActions({ record, admin, url }) {
  const [action, setAction] = useState(null);
  const editable = ['draft', 'rejected'].includes(record.status);
  const change = useChange([
    adminUrl,
    ownerUrl,
    '/admin/overview',
    '/admin/audit',
    '/admin/talent',
    '/admin/films',
    '/submissions/films',
    'films',
    'talent',
    '/admin/live',
    '/organizer/live',
    'live',
  ]);
  function confirm(label, suffix, data) {
    change.reset();
    setAction({
      title: label + '?',
      description: record.title,
      request: { url: url + '/' + suffix, method: 'post', data },
    });
  }
  const actions = {
    submitted: [['Start review', 'review']],
    under_review: [['Approve submission', 'approve']],
    approved: [['Archive submission', 'archive']],
    rejected: [['Archive submission', 'archive']],
    published: [['Archive submission', 'archive']],
  };
  return (
    <>
      {!admin && editable && (
        <Card className="grid gap-4">
          <h2 className="text-lg font-semibold">Edit submission</h2>
          {record.category === 'talent' ? (
            <TalentSubmission key={record.id} record={record} />
          ) : record.eventProposal ? (
            <EventForm key={record.id} record={record} />
          ) : record.category === 'film' ? (
            <CreatorFilmForm key={record.id} record={record} />
          ) : (
            <SubmissionForm key={record.id} record={record} />
          )}
          <div>
            <Button
              variant="outline"
              onClick={() => confirm('Submit for review', 'submit')}
            >
              Submit for review
            </Button>
          </div>
        </Card>
      )}
      {admin && actions[record.status] && (
        <Card className="grid gap-4">
          <h2 className="text-lg font-semibold">Review actions</h2>
          <div className="flex flex-wrap gap-2">
            {actions[record.status].map(([label, action]) => (
              <Button
                key={action}
                variant="outline"
                onClick={() => confirm(label, 'moderate', { action })}
              >
                {label}
              </Button>
            ))}
          </div>
          {record.status === 'under_review' && (
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                confirm('Reject submission', 'moderate', {
                  action: 'reject',
                  reason: new FormData(event.currentTarget).get('reason'),
                });
              }}
            >
              <label className="grid gap-1 text-sm">
                Rejection reason
                <textarea
                  name="reason"
                  className={control}
                  required
                  minLength={3}
                  maxLength={500}
                />
              </label>
              <div>
                <Button type="submit" variant="outline">
                  Reject submission
                </Button>
              </div>
            </form>
          )}
          {record.status === 'approved' && record.proposal && (
            <div>
              <Button
                onClick={() =>
                  confirm(
                    record.proposal.targetId
                      ? 'Publish correction'
                      : 'Publish talent profile',
                    'publish',
                  )
                }
              >
                Publish approved proposal
              </Button>
            </div>
          )}
          {record.status === 'approved' && record.eventProposal && (
            <div>
              <Button
                onClick={() =>
                  confirm('Publish approved live event', 'publish')
                }
              >
                Publish live event
              </Button>
            </div>
          )}
          {record.status === 'approved' && record.filmProposal && (
            <ReleaseForm
              onRelease={(release) =>
                confirm('Publish approved film', 'publish', { release })
              }
            />
          )}
          {record.status === 'approved' &&
            !record.proposal &&
            !record.filmProposal &&
            !record.eventProposal && (
              <p className="text-sm text-muted">
                Publishing requires an enabled workflow for this category.
              </p>
            )}
        </Card>
      )}
      <ConfirmAction
        action={action}
        onClose={() => setAction(null)}
        change={change}
      />
    </>
  );
}

export function SubmissionDetail({ admin = false }) {
  const base = admin ? adminUrl : ownerUrl;
  const { id } = useParams();
  const url = base + '/' + id;
  const query = useQuery({
    queryKey: [base, id],
    queryFn: ({ signal }) => get(url, signal),
  });
  const content = (
    <>
      <DetailLink to={base}>Back to submissions</DetailLink>
      <SectionHeading as="h1">Submission details</SectionHeading>
      <QueryState query={query}>
        {(record) => (
          <>
            <Card className="grid gap-3 wrap-anywhere">
              <div>
                <Badge tone="accent">{readable(record.status)}</Badge>
              </div>
              <h2 className="text-xl font-semibold">{record.title}</h2>
              <p className="text-sm text-muted">
                {categoryLabel(record.category)} · Created{' '}
                {date(record.createdAt)} · Updated {date(record.updatedAt)}
              </p>
              {admin && (
                <p className="text-sm text-muted">Owner {record.owner}</p>
              )}
              <p className="whitespace-pre-wrap">{record.summary}</p>
              {record.reviewedAt && (
                <p className="text-sm text-muted">
                  Reviewed {date(record.reviewedAt)}
                </p>
              )}
              {record.rejectionReason && (
                <p>Rejection reason · {record.rejectionReason}</p>
              )}
            </Card>
            {record.proposal && (
              <Card className="grid min-w-0 gap-4 wrap-anywhere">
                <h2 className="text-lg font-semibold">
                  {record.proposal.targetId
                    ? 'Proposed correction'
                    : 'Proposed profile'}
                </h2>
                {admin && record.proposal.targetId && (
                  <DetailLink to={'/admin/talent/' + record.proposal.targetId}>
                    Review current profile
                  </DetailLink>
                )}
                <TalentImage cover image={record.proposalImages?.coverImage} />
                <TalentImage image={record.proposalImages?.profileImage} />
                <h3 className="font-semibold">
                  {record.proposal.profile.displayName}
                </h3>
                <p>{record.proposal.profile.introduction}</p>
                <ProfileContent profile={record.proposal.profile} />
              </Card>
            )}
            {record.filmProposal && <FilmProposalReview record={record} />}
            {record.eventProposal && (
              <EventProposalReview record={record} admin={admin} />
            )}
            {record.publishedResource && record.category === 'live' ? (
              <DetailLink
                to={
                  (admin ? '/admin/live/' : '/organizer/live/') +
                  record.publishedResource.id
                }
              >
                Open published event
              </DetailLink>
            ) : record.publishedResource?.classification ? (
              <DetailLink
                to={
                  admin
                    ? '/admin/films/' + record.publishedResource.id
                    : filmPath(record.publishedResource)
                }
              >
                Open published film
              </DetailLink>
            ) : (
              record.publishedResource && (
                <DetailLink
                  to={
                    admin
                      ? '/admin/talent/' + record.publishedResource.id
                      : '/talent/' + record.publishedResource.slug
                  }
                >
                  Open published profile
                </DetailLink>
              )
            )}
            <SubmissionActions record={record} admin={admin} url={url} />
            <Card className="grid gap-3 wrap-anywhere">
              <h2 className="text-lg font-semibold">Moderation history</h2>
              {record.history.length === 0 ? (
                <p className="text-sm text-muted">
                  No status changes recorded.
                </p>
              ) : (
                <ol className="grid gap-3 text-sm">
                  {record.history.map((entry, index) => (
                    <li key={index}>
                      <p>
                        {readable(entry.from)} → {readable(entry.to)} ·{' '}
                        {date(entry.at)}
                      </p>
                      {admin && <p className="text-muted">{entry.actorId}</p>}
                      {entry.reason && (
                        <p className="text-muted">{entry.reason}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </>
        )}
      </QueryState>
    </>
  );
  return admin ? content : <OwnerShell>{content}</OwnerShell>;
}
