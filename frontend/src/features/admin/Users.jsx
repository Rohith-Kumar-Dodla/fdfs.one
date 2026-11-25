import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { Badge, Card, SectionHeading } from '../../components/ui/surfaces.jsx';
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

const url = '/admin/users';
const columns = [
  {
    title: 'Account',
    render: (row) => <DetailLink to={row.id}>{row.fullName}</DetailLink>,
  },
  { title: 'Email', render: (row) => row.email },
  { title: 'Roles', render: (row) => row.roles.join(', ') },
  {
    title: 'Verification',
    render: (row) => (row.emailVerified ? 'Verified' : 'Unverified'),
  },
  {
    title: 'Status',
    render: (row) => (
      <Badge tone={row.status === 'active' ? 'success' : 'warning'}>
        {row.status}
      </Badge>
    ),
  },
];

export function UsersPage() {
  const records = useRecords(url);
  return (
    <>
      <SectionHeading as="h1">Users</SectionHeading>
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
        <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm">
          Search by name or email
          <input type="search" name="q" maxLength={80} className={control} />
        </label>
        <Button type="submit">Search</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Role"
          options={['viewer', 'creator', 'organizer', 'admin'].map((role) => [
            role,
            readable(role),
          ])}
          value={records.params.role ?? ''}
          onChange={(value) => records.filter('role', value)}
        />
        <Select
          label="Email verification"
          options={[
            ['true', 'Verified'],
            ['false', 'Unverified'],
          ]}
          value={records.params.verified ?? ''}
          onChange={(value) => records.filter('verified', value)}
        />
        <Select
          label="Account status"
          options={['active', 'suspended', 'deleted'].map((status) => [
            status,
            readable(status),
          ])}
          value={records.params.status ?? ''}
          onChange={(value) => records.filter('status', value)}
        />
      </div>
      <Records records={records} columns={columns} label="User accounts" />
    </>
  );
}

export function UserDetailPage() {
  const { id } = useParams();
  const path = url + '/' + id;
  const query = useQuery({
    queryKey: [url, id],
    queryFn: ({ signal }) => get(path, signal),
  });
  const [action, setAction] = useState(null);
  const change = useChange([url, '/admin/overview', '/admin/audit']);
  function confirm(pathSuffix, title, description, data, method = 'patch') {
    change.reset();
    setAction({
      title,
      description,
      request: { url: path + '/' + pathSuffix, method, data },
    });
  }
  return (
    <>
      <DetailLink to="/admin/users">Back to users</DetailLink>
      <SectionHeading as="h1">User account</SectionHeading>
      <QueryState query={query}>
        {(user) => (
          <Card className="grid gap-4 wrap-anywhere">
            <h2 className="text-xl font-semibold">{user.fullName}</h2>
            <dl className="grid gap-2 sm:grid-cols-2">
              {[
                ['Email', user.email],
                ['Roles', user.roles.join(', ')],
                ['Status', user.status],
                [
                  'Verification',
                  user.emailVerified ? 'Verified' : 'Unverified',
                ],
                ['Created', date(user.createdAt)],
                ['Updated', date(user.updatedAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {user.roles.includes('admin') || user.status === 'deleted' ? (
              <p className="text-sm text-muted">This account is protected.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {['creator', 'organizer'].map((role) => {
                  const enabled = !user.roles.includes(role);
                  const title = (enabled ? 'Approve ' : 'Revoke ') + role;
                  return (
                    <Button
                      key={role}
                      variant="outline"
                      disabled={
                        enabled &&
                        (!user.emailVerified || user.status !== 'active')
                      }
                      onClick={() =>
                        confirm('role', title + '?', user.fullName, {
                          role,
                          enabled,
                        })
                      }
                    >
                      {title}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  onClick={() => {
                    const suspend = user.status === 'active';
                    confirm(
                      'status',
                      suspend ? 'Suspend account?' : 'Reactivate account?',
                      suspend
                        ? 'Suspension signs this user out on all devices.'
                        : user.fullName,
                      { status: suspend ? 'suspended' : 'active' },
                    );
                  }}
                >
                  {user.status === 'active'
                    ? 'Suspend account'
                    : 'Reactivate account'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    confirm(
                      'revoke-sessions',
                      'Revoke all sessions?',
                      'This user will need to sign in again.',
                      undefined,
                      'post',
                    )
                  }
                >
                  Revoke sessions
                </Button>
              </div>
            )}
          </Card>
        )}
      </QueryState>
      <ConfirmAction
        action={action}
        onClose={() => setAction(null)}
        change={change}
      />
    </>
  );
}
