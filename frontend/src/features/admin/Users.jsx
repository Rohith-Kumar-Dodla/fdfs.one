import { RecordFilters } from './ContentGrid.jsx';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext, useParams } from 'react-router';
import {
  can,
  contentModules,
  roleLabels,
  staffRoles,
} from '../../../../shared/admin.js';
import { filmLabels } from '../../../../shared/films.js';
import { ErrorState } from '../../components/ui/states.jsx';
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
  useChange,
  useRecords,
} from './common.jsx';

const url = '/admin/users';
const columns = [
  {
    title: 'Account',
    render: (row) => (
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-accent text-xs font-bold text-ink">
          {row.avatar ? (
            <img src={row.avatar} alt="" className="size-full object-cover" />
          ) : (
            row.fullName
              ?.trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((word) => word[0])
              .join('')
              .toUpperCase()
          )}
        </span>
        <DetailLink to={url + '/' + row.id}>{row.fullName}</DetailLink>
      </div>
    ),
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

export function UsersPage({ sessions = false }) {
  const records = useRecords(url);
  return (
    <>
      <SectionHeading as="h1">
        {sessions ? 'Security and Sessions' : 'Users'}
      </SectionHeading>
      {sessions && (
        <p className="text-sm text-muted">
          Open an account to review its status or revoke its sessions.
        </p>
      )}
      <div>
        <RecordFilters
          records={records}
          fields={[
            ['q', 'Search by name or email'],
            ['role', 'Role', Object.entries(roleLabels)],
            [
              'verified',
              'Email verification',
              [
                ['true', 'Verified'],
                ['false', 'Unverified'],
              ],
            ],
            [
              'status',
              'Account status',
              ['active', 'suspended', 'deleted'].map((status) => [
                status,
                readable(status),
              ]),
            ],
          ]}
        />
      </div>
      <Records records={records} columns={columns} label="User accounts" />
    </>
  );
}

export function UserDetailPage() {
  const { id } = useParams();
  const account = useOutletContext();
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
                [
                  'Roles',
                  user.roles.map((role) => roleLabels[role] ?? role).join(', '),
                ],
                [
                  'Content scopes',
                  user.cmsModules
                    ?.map((value) => filmLabels[value] ?? value)
                    .join(', ') || 'None',
                ],
                ['Status', user.status],
                [
                  'Verification',
                  user.emailVerified ? 'Verified' : 'Unverified',
                ],
                ['Created', date(user.createdAt)],
                ['Account ID', user.id],
                ['Updated', date(user.updatedAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {can(account, 'roles') &&
              account.id !== user.id &&
              user.status !== 'deleted' && (
                <StaffForm user={user} confirm={confirm} />
              )}
            {user.id === account?.id ||
            user.roles.some((role) => staffRoles.includes(role)) ||
            user.status === 'deleted' ? (
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
export function RolesPage() {
  const account = useOutletContext();
  if (!can(account, 'roles')) return <ErrorState title="Access restricted" />;
  return (
    <>
      <SectionHeading as="h1">Roles and Permissions</SectionHeading>
      <p className="text-muted">
        Select an account under Users to grant or revoke a staff role. Role
        changes require the account to sign in again.
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          [
            'super_admin',
            'Manages staff permissions, publishing, moderation and platform settings.',
          ],
          [
            'admin',
            'Manages publishing, moderation, accounts and platform settings.',
          ],
          [
            'content_manager',
            'Manages content and reviews submissions in assigned modules.',
          ],
          [
            'moderator',
            'Reviews submissions and manages comment and live chat reports.',
          ],
          ['support_agent', 'Reserved for future support workflows.'],
        ].map(([role, description]) => (
          <Card key={role}>
            <dt className="font-semibold">{roleLabels[role]}</dt>
            <dd className="text-sm text-muted">{description}</dd>
          </Card>
        ))}
      </dl>
      <DetailLink to="/admin/users">Open user accounts</DetailLink>
    </>
  );
}

function StaffForm({ user, confirm }) {
  const [role, setRole] = useState('content_manager');
  const enabled = user.roles.includes(role);
  return (
    <form
      className="grid gap-3 rounded-panel border border-line p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(
          event.currentTarget,
          event.nativeEvent.submitter,
        );
        const grant = data.get('mode') !== 'revoke';
        confirm(
          'staff',
          (grant ? 'Save ' : 'Revoke ') + roleLabels[role] + '?',
          user.fullName,
          {
            role,
            enabled: grant,
            reason: data.get('reason'),
            ...(role === 'content_manager' &&
              grant && { modules: data.getAll('modules') }),
          },
        );
      }}
    >
      <h3 className="font-semibold">Staff permissions</h3>
      <label className="grid gap-1 text-sm">
        Staff role
        <select
          className={control}
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          {staffRoles.map((value) => (
            <option key={value} value={value}>
              {roleLabels[value]}
            </option>
          ))}
        </select>
      </label>
      {role === 'content_manager' && (
        <fieldset
          key={user.cmsModules?.join(',')}
          className="grid gap-1 sm:grid-cols-2"
        >
          <legend className="text-sm">Content modules</legend>
          {contentModules.map((module) => (
            <label
              className="flex min-h-11 items-center gap-2 text-sm"
              key={module}
            >
              <input
                name="modules"
                type="checkbox"
                value={module}
                defaultChecked={user.cmsModules?.includes(module)}
              />
              {filmLabels[module] ?? readable(module)}
            </label>
          ))}
        </fieldset>
      )}
      <label className="grid gap-1 text-sm">
        Reason
        <input
          name="reason"
          required
          minLength={3}
          maxLength={300}
          className={control}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="mode"
          value="grant"
          disabled={user.status !== 'active' || !user.emailVerified}
        >
          {enabled ? 'Save role' : 'Grant role'}
        </Button>
        {enabled && (
          <Button type="submit" variant="outline" name="mode" value="revoke">
            Revoke role
          </Button>
        )}
      </div>
    </form>
  );
}
