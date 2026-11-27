import { useState } from 'react';
import {
  Link,
  NavLink,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router';
import { sources } from '../../../../shared/homepage.js';
import {
  personalSections,
  saveTypes,
  progressTypes,
} from '../../../../shared/personal.js';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import {
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import {
  EmptyState,
  ErrorState,
  Spinner,
} from '../../components/ui/states.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { usePersonal, usePersonalChange, referencePath } from './api.js';
import { playbackTime } from './Playback.jsx';
import { FollowAction, SaveAction } from './Actions.jsx';

const tabs = {
  watchlist: 'Watchlist',
  continue: 'Continue Watching',
  history: 'Watch history',
  following: 'Following',
  reminders: 'Reminders',
};
const links = [
  ['/account/notifications', 'Notifications'],
  ['/account/reviews', 'Ratings and reviews'],
  ['/support/tickets', 'Support tickets'],
  ['/account', 'Edit profile'],
  ['/account/settings', 'Account and security'],
];
const resumePath = (item, resume) =>
  item.path + (resume ? '?resume=1' : '?start=1') + '#playback';
export function PersonalStatus({ query, children }) {
  if (query.isPending) return <Spinner label="Loading your activity" />;
  if (query.isError)
    return (
      <ErrorState
        title="Could not load your activity"
        description={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  return children(query.data);
}
function Progress({ data }) {
  if (!data || data.position === undefined) return null;
  return (
    <>
      {data.duration > 0 && (
        <progress
          className="h-2 w-full accent-accent"
          max={data.duration}
          value={Math.min(data.duration, data.position)}
          aria-label="Playback progress"
        />
      )}
      <p className="text-xs text-muted">
        {data.completed
          ? 'Completed'
          : data.duration > 0
            ? playbackTime(data.duration - data.position) + ' remaining'
            : playbackTime(data.position) + ' watched'}
      </p>
    </>
  );
}
function ActivityCard({ item, kind }) {
  const change = usePersonalChange();
  const [confirm, setConfirm] = useState(false);
  const resume = kind === 'progress' || kind === 'continue';
  const history = kind === 'history';
  const following = kind === 'following' && item.module === 'talent';
  const path = following
    ? '/following/' + item.id
    : '/' +
      (resume ? 'continue' : history ? 'history' : 'watchlist') +
      referencePath(item);
  return (
    <Card
      as="li"
      className="grid min-w-0 content-start gap-2 p-3! wrap-anywhere"
    >
      {!item.unavailable && (
        <FilmImage
          image={item.landscape ?? item.image}
          landscape
          sizes="320px"
        />
      )}
      <h3 className="font-semibold">
        {item.unavailable ? 'Content unavailable' : item.title}
      </h3>
      {item.module && (
        <p className="text-xs text-muted">{sources[item.module]?.label}</p>
      )}
      {item.upcoming && item.date && (
        <time className="text-sm" dateTime={item.date}>
          {new Date(item.date).toLocaleString()}
        </time>
      )}
      {history && item.progress?.watchedAt && (
        <time className="text-sm text-muted" dateTime={item.progress.watchedAt}>
          {new Date(item.progress.watchedAt).toLocaleString()}
        </time>
      )}
      <Progress data={item.progress} />
      <div className="flex flex-wrap items-start gap-2">
        {!item.unavailable && (
          <Link
            className={buttonClasses(resume ? 'primary' : 'outline')}
            to={resume ? resumePath(item, true) : item.path}
          >
            {resume
              ? 'Resume'
              : following
                ? 'View profile'
                : kind === 'reminders'
                  ? 'View event'
                  : 'Open'}
          </Link>
        )}
        {resume && !item.unavailable && (
          <Link
            className={buttonClasses('outline')}
            to={resumePath(item, false)}
          >
            Start over
          </Link>
        )}
        {following && !item.unavailable && (
          <FollowAction profile={{ id: item.id, displayName: item.title }} />
        )}
        {kind === 'watchlist' && !item.unavailable && (
          <SaveAction item={item} />
        )}
        {(history ||
          resume ||
          ((following || kind === 'watchlist') && item.unavailable)) && (
          <Button
            variant="outline"
            loading={change.isPending}
            onClick={() =>
              history ? setConfirm(true) : change.mutate({ path })
            }
          >
            {resume
              ? 'Remove from Continue Watching'
              : history
                ? 'Remove from history'
                : 'Remove'}
          </Button>
        )}
      </div>
      {change.isError && (
        <p role="alert" className="text-sm text-danger-text">
          {change.error.message}
        </p>
      )}
      {history && (
        <Dialog
          title="Remove this history entry?"
          open={confirm}
          onClose={() => setConfirm(false)}
        >
          <p className="mb-3 text-sm">
            This also removes its saved playback position.
          </p>
          <Button
            loading={change.isPending}
            onClick={() =>
              change.mutate({ path }, { onSuccess: () => setConfirm(false) })
            }
          >
            Remove entry
          </Button>
        </Dialog>
      )}
    </Card>
  );
}
export function PersonalRail({ kind, items, heading, horizontal = true }) {
  if (!items?.length) return null;
  const id = 'personal-' + kind;
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-3">
      <h2 id={id} className="text-xl font-bold sm:text-2xl">
        {heading ?? personalSections[kind] ?? tabs[kind]}
      </h2>
      {horizontal ? (
        <div
          tabIndex={0}
          aria-label={heading ?? personalSections[kind] ?? tabs[kind]}
          className="min-w-0 overflow-x-auto overscroll-x-contain"
        >
          <ul className="grid auto-cols-[min(74vw,17rem)] grid-flow-col gap-3 pb-2">
            {items.map((item) => (
              <ActivityCard
                key={item.module + ':' + item.id}
                item={item}
                kind={kind}
              />
            ))}
          </ul>
        </div>
      ) : (
        <ul className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <ActivityCard
              key={item.module + ':' + item.id}
              item={item}
              kind={kind}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
export function PersonalHomeSections({ data }) {
  return data?.sections?.map(({ kind, items }) => (
    <PersonalRail
      key={kind}
      kind={kind}
      items={items}
      heading={
        kind === 'recommended' && !data.personalized
          ? 'Discover on FDFS'
          : undefined
      }
    />
  ));
}

function DashboardOverview({ user }) {
  const query = usePersonal('/dashboard');
  return (
    <PersonalStatus query={query}>
      {(data) => (
        <>
          <Card className="grid gap-3">
            <h2 className="text-xl font-semibold wrap-anywhere">
              {user.fullName}
            </h2>
            <Link className="text-accent underline" to="/account">
              Edit profile and avatar
            </Link>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries({
                saved: 'Saved titles',
                watched: 'Watched titles',
                ratings: 'Ratings',
                reviews: 'Reviews',
                followed: 'Following',
                unread: 'Unread notices',
              }).map(([key, label]) => (
                <div className="min-w-0" key={key}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="text-2xl font-semibold">{data.counts[key]}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <PersonalHomeSections data={data.home} />
          <PersonalRail
            kind="history"
            heading="Recently watched"
            items={data.recent}
          />
          <PersonalRail
            kind="following"
            heading="Followed Talent Profiles"
            items={data.following}
          />
        </>
      )}
    </PersonalStatus>
  );
}

function ClearHistory() {
  const [open, setOpen] = useState(false);
  const change = usePersonalChange();
  return (
    <>
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Clear watch history
        </Button>
      </div>
      <Dialog
        title="Clear your watch history?"
        open={open}
        onClose={() => !change.isPending && setOpen(false)}
      >
        <p className="mb-3 text-sm">
          This removes saved playback positions and Continue Watching entries on
          all your devices. Your watchlist and reviews are kept.
        </p>
        <Button
          loading={change.isPending}
          onClick={() =>
            change.mutate(
              { path: '/history' },
              { onSuccess: () => setOpen(false) },
            )
          }
        >
          Clear all history
        </Button>
        {change.isError && (
          <p role="alert" className="mt-2 text-danger-text">
            {change.error.message}
          </p>
        )}
      </Dialog>
    </>
  );
}
function Library({ tab }) {
  const [params, setParams] = useSearchParams();
  const types = tab === 'watchlist' ? saveTypes : progressTypes;
  const hasFilter = ['watchlist', 'continue', 'history'].includes(tab);
  const module = types.includes(params.get('module'))
    ? params.get('module')
    : undefined;
  const page = Math.min(
    1000,
    Math.max(1, Number.parseInt(params.get('page'), 10) || 1),
  );
  const query = usePersonal('/' + tab, {
    params: tab === 'reminders' ? undefined : { module, page, limit: 12 },
  });
  if (tab === 'reminders')
    return (
      <PersonalStatus query={query}>
        {(items) => {
          return items?.length ? (
            <PersonalRail kind="reminders" items={items} horizontal={false} />
          ) : (
            <EmptyState title="No upcoming reminder subscriptions" />
          );
        }}
      </PersonalStatus>
    );
  return (
    <>
      {hasFilter && (
        <label className="grid max-w-64 gap-1 text-sm">
          Content type
          <select
            className="min-h-11 rounded-control border border-line bg-base px-3"
            value={module ?? ''}
            onChange={(event) =>
              setParams(
                event.target.value ? { module: event.target.value } : {},
              )
            }
          >
            <option value="">All content</option>
            {types.map((key) => (
              <option key={key} value={key}>
                {sources[key].label}
              </option>
            ))}
          </select>
        </label>
      )}
      {tab === 'history' && <ClearHistory />}
      {tab === 'continue' && (
        <Link
          className="text-accent underline"
          to="/account/settings#personalization"
        >
          Manage playback history
        </Link>
      )}
      <PersonalStatus query={query}>
        {(data) => (
          <>
            {data.items.length ? (
              <PersonalRail kind={tab} items={data.items} horizontal={false} />
            ) : (
              <EmptyState
                title={'No ' + tabs[tab].toLowerCase() + ' entries'}
              />
            )}
            <Pagination
              page={page}
              totalPages={data.pagination.totalPages}
              onPageChange={(next) =>
                setParams({ ...(module && { module }), page: next })
              }
            />
            {page > 1 && !data.items.length && (
              <Button
                variant="outline"
                onClick={() => setParams(module ? { module } : {})}
              >
                Return to first page
              </Button>
            )}
          </>
        )}
      </PersonalStatus>
    </>
  );
}
export function Dashboard() {
  const user = useOutletContext();
  const { tab } = useParams();
  const navigation = [
    ['/dashboard', 'Overview'],
    ...Object.entries(tabs).map(([key, title]) => ['/dashboard/' + key, title]),
  ];
  return (
    <Container className="grid min-w-0 gap-6 py-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="grid min-w-0 content-start gap-3">
        <nav
          aria-label="Your dashboard"
          className="flex min-w-0 flex-wrap gap-1 lg:grid"
        >
          {navigation.map(([url, label]) => (
            <NavLink
              key={url}
              to={url}
              end
              className={({ isActive }) =>
                buttonClasses(isActive ? 'primary' : 'ghost', 'justify-start')
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <nav
          aria-label="Your account"
          className="flex min-w-0 flex-wrap gap-1 lg:grid"
        >
          {links.map(([url, label]) => (
            <Link
              key={url}
              to={url}
              className={buttonClasses('ghost', 'justify-start')}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="grid min-w-0 content-start gap-5">
        <SectionHeading as="h1">
          {tab ? (tabs[tab] ?? 'Your dashboard') : 'Your dashboard'}
        </SectionHeading>
        {!tab ? (
          <DashboardOverview user={user} />
        ) : Object.hasOwn(tabs, tab) ? (
          <Library key={tab} tab={tab} />
        ) : (
          <EmptyState title="Dashboard page unavailable" />
        )}
      </div>
    </Container>
  );
}
