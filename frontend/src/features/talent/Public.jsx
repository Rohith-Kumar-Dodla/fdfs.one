import { useState } from 'react';
import { FollowAction } from '../personal/Actions.jsx';
import { Related } from '../personal/Related.jsx';
import { talentCategories } from '../../../../shared/public-home.js';
import { useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { professions } from '../../../../shared/talent.js';
import { filmPath, filmLabels } from '../../../../shared/films.js';
import { participantRoles } from '../../../../shared/podcasts.js';
import { FilmImage } from '../films/FilmImage.jsx';
import { usePageMetadata } from '../../hooks/use-page-metadata.js';
import { apiClient } from '../../api/client.js';
import { buttonClasses } from '../../components/ui/Button.jsx';
import {
  Badge,
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import { ErrorState, Skeleton } from '../../components/ui/states.jsx';

export const talentListKey = ['talent'];
export const professionOptions = Object.entries(professions);

export function TalentImage({ image, cover = false }) {
  const [broken, setBroken] = useState(null);
  const dimensions = cover
    ? 'aspect-[3/1] min-h-28 w-full'
    : 'aspect-square w-24 sm:w-32';
  if (!image?.url || image.url === broken)
    return cover ? null : (
      <div
        className={
          dimensions +
          ' grid shrink-0 place-items-center rounded-panel border border-line bg-nav text-muted'
        }
      >
        <UserRound aria-hidden="true" className="size-9" />
      </div>
    );
  return (
    <img
      src={image.url}
      alt={image.alt ?? ''}
      width={image.width}
      height={image.height}
      onError={() => setBroken(image.url)}
      srcSet={image.variants
        ?.map(({ url, width }) => url + ' ' + width + 'w')
        .join(', ')}
      sizes={
        cover
          ? '(min-width: 768px) 768px, 100vw'
          : '(min-width: 640px) 128px, 96px'
      }
      className={dimensions + ' shrink-0 rounded-panel bg-nav object-cover'}
    />
  );
}

function Roles({ values }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Professions">
      {values.map((value) => (
        <li key={value}>
          <Badge>{professions[value] ?? value}</Badge>
        </li>
      ))}
    </ul>
  );
}

function ExternalLink({ url, children }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center wrap-anywhere text-accent underline"
    >
      {children}
    </a>
  );
}

export function ProfileContent({ profile }) {
  return (
    <div className="grid min-w-0 gap-5 wrap-anywhere">
      {profile.alternativeName && (
        <p className="text-muted">Also known as {profile.alternativeName}</p>
      )}
      <Roles values={profile.professions} />
      {profile.location && (
        <p className="text-sm text-muted">{profile.location}</p>
      )}
      {profile.biography && (
        <section className="grid gap-2">
          <h2 className="text-xl font-semibold">Biography</h2>
          <p className="whitespace-pre-wrap">{profile.biography}</p>
        </section>
      )}
      {profile.achievements.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-semibold">
            Achievements and recognitions
          </h2>
          <ul className="grid gap-3">
            {profile.achievements.map((entry, index) => (
              <li key={index} className="border-l-2 border-line pl-4">
                <h3 className="font-semibold">{entry.title}</h3>
                {(entry.organization || entry.year) && (
                  <p className="text-sm text-muted">
                    {[entry.organization, entry.year]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {entry.description && (
                  <p className="whitespace-pre-wrap">{entry.description}</p>
                )}
                {entry.source && (
                  <ExternalLink url={entry.source}>
                    Source for {entry.title}
                  </ExternalLink>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(profile.website || profile.links.length > 0) && (
        <section className="grid gap-2">
          <h2 className="text-xl font-semibold">Professional links</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {profile.website && (
              <li>
                <ExternalLink url={profile.website}>
                  Professional website
                </ExternalLink>
              </li>
            )}
            {profile.links.map(({ label, url }, index) => (
              <li key={index}>
                <ExternalLink url={url}>{label}</ExternalLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export { TalentDirectory } from '../public-ui/Directories.jsx';

export function usePublicTalent(slug) {
  return useQuery({
    queryKey: [...talentListKey, 'profile', slug],
    meta: { public: true },
    enabled: Boolean(slug),
    queryFn: ({ signal }) =>
      apiClient
        .get('/talent/' + encodeURIComponent(slug), { signal })
        .then((result) => result.data),
  });
}

export function TalentProfile() {
  const { slug } = useParams();
  const query = usePublicTalent(slug);
  const profile = query.data;
  usePageMetadata(
    profile && {
      title: profile.displayName + ' | FDFS Talent Profiles',
      description: profile.introduction,
      path: '/talent/' + profile.slug,
    },
  );
  return (
    <Container className="grid max-w-4xl! grid-cols-1 gap-6 py-8 sm:py-12">
      <Link
        className="inline-flex min-h-11 items-center justify-self-start text-accent underline"
        to="/talent"
      >
        Back to the directory
      </Link>
      {query.isPending && (
        <div role="status">
          <span className="sr-only">Loading talent profile</span>
          <Skeleton className="min-h-56" />
        </div>
      )}
      {query.isError &&
        (query.error.status === 404 || query.error.status === 400 ? (
          <SectionHeading as="h1">Talent profile unavailable</SectionHeading>
        ) : (
          <ErrorState
            title="Could not load the profile"
            description={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ))}
      {profile && (
        <>
          {profile.coverImage && (
            <TalentImage image={profile.coverImage} cover />
          )}
          <header className="flex min-w-0 flex-col items-start gap-5 wrap-anywhere sm:flex-row sm:items-center">
            <TalentImage image={profile.profileImage} />
            <div className="grid min-w-0 gap-3">
              <SectionHeading as="h1" description={profile.introduction}>
                {profile.displayName}
              </SectionHeading>
              <div className="flex flex-wrap gap-x-4">
                {[
                  ['movies', profile.movieAppearances?.length],
                  ['short-films', profile.filmography?.length],
                  [
                    'podcast-guests',
                    profile.podcastAppearances?.some((episode) =>
                      episode.roles?.includes('guest'),
                    ),
                  ],
                ]
                  .filter(([, available]) => available)
                  .map(([key]) => (
                    <Link
                      key={key}
                      to={'/talent?category=' + key}
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline"
                    >
                      {talentCategories[key]}
                    </Link>
                  ))}
              </div>
              <div>
                <FollowAction profile={profile} />
              </div>
            </div>
          </header>
          <ProfileContent profile={profile} />
          <Related module="talent" id={profile.id} />
          <section className="grid gap-2">
            <h2 className="text-xl font-semibold">Filmography</h2>
            {profile.filmography?.length ? (
              <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
                {profile.filmography.map((film) => (
                  <Card
                    as="li"
                    key={film.id}
                    className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-start gap-3 wrap-anywhere"
                  >
                    <FilmImage image={film.poster} sizes="64px" />
                    <div>
                      <Link
                        to={filmPath(film)}
                        className="inline-flex min-h-11 items-center font-semibold text-accent underline"
                      >
                        {film.title}
                      </Link>
                      <p className="text-sm text-muted">
                        {film.releaseYear} ? {filmLabels[film.classification]}
                      </p>
                      <p className="text-sm">
                        {film.credits
                          .map(({ role, character }) =>
                            [professions[role], character]
                              .filter(Boolean)
                              .join(' ? '),
                          )
                          .join(', ')}
                      </p>
                    </div>
                  </Card>
                ))}
              </ul>
            ) : (
              <p className="text-muted">
                No published film credits are listed.
              </p>
            )}
          </section>
          {!!profile.movieAppearances?.length && (
            <section className="grid gap-2">
              <h2 className="text-xl font-semibold">Movie credits</h2>
              <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
                {profile.movieAppearances.map((item) => (
                  <Card as="li" key={item.id} className="min-w-0 wrap-anywhere">
                    <Link
                      to={item.path}
                      className="inline-flex min-h-11 items-center font-semibold text-accent underline"
                    >
                      {item.title}
                    </Link>
                    {item.poster && (
                      <div className="max-w-24">
                        <FilmImage image={item.poster} sizes="96px" />
                      </div>
                    )}
                    {item.releaseYear && (
                      <p className="text-sm text-muted">{item.releaseYear}</p>
                    )}
                    <p className="text-sm">
                      {item.credits
                        .map(({ role, character }) =>
                          [professions[role], character]
                            .filter(Boolean)
                            .join(' ? '),
                        )
                        .join(', ')}
                    </p>
                  </Card>
                ))}
              </ul>
            </section>
          )}
          <section className="grid gap-2">
            <h2 className="text-xl font-semibold">Podcast appearances</h2>
            {profile.podcastAppearances?.length ? (
              <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
                {profile.podcastAppearances.map((entry) => (
                  <Card
                    as="li"
                    key={entry.id}
                    className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] items-start gap-3 wrap-anywhere"
                  >
                    <FilmImage image={entry.thumbnail} landscape sizes="80px" />
                    <div>
                      <Link
                        to={'/podcasts/' + entry.slug}
                        className="inline-flex min-h-11 items-center font-semibold text-accent underline"
                      >
                        {entry.title}
                      </Link>
                      <p className="text-sm text-muted">
                        {entry.show.name} · Episode {entry.number}
                      </p>
                      <p className="text-sm">
                        {entry.roles
                          .map((role) => participantRoles[role])
                          .join(', ')}{' '}
                        · {new Date(entry.releaseAt).toLocaleDateString()}
                      </p>
                    </div>
                  </Card>
                ))}
              </ul>
            ) : (
              <p className="text-muted">
                No published podcast appearances are listed.
              </p>
            )}
          </section>
          <Link
            className={buttonClasses('outline', 'justify-self-start')}
            to={
              '/submissions/new?' +
              new URLSearchParams({
                category: 'talent',
                target: profile.id,
                slug: profile.slug,
              })
            }
          >
            Suggest a correction
          </Link>
        </>
      )}
    </Container>
  );
}
