import {
  AudioLines,
  Clapperboard,
  Film,
  Radio,
  Star,
  Users,
} from 'lucide-react';
import { Link, useOutletContext } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../../components/ui/states.jsx';
import { Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import { get } from './common.jsx';
import { groups, visibleGroups } from './navigation.js';

const details = {
  independent: [
    Clapperboard,
    'cinema',
    'Manage independent short films and screenings.',
  ],
  original: [Film, 'originals', 'Manage FDFS productions.'],
  podcasts: [AudioLines, 'episodes', 'Manage episodes, hosts and guests.'],
  live: [Radio, 'events', 'Manage upcoming broadcasts and replays.'],
  movies: [Star, 'movies', 'Manage the movie catalogue and review requests.'],
  talent: [Users, 'talent', 'Manage profiles and credits.'],
};

export function useOverview() {
  const url = '/admin/overview';
  return useQuery({
    queryKey: [url],
    queryFn: ({ signal }) => get(url, signal),
  });
}

export function ContentWorkspace() {
  const account = useOutletContext();
  const access = visibleGroups(account).find(([name]) => name === 'Content');
  const { data, isPending } = useOverview();
  if (!access) return <EmptyState title="Access restricted" />;
  return (
    <>
      <SectionHeading as="h1">Content</SectionHeading>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups[1][2]
          .filter((entry) => entry[3])
          .map(([to, label, , module]) => {
            const [Icon, metric, description] = details[module];
            const allowed = access[2].some(([path]) => path === to);
            const count = data?.data?.[metric];
            return (
              <Card
                as="article"
                key={module}
                className="grid content-start justify-items-start gap-3"
              >
                <Icon className="size-6 text-accent" aria-hidden="true" />
                <h2 className="text-xl font-semibold">{label}</h2>
                <p className="text-sm text-muted">{description}</p>
                {allowed && (
                  <>
                    <p className="text-sm">
                      {typeof count === 'number'
                        ? count.toLocaleString() + ' published'
                        : isPending
                          ? 'Loading count…'
                          : 'Count unavailable'}
                    </p>
                    <Link
                      to={to}
                      aria-label={'Manage ' + label}
                      className={buttonClasses('outline')}
                    >
                      Manage Content
                    </Link>
                  </>
                )}
                {!allowed &&
                  module === 'movies' &&
                  access[2].some(
                    ([path]) => path === '/admin/review-moderation',
                  ) && (
                    <Link
                      to="/admin/review-moderation"
                      className={buttonClasses('outline')}
                    >
                      Review moderation
                    </Link>
                  )}
              </Card>
            );
          })}
      </div>
    </>
  );
}

export function SystemWorkspace() {
  const account = useOutletContext();
  const system = visibleGroups(account).find(([name]) => name === 'System');
  if (!system) return <EmptyState title="Access restricted" />;
  return (
    <>
      <SectionHeading as="h1">System</SectionHeading>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {system[2].map(([to, title]) => (
          <Link
            key={to}
            to={to}
            className="min-h-14 rounded-panel border border-line bg-surface p-4 font-semibold hover:border-accent hover:text-accent"
          >
            {title}
          </Link>
        ))}
      </div>
    </>
  );
}
