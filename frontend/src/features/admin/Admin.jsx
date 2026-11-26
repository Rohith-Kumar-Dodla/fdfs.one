import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useOutletContext,
} from 'react-router';
import { can } from '../../../../shared/admin.js';
import { AccountNavigation } from '../auth/AccountNavigation.jsx';
import { OperationsOverview } from '../operations/OpsAdmin.jsx';
import { quickActions, visibleGroups } from './navigation.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import {
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import {
  control,
  date,
  DetailLink,
  get,
  QueryState,
  readable,
  Records,
  useRecords,
} from './common.jsx';

const stats = {
  users: 'Registered accounts',
  verified: 'Verified accounts',
  unverified: 'Unverified accounts',
  suspended: 'Suspended accounts',
  cinema: 'Published Cinema films',
  originals: 'Published Originals',
  episodes: 'Published episodes',
  talent: 'Published Talent Profiles',
  scheduled: 'Scheduled live events',
  live: 'Events marked live',
  replays: 'Available replays',
  reviewQueue: 'Pending submissions',
  reports: 'Pending reports',
  images: 'Library images',
  auditEvents: 'Audit events',
};

function Navigation({ account, onNavigate }) {
  return (
    <nav aria-label="Administration" className="grid gap-4">
      {visibleGroups(account).map(([group, items]) => (
        <div key={group}>
          <p className="px-3 pb-1 text-xs font-semibold text-muted">{group}</p>
          {items.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin'}
              onClick={onNavigate}
              className={({ isActive }) =>
                'flex min-h-11 items-center rounded-control px-3 text-sm ' +
                (isActive
                  ? 'bg-surface font-semibold text-accent'
                  : 'text-foreground hover:bg-surface')
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function AdminLayout() {
  const location = useLocation();
  const account = useOutletContext();
  const [drawer, setDrawer] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const parent = visibleGroups(account)
    .flatMap(([, items]) => items)
    .find(
      ([path]) =>
        path !== '/admin' &&
        (location.pathname === path ||
          location.pathname.startsWith(path + '/')),
    );
  return (
    <Container
      className={
        'grid min-w-0 gap-5 py-7 lg:py-10 ' +
        (!collapsed ? 'lg:grid-cols-[13rem_minmax(0,1fr)]' : '')
      }
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4 lg:col-span-full">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <p className="text-lg font-semibold">Administration</p>
          <Button
            className="hidden lg:inline-flex"
            variant="outline"
            aria-expanded={!collapsed}
            aria-controls="admin-sidebar"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? 'Show sidebar' : 'Hide sidebar'}
          </Button>
        </div>
        <div className="lg:hidden">
          <Button
            variant="outline"
            onClick={() => setDrawer(location.key)}
            aria-haspopup="dialog"
            aria-expanded={drawer === location.key}
          >
            Admin menu
          </Button>
        </div>
        <AccountNavigation />
      </header>
      <aside
        id="admin-sidebar"
        className={
          'hidden self-start rounded-panel border border-line bg-nav p-2 ' +
          (!collapsed ? 'lg:block' : '')
        }
      >
        <Navigation account={account} />
      </aside>
      <Dialog
        open={drawer === location.key}
        onClose={() => setDrawer(null)}
        title="Administration menu"
        className="top-0! right-auto! bottom-auto! left-0! m-0! h-dvh max-h-dvh! w-[min(20rem,90vw)]! max-w-none! rounded-none!"
      >
        <Navigation account={account} onNavigate={() => setDrawer(null)} />
      </Dialog>
      <div className="grid min-w-0 content-start gap-5">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap gap-2 text-sm text-muted"
        >
          <Link className="text-accent underline" to="/admin">
            Administration
          </Link>
          {parent && <span aria-current="page">/ {parent[1]}</span>}
        </nav>
        <Outlet context={account} />
      </div>
    </Container>
  );
}

export function OverviewPage() {
  const account = useOutletContext();
  return can(account, 'dashboard') ? (
    <DashboardOverview account={account} />
  ) : (
    <Navigate to="/admin/support" replace />
  );
}

function DashboardOverview({ account }) {
  const url = '/admin/overview';
  const query = useQuery({
    queryKey: [url],
    queryFn: ({ signal }) => get(url, signal),
  });
  return (
    <>
      <SectionHeading as="h1">Overview</SectionHeading>
      <div className="flex flex-wrap gap-x-4">
        {quickActions
          .filter(([, , module]) => can(account, 'content', module))
          .map(([to, label]) => (
            <DetailLink key={to} to={to}>
              {label}
            </DetailLink>
          ))}
      </div>
      {can(account, 'analytics') && <OperationsOverview />}
      <QueryState query={query}>
        {(data) => (
          <div className="grid gap-5">
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(stats)
                .filter(([key]) => typeof data[key] === 'number')
                .map(([key, title]) => (
                  <Card key={title} className="min-w-0">
                    <dt className="text-sm text-muted">{title}</dt>
                    <dd className="mt-2 text-2xl font-semibold">
                      {data[key].toLocaleString()}
                    </dd>
                  </Card>
                ))}
            </dl>
            {data.recentActivity && (
              <Card className="grid gap-2">
                <h2 className="text-lg font-semibold">
                  Recent administrative activity
                </h2>
                {data.recentActivity.length ? (
                  <ul className="grid gap-2">
                    {data.recentActivity.map((entry) => (
                      <li className="text-sm wrap-anywhere" key={entry._id}>
                        {date(entry.createdAt)} ? {readable(entry.action)} ?{' '}
                        {entry.targetType} {entry.targetId}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">No activity recorded.</p>
                )}
              </Card>
            )}
          </div>
        )}
      </QueryState>
    </>
  );
}

const columns = [
  { title: 'When', render: (row) => date(row.createdAt) },
  {
    title: 'Action',
    render: (row) => (
      <>
        {readable(row.action)}
        <br />
        {row.outcome}
      </>
    ),
  },
  { title: 'Administrator', render: (row) => row.actorId },
  {
    title: 'Target',
    render: (row) => (
      <>
        {row.targetType}
        <br />
        {row.targetId}
      </>
    ),
  },
  {
    title: 'Change',
    render: (row) =>
      [
        row.summary?.field,
        row.summary?.from,
        row.summary?.to,
        row.summary?.reason,
      ]
        .filter(Boolean)
        .join(' → '),
  },
  { title: 'Request ID', render: (row) => row.requestId },
];

export function AuditPage() {
  const records = useRecords('/admin/audit');
  return (
    <>
      <SectionHeading as="h1">Audit log</SectionHeading>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          for (const [key, value] of new FormData(event.currentTarget))
            records.filter(key, value.trim());
        }}
      >
        {[
          ['actor', 'Administrator ID'],
          ['action', 'Action'],
          ['resource', 'Resource type'],
          ['target', 'Resource ID'],
          ['from', 'From date', 'date'],
          ['to', 'To date', 'date'],
          ['outcome', 'Result'],
        ].map(([name, label, type]) => (
          <label className="grid gap-1 text-sm" key={name}>
            {label}
            <input className={control} name={name} type={type ?? 'text'} />
          </label>
        ))}
        <div className="self-end">
          <Button type="submit">Filter audit log</Button>
        </div>
      </form>
      <Records
        records={records}
        columns={columns}
        label="Audit log"
        empty="No administrative actions recorded"
      />
    </>
  );
}
