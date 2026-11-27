import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clapperboard,
  House,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareText,
  Settings,
  Ticket,
  Users,
} from 'lucide-react';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useOutletContext,
} from 'react-router';
import { can } from '../../../../shared/admin.js';
import { AccountNavigation, useSignOut } from '../auth/AccountNavigation.jsx';
import { NotificationsLink } from '../operations/Notices.jsx';
import { currentWorkspace, visibleGroups } from './navigation.js';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { date, get, readable, Records, useRecords } from './common.jsx';
import { RecordFilters } from './ContentGrid.jsx';
import { useOverview } from './Workspace.jsx';

const icons = {
  Overview: LayoutDashboard,
  Content: Clapperboard,
  Reviews: MessageSquareText,
  Community: Users,
  'Support Tickets': Ticket,
  'Media Library': Images,
  Promotions: Megaphone,
  'Homepage Management': LayoutTemplate,
  System: Settings,
};

function Navigation({ account, active, collapsed, onNavigate }) {
  return (
    <nav
      aria-label="Administration"
      className="grid gap-1 overflow-y-auto px-2 py-3"
    >
      {visibleGroups(account).map(([name, to]) => {
        const Icon = icons[name];
        return (
          <Link
            key={name}
            to={to}
            aria-label={name}
            title={collapsed ? name : undefined}
            aria-current={active === name ? 'page' : undefined}
            onClick={onNavigate}
            className={
              'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-semibold ' +
              (active === name
                ? 'bg-accent/10 text-accent'
                : 'text-muted hover:bg-surface hover:text-foreground')
            }
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {!collapsed && name}
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar({ account, active, collapsed, onNavigate }) {
  const { logout, working } = useSignOut(onNavigate);
  return (
    <>
      <Link
        to={account.roles.includes('super_admin') ? '/admin' : '/'}
        aria-label={
          account.roles.includes('super_admin')
            ? 'FDFS.ONE administration'
            : 'FDFS.ONE public website'
        }
        className="flex min-h-16 items-center gap-3 border-b border-line px-5 font-bold"
        onClick={onNavigate}
      >
        {collapsed ? (
          <House className="size-5 shrink-0 text-accent" aria-hidden="true" />
        ) : (
          <span>
            FDFS<span className="text-accent">.ONE</span>
          </span>
        )}
      </Link>
      <Navigation
        account={account}
        active={active}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      <div className="mt-auto border-t border-line p-2">
        <Button
          variant="ghost"
          aria-label="Logout"
          title={collapsed ? 'Logout' : undefined}
          className="w-full justify-start!"
          onClick={logout}
          loading={working}
        >
          <LogOut className="size-5 shrink-0" aria-hidden="true" />
          {!collapsed && 'Logout'}
        </Button>
      </div>
    </>
  );
}

export function AdminLayout() {
  const location = useLocation();
  const account = useOutletContext();
  const [drawer, setDrawer] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const workspace = currentWorkspace(location.pathname);
  const active = workspace?.[0] ?? 'Administration';
  const tabs =
    visibleGroups(account).find(([name]) => name === active)?.[2] ?? [];
  const scroll = useRef(null);
  const menu = useRef(null);
  const open = drawer === location.key;
  useEffect(() => {
    scroll.current?.scrollTo?.(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia('(min-width: 64rem)');
    const onChange = (event) => {
      if (event.matches) setDrawer(null);
    };
    desktop.addEventListener('change', onChange);
    return () => {
      desktop.removeEventListener('change', onChange);
      menu.current?.focus();
    };
  }, [open]);

  return (
    <div
      className={
        'grid h-dvh min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden bg-base ' +
        (collapsed
          ? 'lg:grid-cols-[4.5rem_minmax(0,1fr)]'
          : 'lg:grid-cols-[16rem_minmax(0,1fr)]')
      }
    >
      <aside
        id="admin-sidebar"
        className="hidden min-h-0 flex-col border-r border-line bg-nav lg:flex"
      >
        <Sidebar account={account} active={active} collapsed={collapsed} />
      </aside>
      <Dialog
        open={open}
        onClose={() => setDrawer(null)}
        title="Administration menu"
        closeLabel="Close administration menu"
        closeIcon={Menu}
        className="top-0! right-auto! bottom-auto! left-0! m-0! h-dvh max-h-dvh! w-[min(20rem,90vw)]! max-w-none! rounded-none!"
        contentClassName="flex h-full min-h-0 flex-col"
      >
        <Sidebar
          account={account}
          active={active}
          onNavigate={() => setDrawer(null)}
        />
      </Dialog>
      <div
        ref={scroll}
        className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto"
      >
        <header className="sticky top-0 z-20 flex min-h-16 min-w-0 items-center justify-between gap-2 border-b border-line bg-nav px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <IconButton
              className="hidden! lg:inline-flex!"
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-controls="admin-sidebar"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              <Menu aria-hidden="true" className="size-5" />
            </IconButton>
            <IconButton
              ref={menu}
              className={open ? 'invisible lg:hidden!' : 'lg:hidden!'}
              label="Open administration menu"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setDrawer(location.key)}
            >
              <Menu aria-hidden="true" className="size-5" />
            </IconButton>
            <p className="truncate font-semibold">{active}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <NotificationsLink
              icon
              administrator={account.roles.includes('super_admin')}
              className="relative grid size-11 place-items-center rounded-control hover:bg-surface"
            />
            <AccountNavigation administrator />
          </div>
        </header>
        <div className="grid min-w-0 content-start gap-4 p-3 sm:p-5 xl:p-7">
          {active === 'Content' && location.pathname !== '/admin/content' && (
            <Link
              to="/admin/content"
              className="w-fit py-2 text-sm font-semibold text-accent"
            >
              Back to Content
            </Link>
          )}
          {['/admin/movies', '/admin/review-moderation'].some(
            (path) =>
              location.pathname === path ||
              location.pathname.startsWith(path + '/'),
          ) && (
            <nav
              aria-label="Movies and Reviews"
              className="flex flex-wrap gap-2"
            >
              {[
                [
                  '/admin/movies',
                  'Movie Catalogue',
                  can(account, 'content', 'movies'),
                ],
                [
                  '/admin/movies/requests',
                  'Movie Requests',
                  can(account, 'content', 'movies'),
                ],
                [
                  '/admin/review-moderation?view=reviews',
                  'Reviews',
                  can(account, 'moderation'),
                ],
                [
                  '/admin/review-moderation?view=reports',
                  'Reports and Moderation',
                  can(account, 'moderation'),
                ],
              ]
                .filter(([, , allowed]) => allowed)
                .map(([to, label]) => (
                  <Link
                    key={to}
                    to={to}
                    aria-current={
                      location.pathname + location.search === to
                        ? 'page'
                        : undefined
                    }
                    className="flex min-h-11 items-center rounded-control border border-line px-3 text-sm aria-[current=page]:border-accent aria-[current=page]:text-accent"
                  >
                    {label}
                  </Link>
                ))}
            </nav>
          )}
          {active === 'Community' && (
            <nav aria-label="Community" className="flex flex-wrap gap-2">
              {tabs.map(([to, label]) => (
                <NavLink
                  className="rounded-control border border-line px-3 py-2 text-sm aria-[current=page]:border-accent aria-[current=page]:text-accent"
                  to={to}
                  key={to}
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
          {active === 'System' && location.pathname !== '/admin/system' && (
            <Link
              to="/admin/system"
              className="w-fit py-2 text-sm font-semibold text-accent"
            >
              Back to System
            </Link>
          )}
          {location.state?.contentNotice && (
            <p role="status" className="text-success">
              {location.state.contentNotice}
            </p>
          )}
          <Outlet context={account} />
        </div>
      </div>
    </div>
  );
}

export function WorkspaceRedirect({ name }) {
  const account = useOutletContext();
  const group = visibleGroups(account).find(([label]) => label === name);
  return <Navigate to={group?.[2][0]?.[0] ?? '/admin'} replace />;
}

export function OverviewPage() {
  const account = useOutletContext();
  return can(account, 'dashboard') ? (
    <DashboardOverview account={account} />
  ) : (
    <WorkspaceRedirect name="Support Tickets" />
  );
}

const moduleMetrics = [
  ['cinema', 'FDFS Cinema'],
  ['originals', 'FDFS Originals'],
  ['episodes', '404 Reality Not Found'],
  ['events', 'FDFS Live'],
  ['movies', 'Movies & Reviews'],
  ['talent', 'Talent Profiles'],
];

function DashboardOverview({ account }) {
  const overview = useOverview();
  const operations = useQuery({
    queryKey: ['/admin/analytics/overview'],
    enabled: can(account, 'analytics'),
    queryFn: ({ signal }) => get('/admin/analytics/overview', signal),
    refetchInterval: 30000,
  });
  const health = useQuery({
    queryKey: ['/admin/system-health'],
    enabled: can(account, 'operations'),
    queryFn: ({ signal }) => get('/admin/system-health', signal),
    refetchInterval: 60000,
  });
  const data = overview.data?.data;
  const summary = operations.data?.data;
  const presence = summary?.presence;
  const counts = moduleMetrics
    .map(([key]) => data?.[key])
    .filter(Number.isFinite);
  const metric = (query, value, allowed = true) =>
    Number.isFinite(value)
      ? value.toLocaleString()
      : allowed && query.isPending
        ? 'Loading…'
        : 'Unavailable';
  const rows = [
    [
      'Total registered users',
      metric(overview, data?.users, can(account, 'users')),
    ],
    [
      'Estimated online visitors',
      presence?.initializing
        ? 'Initializing'
        : metric(
            operations,
            presence?.estimatedVisitors,
            can(account, 'analytics'),
          ),
      operations.isError && summary
        ? 'Last known estimate'
        : 'Includes estimated guest presence',
    ],
    [
      'Published content',
      metric(
        overview,
        counts.length === moduleMetrics.length
          ? counts.reduce((sum, value) => sum + value, 0)
          : undefined,
      ),
    ],
    [
      'Active live events',
      metric(overview, data?.live, can(account, 'content', 'live')),
    ],
    [
      'Open support tickets',
      metric(operations, summary?.openTickets, can(account, 'analytics')),
    ],
    [
      'Pending approvals',
      metric(
        overview,
        data &&
          (Number.isFinite(data.reviewQueue) ||
            Number.isFinite(data.movieRequests))
          ? (data.reviewQueue ?? 0) + (data.movieRequests ?? 0)
          : undefined,
        can(account, 'moderation') || counts.length > 0,
      ),
    ],
  ];
  return (
    <>
      <SectionHeading as="h1">Overview</SectionHeading>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {rows.map(([label, value, description]) => (
          <Card key={label} className="p-4!">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 text-xl font-semibold">{value}</dd>
            {description && (
              <dd className="mt-1 text-xs text-muted">{description}</dd>
            )}
          </Card>
        ))}
      </dl>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="grid content-start gap-3">
          <h2 className="font-semibold">Published by module</h2>
          <dl className="grid gap-2 text-sm">
            {moduleMetrics.map(([key, label]) => (
              <div key={key} className="flex justify-between gap-3">
                <dt>{label}</dt>
                <dd className="text-muted">{metric(overview, data?.[key])}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {data?.recentActivity && (
          <Card className="grid content-start gap-3">
            <h2 className="font-semibold">Recent administrative activity</h2>
            {data.recentActivity.length ? (
              <ul className="grid gap-2 text-sm">
                {data.recentActivity.slice(0, 5).map((entry) => (
                  <li className="wrap-anywhere" key={entry._id}>
                    {date(entry.createdAt)} · {readable(entry.action)} ·{' '}
                    {entry.targetType}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No activity recorded.</p>
            )}
          </Card>
        )}
        {can(account, 'analytics') && (
          <Card className="grid content-start gap-3">
            <h2 className="font-semibold">Platform activity</h2>
            <p className="text-sm text-muted">
              New registrations today ·{' '}
              {metric(operations, summary?.registrations)}
            </p>
            <Link
              to="/admin/analytics"
              className="text-sm font-semibold text-accent"
            >
              Open Platform Analytics
            </Link>
          </Card>
        )}
        {can(account, 'operations') && (
          <Card className="grid content-start gap-3">
            <h2 className="font-semibold">System health</h2>
            <p className="text-sm text-muted">
              {health.data?.data?.at
                ? 'API ' +
                  readable(health.data.data.api.status) +
                  ' · Database ' +
                  readable(health.data.data.mongodb.status) +
                  ' · ' +
                  date(health.data.data.at)
                : health.isPending
                  ? 'Checking…'
                  : 'Unavailable'}
            </p>
            <Link
              to="/admin/system-health"
              className="text-sm font-semibold text-accent"
            >
              Open System Health
            </Link>
          </Card>
        )}
        {visibleGroups(account).some(([, , items]) =>
          items.some(([to]) => to === '/admin/submissions'),
        ) && (
          <Card className="grid content-start gap-3">
            <h2 className="font-semibold">Pending actions</h2>
            <Link
              to="/admin/submissions"
              className="text-sm font-semibold text-accent"
            >
              Review creator and organizer submissions
            </Link>
            {can(account, 'content', 'movies') && (
              <Link
                to="/admin/movies/requests"
                className="text-sm font-semibold text-accent"
              >
                Review movie requests
              </Link>
            )}
          </Card>
        )}
      </div>
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
      <div>
        <RecordFilters
          records={records}
          fields={[
            ['actor', 'Administrator ID'],
            ['action', 'Action'],
            ['resource', 'Resource type'],
            ['target', 'Target ID'],
            ['from', 'From date', undefined, 'date'],
            ['to', 'To date', undefined, 'date'],
            ['outcome', 'Result', [['success', 'Success']]],
          ]}
        />
      </div>
      <Records
        records={records}
        columns={columns}
        label="Audit log"
        empty="No administrative actions recorded"
      />
    </>
  );
}
