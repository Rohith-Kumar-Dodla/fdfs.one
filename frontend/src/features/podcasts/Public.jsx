import { FilmImage } from '../films/FilmImage.jsx';
import { YouTubePlayer } from '../media/YouTubePlayer.jsx';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { languages } from '../../../../shared/films.js';
import {
  participantRoles,
  podcastBrand,
  timestamp,
} from '../../../../shared/podcasts.js';
import { apiClient } from '../../api/client.js';
import {
  Badge,
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import { ErrorState, Skeleton } from '../../components/ui/states.jsx';
import { usePageMetadata } from '../../hooks/use-page-metadata.js';
import { useSiteSettings } from '../site/public.jsx';
import { EpisodeComments } from './Comments.jsx';
import { SaveAction } from '../personal/Actions.jsx';
import { Related } from '../personal/Related.jsx';
import { EpisodePlayer } from './Player.jsx';

export const podcastKeys = ['podcasts'];
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
        {links.map(({ url, label, description }, index) => (
          <li key={index}>
            <a
              className={navigateLinks}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {label}
            </a>
            {description && (
              <p className="text-sm text-muted wrap-anywhere">{description}</p>
            )}
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
export { PodcastLanding } from '../public-ui/Directories.jsx';

export function EpisodeDetail() {
  const [params] = useSearchParams();
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
          <EpisodePlayer
            key={episode.id}
            episode={episode}
            openMain={params.has('resume') || params.has('start')}
            artwork={episode.banner ?? episode.thumbnail}
            information={
              <>
                <header className="grid min-w-0 gap-2 wrap-anywhere">
                  <div>
                    <Badge>{episode.show.name}</Badge>
                  </div>
                  <SectionHeading as="h1" description={episode.synopsis}>
                    {episode.title}
                  </SectionHeading>
                  <p className="text-muted">
                    Season {episode.season} · Episode {episode.number} ·{' '}
                    {languages[episode.language]} ·{' '}
                    {timestamp(episode.duration)}
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
                <div>
                  <SaveAction item={episode} module="podcasts" />
                </div>

                {episode.notes && (
                  <section className="grid gap-2 wrap-anywhere">
                    <h2 className="text-xl font-semibold">Show notes</h2>
                    <p className="whitespace-pre-wrap">{episode.notes}</p>
                  </section>
                )}
                <People
                  entries={episode.participants}
                  title="Hosts and guests"
                />
              </>
            }
          />
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
          {episode.gallery?.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-xl font-semibold">Supporting images</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {episode.gallery.map((item, index) => (
                  <FilmImage key={item.id ?? index} image={item} landscape />
                ))}
              </div>
            </section>
          )}
          {episode.extras?.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-xl font-semibold">Supporting videos</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {episode.extras.map(({ title, video }) => (
                  <div className="grid gap-2" key={video.providerVideoId}>
                    <h3 className="font-semibold">{title}</h3>
                    <YouTubePlayer title={title} video={video} />
                  </div>
                ))}
              </div>
            </section>
          )}
          <Resources links={episode.links} title="Resources" />
          <Related module="podcasts" id={episode.id} />
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
