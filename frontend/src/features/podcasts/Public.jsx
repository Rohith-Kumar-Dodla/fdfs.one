import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { languages } from '../../../../shared/films.js';
import {
  participantRoles,
  podcastBrand,
  timestamp,
} from '../../../../shared/podcasts.js';
import { apiClient } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import { Select, TextInput } from '../../components/ui/fields.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import {
  Badge,
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../components/ui/states.jsx';
import { usePageMetadata } from '../../hooks/use-page-metadata.js';
import { FilmImage } from '../films/FilmImage.jsx';
import { useSiteSettings } from '../site/public.jsx';
import { EpisodeComments } from './Comments.jsx';
import { EpisodePlayer } from './Player.jsx';

export const podcastKeys = ['podcasts'];
const field = 'grid min-w-0 gap-1 text-sm';
const episodePath = (slug) => '/podcasts/' + encodeURIComponent(slug);
const navigateLinks =
  'inline-flex min-h-11 items-center font-semibold text-accent underline';
const formatDate = (date) => new Date(date).toLocaleString();

function Resources({ links, title }) {
  if (!links?.length) return null;
  return (
    <section className="grid gap-2 wrap-anywhere">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex flex-wrap gap-x-4">
        {links.map(({ url, label }, index) => (
          <li key={index}>
            <a
              className={navigateLinks}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
function People({ entries, title, show }) {
  if (!entries?.length) return null;
  return (
    <section className="grid gap-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      <ul className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry, index) => (
          <Card as="li" key={index} className="min-w-0 wrap-anywhere">
            <Link to={'/talent/' + entry.slug} className={navigateLinks}>
              {entry.displayName}
            </Link>
            <p className="text-sm text-muted">
              {show ? 'Host' : participantRoles[entry.role]}
            </p>
            {entry.introduction && (
              <p className="mt-2 text-sm">{entry.introduction}</p>
            )}
          </Card>
        ))}
      </ul>
    </section>
  );
}
function EpisodeCard({ episode }) {
  return (
    <Card
      as="article"
      className="grid min-w-0 content-start gap-2 p-3! wrap-anywhere sm:p-4!"
    >
      <FilmImage image={episode.thumbnail} landscape />
      <h3 className="text-lg font-semibold">
        <Link to={episodePath(episode.slug)} className={navigateLinks}>
          {episode.title}
        </Link>
      </h3>
      <p className="text-sm text-muted">
        Season {episode.season} · Episode {episode.number}
      </p>
      <p className="text-sm text-muted">
        {languages[episode.language]} · {timestamp(episode.duration)}
      </p>
      {episode.availability === 'upcoming' && (
        <p className="text-sm text-accent">
          Upcoming{episode.hasTeaser ? ' · Teaser available' : ''}
        </p>
      )}
    </Card>
  );
}
function SearchTitle({ current, change }) {
  const [draft, setDraft] = useState({ initial: current, text: current });
  const text = draft.initial === current ? draft.text : current;
  useEffect(() => {
    if (text.trim() === current) return;
    const timer = setTimeout(
      () => change('q', text.trim(), { replace: true }),
      350,
    );
    return () => clearTimeout(timer);
  }, [text, current, change]);
  return (
    <label className={field}>
      Search episodes
      <TextInput
        type="search"
        maxLength={80}
        value={text}
        onChange={(event) =>
          setDraft({ initial: current, text: event.target.value })
        }
      />
    </label>
  );
}
function EpisodeDirectory() {
  const [params, update] = useSearchParams();
  const q = (params.get('q') ?? '').trim().slice(0, 80);
  const language = Object.hasOwn(languages, params.get('language'))
    ? params.get('language')
    : '';
  const rawTopic = params.get('topic') ?? '';
  const topic = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawTopic)
    ? rawTopic.slice(0, 40).replace(/-$/, '')
    : '';
  const season =
    /^\d{1,3}$/.test(params.get('season') ?? '') &&
    Number(params.get('season')) > 0
      ? params.get('season')
      : '';
  const sort = ['newest', 'oldest', 'number'].includes(params.get('sort'))
    ? params.get('sort')
    : 'newest';
  const availability = ['released', 'upcoming'].includes(
    params.get('availability'),
  )
    ? params.get('availability')
    : '';
  const rawPage = Number(params.get('page'));
  const page =
    Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 10000 ? rawPage : 1;
  function change(key, value, options) {
    const next = new URLSearchParams(params);
    if (value && !(key === 'page' && value === '1')) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    update(next, options);
  }
  const filters = {
    page,
    limit: 12,
    ...Object.fromEntries(
      Object.entries({ q, language, topic, season, sort, availability }).filter(
        ([, value]) => value,
      ),
    ),
  };
  const result = useQuery({
    queryKey: [...podcastKeys, 'episodes', filters],
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient.get('/podcasts/episodes', { params: filters, signal }),
  });
  return (
    <section className="grid min-w-0 gap-4">
      <h2 className="text-xl font-semibold">Episodes</h2>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SearchTitle current={q} change={change} />
        <label className={field}>
          Language
          <Select
            value={language}
            onChange={(event) => change('language', event.target.value)}
          >
            <option value="">All languages</option>
            {Object.entries(languages).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label className={field}>
          Release availability
          <Select
            value={availability}
            onChange={(event) => change('availability', event.target.value)}
          >
            <option value="">Released and upcoming</option>
            <option value="released">Released</option>
            <option value="upcoming">Upcoming</option>
          </Select>
        </label>
        <label className={field}>
          Sort by
          <Select
            value={sort}
            onChange={(event) => change('sort', event.target.value)}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="number">Episode number</option>
          </Select>
        </label>
        {[
          ['topic', 'Topic', topic],
          ['season', 'Season', season],
        ].map(([key, name, value]) => (
          <form
            key={key + value}
            className="flex min-w-0 items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const raw = new FormData(event.currentTarget).get(key).trim();
              change(
                key,
                key === 'topic' ? raw.toLowerCase().replace(/\s+/g, '-') : raw,
              );
            }}
          >
            <label className={field + ' flex-1'}>
              {name}
              <TextInput
                name={key}
                defaultValue={value}
                type={key === 'season' ? 'number' : 'text'}
                min={key === 'season' ? 1 : undefined}
                max={key === 'season' ? 999 : undefined}
                maxLength={key === 'topic' ? 40 : undefined}
              />
            </label>
            <Button variant="outline" type="submit">
              Apply {name.toLowerCase()}
            </Button>
          </form>
        ))}
      </div>
      {result.isPending && (
        <div className="grid grid-cols-2 gap-3" role="status">
          <span className="sr-only">Loading episodes</span>
          <Skeleton className="aspect-video" />
          <Skeleton className="aspect-video" />
        </div>
      )}
      {result.isError && (
        <ErrorState
          title="Could not load episodes"
          description={result.error.message}
          onRetry={() => void result.refetch()}
        />
      )}
      {result.data && (
        <>
          {result.data.data.length > 0 ? (
            <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
              {result.data.data.map((episode) => (
                <EpisodeCard key={episode.id} episode={episode} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                q || topic || season || language || availability
                  ? 'No episodes match these filters'
                  : 'No episodes published yet'
              }
            />
          )}
          <Pagination
            page={page}
            totalPages={result.data.pagination.totalPages}
            onPageChange={(next) => change('page', String(next))}
          />
          {page > 1 && result.data.data.length === 0 && (
            <div>
              <Button variant="outline" onClick={() => change('page', '1')}>
                Return to first page
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
export function PodcastLanding() {
  const show = useQuery({
    queryKey: [...podcastKeys, 'show'],
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient.get('/podcasts', { signal }).then(({ data }) => data),
  });
  const latest = useQuery({
    queryKey: [...podcastKeys, 'latest'],
    meta: { public: true },
    enabled: Boolean(show.data),
    queryFn: ({ signal }) =>
      apiClient
        .get('/podcasts/episodes', {
          signal,
          params: { limit: 1, availability: 'released' },
        })
        .then(({ data }) => data[0] ?? null),
  });
  return (
    <Container className="grid min-w-0 grid-cols-1 gap-7 py-8 sm:py-12">
      {show.data?.banner && (
        <FilmImage image={show.data.banner} landscape eager />
      )}
      <header className="flex min-w-0 flex-col gap-4 wrap-anywhere sm:flex-row sm:items-center">
        {show.data?.cover && (
          <div className="w-32 shrink-0">
            <FilmImage image={show.data.cover} square eager sizes="128px" />
          </div>
        )}
        <SectionHeading as="h1" description={show.data?.introduction}>
          {show.data?.name ?? podcastBrand.name}
        </SectionHeading>
      </header>
      {show.isPending && <Skeleton className="h-24" />}
      {show.isError && (
        <ErrorState
          title="Could not load the show"
          description={show.error.message}
          onRetry={() => void show.refetch()}
        />
      )}
      {show.data === null && (
        <EmptyState title="The show has yet to be published" />
      )}
      {show.data && (
        <>
          <p className="whitespace-pre-wrap wrap-anywhere">
            {show.data.description}
          </p>
          <People entries={show.data.hosts} title="Hosts" show />
          <Resources links={show.data.links} title="Official platforms" />
          {latest.data && (
            <section className="grid min-w-0 gap-3">
              <h2 className="text-xl font-semibold">Latest episode</h2>
              <div className="max-w-sm">
                <EpisodeCard episode={latest.data} />
              </div>
            </section>
          )}
          <EpisodeDirectory />
        </>
      )}
    </Container>
  );
}

export function EpisodeDetail() {
  const settings = useSiteSettings();
  const { slug } = useParams();
  const query = useQuery({
    queryKey: [...podcastKeys, 'episode', slug],
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient
        .get('/podcasts/episodes/' + encodeURIComponent(slug), { signal })
        .then(({ data }) => data),
    refetchInterval: ({ state }) =>
      state.data?.availability === 'upcoming'
        ? Math.min(
            60000,
            Math.max(
              1000,
              new Date(state.data.releaseAt).getTime() - Date.now(),
            ),
          )
        : false,
  });
  const episode = query.data;
  usePageMetadata(
    episode && {
      title: episode.title + ' | ' + episode.show.name,
      description: episode.synopsis,
      path: episodePath(episode.slug),
    },
  );
  return (
    <Container className="grid max-w-5xl! grid-cols-1 gap-6 py-8">
      <Link className={navigateLinks + ' justify-self-start'} to="/podcasts">
        Back to {podcastBrand.name}
      </Link>
      {query.isPending && (
        <div role="status">
          <span className="sr-only">Loading episode</span>
          <Skeleton className="aspect-video" />
        </div>
      )}
      {query.isError &&
        ([404, 400].includes(query.error.status) ? (
          <SectionHeading as="h1">Episode unavailable</SectionHeading>
        ) : (
          <ErrorState
            title="Could not load the episode"
            description={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ))}
      {episode && (
        <>
          {(episode.banner || episode.thumbnail) && (
            <FilmImage
              image={episode.banner ?? episode.thumbnail}
              landscape
              eager
            />
          )}
          <header className="grid min-w-0 gap-2 wrap-anywhere">
            <div>
              <Badge>{episode.show.name}</Badge>
            </div>
            <SectionHeading as="h1" description={episode.synopsis}>
              {episode.title}
            </SectionHeading>
            <p className="text-muted">
              Season {episode.season} · Episode {episode.number} ·{' '}
              {languages[episode.language]} · {timestamp(episode.duration)}
            </p>
            {episode.releaseAt && (
              <p className="text-sm text-muted">
                {episode.availability === 'upcoming'
                  ? 'Scheduled for'
                  : 'Released'}{' '}
                <time dateTime={episode.releaseAt}>
                  {formatDate(episode.releaseAt)}
                </time>
              </p>
            )}
          </header>
          {episode.advisory && (
            <p className="wrap-anywhere text-muted">
              Content advisory · {episode.advisory}
            </p>
          )}
          <EpisodePlayer key={episode.id} episode={episode} />
          {episode.notes && (
            <section className="grid gap-2 wrap-anywhere">
              <h2 className="text-xl font-semibold">Show notes</h2>
              <p className="whitespace-pre-wrap">{episode.notes}</p>
            </section>
          )}
          {episode.topics.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Episode topics">
              {episode.topics.map((topic) => (
                <li key={topic}>
                  <Link
                    to={'/podcasts?topic=' + topic}
                    className={navigateLinks}
                  >
                    {topic.replaceAll('-', ' ')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <People entries={episode.participants} title="Hosts and guests" />
          <Resources links={episode.links} title="Resources" />
          {episode.availability === 'released' &&
            settings.communityOpen &&
            episode.commentsEnabled !== false && (
              <EpisodeComments key={episode.slug} slug={episode.slug} />
            )}
        </>
      )}
    </Container>
  );
}
