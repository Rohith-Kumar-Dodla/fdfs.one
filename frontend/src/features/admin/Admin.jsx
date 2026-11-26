import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import {
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import {
  date,
  get,
  QueryState,
  readable,
  Records,
  useRecords,
} from './common.jsx';

const items = [
  ['/admin', 'Overview'],
  ['/admin/users', 'Users'],
  ['/admin/submissions', 'Submissions'],
  ['/admin/talent', 'Talent Profiles'],
  ['/admin/films', 'Films'],
  ['/admin/podcasts', 'Podcasts'],
  ['/admin/media', 'Media library'],
  ['/admin/audit', 'Audit log'],
];

function Navigation({ onNavigate }) {
  return (
    <nav aria-label="Administration" className="grid gap-1">
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
    </nav>
  );
}

export function AdminLayout() {
  const location = useLocation();
  const [drawer, setDrawer] = useState(null);
  return (
    <Container className="grid min-w-0 gap-5 py-7 lg:grid-cols-[11rem_minmax(0,1fr)] lg:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4 lg:col-span-2">
        <p className="text-lg font-semibold">Administration</p>
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
      </header>
      <aside className="hidden self-start rounded-panel border border-line bg-nav p-2 lg:block">
        <Navigation />
      </aside>
      <Dialog
        open={drawer === location.key}
        onClose={() => setDrawer(null)}
        title="Administration menu"
        className="top-0! right-auto! bottom-auto! left-0! m-0! h-dvh max-h-dvh! w-[min(20rem,90vw)]! max-w-none! rounded-none!"
      >
        <Navigation onNavigate={() => setDrawer(null)} />
      </Dialog>
      <div className="grid min-w-0 content-start gap-5">
        <Outlet />
      </div>
    </Container>
  );
}

export function OverviewPage() {
  const url = '/admin/overview';
  const query = useQuery({
    queryKey: [url],
    queryFn: ({ signal }) => get(url, signal),
  });
  return (
    <>
      <SectionHeading as="h1">Overview</SectionHeading>
      <QueryState query={query}>
        {(data) => (
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Users', data.users],
              ['Awaiting review', data.reviewQueue],
              ['Images', data.images],
              ['Audit events', data.auditEvents],
            ].map(([title, value]) => (
              <Card key={title} className="min-w-0">
                <dt className="text-sm text-muted">{title}</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {value.toLocaleString()}
                </dd>
              </Card>
            ))}
          </dl>
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
      [row.summary?.field, row.summary?.from, row.summary?.to]
        .filter(Boolean)
        .join(' → '),
  },
  { title: 'Request ID', render: (row) => row.requestId },
];

export function AuditPage() {
  return (
    <>
      <SectionHeading as="h1">Audit log</SectionHeading>
      <Records
        records={useRecords('/admin/audit')}
        columns={columns}
        label="Audit log"
        empty="No administrative actions recorded"
      />
    </>
  );
}
