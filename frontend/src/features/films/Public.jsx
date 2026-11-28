import { YouTubePlayer } from '../media/YouTubePlayer.jsx';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  filmLabels,
  filmPath,
  filmPaths,
  genres,
  languages,
} from '../../../../shared/films.js';
import { professions } from '../../../../shared/talent.js';
import { apiClient } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import {
  Badge,
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import { ErrorState, Skeleton } from '../../components/ui/states.jsx';
import {
  unavailableMetadata,
  usePageMetadata,
} from '../../hooks/use-page-metadata.js';
import { ProgressPlayer } from '../personal/Playback.jsx';
import { SaveAction } from '../personal/Actions.jsx';
import { Related } from '../personal/Related.jsx';
import { rateApi, useRead } from '../reviews/client.js';
import { RatingText } from '../reviews/common.jsx';
import { TargetCommunity } from '../reviews/Community.jsx';
import { FilmImage } from './FilmImage.jsx';
import { PlaybackGate } from '../media/PlaybackGate.jsx';

export { FilmDirectory } from '../public-ui/Directories.jsx';

export function SupportingVideos({ extras }) {
  if (!extras?.length) return null;
  return (
    <section className="grid gap-3">
      <h2 className="text-xl font-semibold">Supporting Videos</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {extras
          .filter(({ video }) => video)
          .map(({ title, video, thumbnail }, index) => (
            <div
              key={video.providerVideoId + ':' + index}
              className="grid gap-2"
            >
              <h3 className="font-semibold">{title}</h3>
              {thumbnail && <FilmImage image={thumbnail} landscape />}
              <YouTubePlayer video={video} title={title} />
            </div>
          ))}
      </div>
    </section>
  );
}

export function VideoSection({ film }) {
  const [params] = useSearchParams();
  const [selected, setSelected] = useState(() =>
    (params.has('resume') || params.has('start')) && film.mainVideo
      ? 'main'
      : null,
  );
  const choices = [
    ...(film.mainVideo
      ? [
          {
            key: 'main',
            label: 'Watch film',
            title: film.title,
            video: film.mainVideo,
          },
        ]
      : []),
    ...(film.trailer
      ? [
          {
            key: 'trailer',
            label: 'Watch trailer',
            title: film.title + ' trailer',
            video: film.trailer,
          },
        ]
      : []),
  ];
  if (!choices.length) return null;
  const active = choices.find(({ key }) => key === selected);
  return (
    <section
      id="playback"
      tabIndex={-1}
      className="grid min-w-0 scroll-mt-24 gap-3"
      aria-labelledby="film-playback"
    >
      <h2 id="film-playback" className="text-xl font-semibold">
        {film.availability === 'upcoming' ? 'Trailer' : 'Playback'}
      </h2>
      {!active && (
        <FilmImage image={film.banner ?? film.poster} landscape eager />
      )}
      {active && (
        <ProgressPlayer
          item={
            active.key === 'main'
              ? { id: film.id, module: film.classification }
              : undefined
          }
          key={active.key}
          video={active.video}
          title={active.title}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {choices.map(({ key, label, thumbnail }) => (
          <div key={key} className="grid min-w-0 gap-2 wrap-anywhere">
            {thumbnail && (
              <div className="max-w-40">
                <FilmImage image={thumbnail} landscape sizes="160px" />
              </div>
            )}
            <Button
              variant={key === selected ? 'primary' : 'outline'}
              aria-pressed={key === selected}
              className="min-w-0 whitespace-normal"
              onClick={() => setSelected(key)}
            >
              {label}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilmDetailContent({ film }) {
  const target = {
    type: film.classification === 'independent' ? 'cinema' : 'original',
    slug: film.slug,
    title: film.title,
    path: filmPath(film),
  };
  const rating = useRead(rateApi(target), {
    enabled: film.availability === 'released',
  });
  return (
    <>
      {(film.mainVideo ||
        film.trailer ||
        film.extras?.some(({ video }) => video)) && (
        <PlaybackGate
          module={film.classification}
          slug={film.slug}
          artwork={film.banner ?? film.poster}
        >
          {({ mainVideo, trailer, extras }) => (
            <>
              <VideoSection
                key={film.id}
                film={{ ...film, mainVideo, trailer }}
              />
              <SupportingVideos extras={extras} />
            </>
          )}
        </PlaybackGate>
      )}
      <header className="flex min-w-0 flex-col items-start gap-4 wrap-anywhere sm:flex-row sm:items-center">
        <div className="w-28 shrink-0 sm:w-36">
          <FilmImage image={film.poster} eager sizes="144px" />
        </div>
        <div className="grid min-w-0 gap-3">
          <div>
            <Badge>{filmLabels[film.classification]}</Badge>
          </div>
          <SectionHeading as="h1" description={film.synopsis}>
            {film.title}
          </SectionHeading>
          <p className="text-muted">
            {film.genres.map((genre) => genres[genre]).join(', ')} ·{' '}
            {languages[film.language]} · {film.runtimeMinutes} min ·{' '}
            {film.releaseYear}
          </p>
          {film.availability === 'released' && film.releaseAt && (
            <time className="text-sm text-muted" dateTime={film.releaseAt}>
              {new Date(film.releaseAt).toLocaleDateString()}
            </time>
          )}
          {rating.data?.data?.count > 0 && (
            <RatingText rating={rating.data.data} />
          )}
          {film.availability === 'upcoming' && (
            <p className="text-accent">
              Scheduled release{' '}
              <time dateTime={film.releaseAt}>
                {new Date(film.releaseAt).toLocaleString()}
              </time>
            </p>
          )}
        </div>
      </header>
      <div>
        <SaveAction item={film} module={film.classification} />
      </div>

      {film.description && (
        <section className="grid min-w-0 gap-2 wrap-anywhere">
          <h2 className="text-xl font-semibold">About the film</h2>
          <p className="whitespace-pre-wrap">{film.description}</p>
        </section>
      )}
      {(film.productionCompany ||
        film.advisory ||
        film.subtitles.length > 0) && (
        <ul className="grid min-w-0 gap-2 text-sm text-muted wrap-anywhere">
          {film.productionCompany && (
            <li>Production · {film.productionCompany}</li>
          )}
          {film.advisory && <li>Content advisory · {film.advisory}</li>}
          {film.subtitles.length > 0 && (
            <li>
              Subtitles ·{' '}
              {film.subtitles.map((key) => languages[key]).join(', ')}
            </li>
          )}
        </ul>
      )}
      {film.credits.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-semibold">Cast and crew</h2>
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {film.credits.map((credit, index) => (
              <Card as="li" className="min-w-0 wrap-anywhere" key={index}>
                <Link
                  className="inline-flex min-h-11 items-center font-semibold text-accent underline"
                  to={'/talent/' + credit.slug}
                >
                  {credit.displayName}
                </Link>
                <p className="text-sm text-muted">
                  {[
                    professions[credit.role],
                    credit.character,
                    credit.department,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </Card>
            ))}
          </ul>
        </section>
      )}
      {film.awards.length > 0 && (
        <section className="grid min-w-0 gap-2 wrap-anywhere">
          <h2 className="text-xl font-semibold">Awards and recognitions</h2>
          <ul className="grid gap-3">
            {film.awards.map(({ title, organization, year, source }, index) => (
              <li key={index}>
                <p>{[title, organization, year].filter(Boolean).join(' · ')}</p>
                {source && (
                  <a
                    className="inline-flex min-h-11 items-center text-accent underline"
                    href={source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Source for {title}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {film.availability === 'released' && (
        <TargetCommunity key={film.id} target={target} />
      )}
      <Related module={film.classification} id={film.id} />
      {film.gallery.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-semibold">Gallery</h2>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            {film.gallery.map((image, index) => (
              <FilmImage key={index} image={image} landscape sizes="45vw" />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function FilmDetail({ classification }) {
  const { slug } = useParams();
  const query = useQuery({
    queryKey: ['films', classification, slug],
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient
        .get('/films/' + encodeURIComponent(slug), {
          params: { classification },
          signal,
        })
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
  const film = query.data;
  usePageMetadata(
    query.error?.status === 404
      ? unavailableMetadata
      : film && {
          title: film.title + ' | ' + filmLabels[classification],
          description: film.synopsis,
          path: filmPath(film),
          image: film.poster?.url,
          structured: {
            '@type': 'Movie',
            name: film.title,
            description: film.synopsis,
          },
        },
  );
  return (
    <Container className="grid max-w-5xl! grid-cols-1 gap-6 py-8 sm:py-12">
      <Link
        className="inline-flex min-h-11 items-center justify-self-start text-accent underline"
        to={filmPaths[classification]}
      >
        Back to {filmLabels[classification]}
      </Link>
      {query.isPending && (
        <div role="status">
          <span className="sr-only">Loading film</span>
          <Skeleton className="aspect-video" />
        </div>
      )}
      {query.isError &&
        (query.error.status === 404 || query.error.status === 400 ? (
          <SectionHeading as="h1">Film unavailable</SectionHeading>
        ) : (
          <ErrorState
            title="Could not load the film"
            description={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ))}
      {film && <FilmDetailContent film={film} />}
    </Container>
  );
}
