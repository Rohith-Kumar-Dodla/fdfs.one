import { useEffect, useState } from 'react';
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
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { TextInput, Select } from '../../components/ui/fields.jsx';
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
import { YouTubePlayer } from '../media/YouTubePlayer.jsx';
import { FilmImage } from './FilmImage.jsx';

const moduleCopy = {
  independent:
    'Discover independent short films by emerging and established filmmakers.',
  original:
    'Explore films produced by FDFS, including released titles and announced productions.',
};
const options = {
  genre: Object.entries(genres),
  language: Object.entries(languages),
  availability: [
    ['released', 'Released'],
    ['upcoming', 'Upcoming'],
  ],
  sort: [
    ['newest', 'Release date'],
    ['title', 'Title A–Z'],
    ['-title', 'Title Z–A'],
    ['year', 'Release year'],
  ],
};

function Filter({ label, name, value, change, placeholder, choices }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      {label}
      <Select
        value={value}
        onChange={(event) => change(name, event.target.value)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {choices.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </Select>
    </label>
  );
}

function FilmSearch({ base, change }) {
  const [input, setInput] = useState({ base, value: base });
  const value = input.base === base ? input.value : base;
  useEffect(() => {
    const next = value.trim();
    if (next === base) return;
    const timer = setTimeout(() => change('q', next, { replace: true }), 350);
    return () => clearTimeout(timer);
  }, [base, value, change]);
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      Search by title
      <TextInput
        type="search"
        maxLength={80}
        value={value}
        onChange={(event) => setInput({ base, value: event.target.value })}
      />
    </label>
  );
}

function FilmCard({ film }) {
  return (
    <Card
      as="article"
      className="grid min-w-0 content-start gap-2 p-3! wrap-anywhere sm:p-4!"
    >
      <FilmImage image={film.poster} />
      <h2 className="text-base font-semibold sm:text-lg">
        <Link
          className="flex min-h-11 items-center text-accent underline"
          to={filmPath(film)}
        >
          {film.title}
        </Link>
      </h2>
      <p className="text-sm text-muted">
        {film.genres.map((key) => genres[key]).join(', ')}
      </p>
      <p className="text-sm text-muted">
        {languages[film.language]} · {film.runtimeMinutes} min ·{' '}
        {film.releaseYear}
      </p>
      {film.availability === 'upcoming' && (
        <p className="text-sm text-muted">
          Upcoming{film.hasTrailer ? ' · Trailer available' : ''}
        </p>
      )}
    </Card>
  );
}

export function FilmDirectory({ classification }) {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim().slice(0, 80);
  const read = (key, fallback = '') =>
    options[key].some(([value]) => value === params.get(key))
      ? params.get(key)
      : fallback;
  const pageValue = Number(params.get('page'));
  const page =
    Number.isInteger(pageValue) && pageValue > 0 && pageValue <= 10000
      ? pageValue
      : 1;
  const year = Number(params.get('year'));
  const filter = {
    genre: read('genre'),
    language: read('language'),
    availability: read('availability'),
    sort: read('sort', 'newest'),
    year:
      Number.isInteger(year) && year >= 1888 && year <= 2100
        ? String(year)
        : '',
  };
  function change(key, value, opts) {
    const next = new URLSearchParams(params);
    if (value && !(key === 'page' && value === '1')) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, opts);
  }
  const request = {
    classification,
    page,
    limit: 12,
    ...Object.fromEntries(
      Object.entries({ q, ...filter }).filter(([, value]) => value),
    ),
  };
  const listing = useQuery({
    queryKey: ['films', request],
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient.get('/films', { params: request, signal }),
  });
  const title = filmLabels[classification];
  return (
    <Container className="grid min-w-0 gap-6 py-8 sm:py-12">
      <div
        className={
          classification === 'original' ? 'border-l-2 border-accent pl-4' : ''
        }
      >
        <SectionHeading as="h1" description={moduleCopy[classification]}>
          {title}
        </SectionHeading>
      </div>
      {classification === 'independent' && (
        <Link
          className={buttonClasses('outline', 'justify-self-start')}
          to="/creator/films"
        >
          Creator film workspace
        </Link>
      )}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FilmSearch base={q} change={change} />
        <Filter
          label="Genre"
          name="genre"
          value={filter.genre}
          change={change}
          placeholder="All genres"
          choices={options.genre}
        />
        <Filter
          label="Language"
          name="language"
          value={filter.language}
          change={change}
          placeholder="All languages"
          choices={options.language}
        />
        <form
          className="flex min-w-0 items-end gap-2"
          key={filter.year}
          onSubmit={(event) => {
            event.preventDefault();
            change('year', new FormData(event.currentTarget).get('year'));
          }}
        >
          <label className="grid min-w-0 flex-1 gap-1 text-sm">
            Release year
            <TextInput
              name="year"
              type="number"
              min={1888}
              max={2100}
              defaultValue={filter.year}
            />
          </label>
          <Button type="submit" variant="outline">
            Apply year
          </Button>
        </form>
        <Filter
          label="Release availability"
          name="availability"
          value={filter.availability}
          change={change}
          placeholder="Released and upcoming"
          choices={options.availability}
        />
        <Filter
          label="Sort by"
          name="sort"
          value={filter.sort}
          change={change}
          choices={options.sort}
        />
      </div>
      {listing.isPending && (
        <div
          role="status"
          className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
        >
          <span className="sr-only">Loading films</span>
          {[0, 1, 2, 3].map((key) => (
            <Skeleton className="aspect-[2/3]" key={key} />
          ))}
        </div>
      )}
      {listing.isError && (
        <ErrorState
          title="Could not load films"
          description={listing.error.message}
          onRetry={() => void listing.refetch()}
        />
      )}
      {listing.data && (
        <>
          {listing.data.data.length ? (
            <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {listing.data.data.map((film) => (
                <FilmCard key={film.id} film={film} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                q || filter.genre || filter.language || filter.year || page > 1
                  ? 'No films match these filters'
                  : filter.availability === 'upcoming'
                    ? 'No upcoming films announced'
                    : 'No films published yet'
              }
            />
          )}
          <Pagination
            page={page}
            totalPages={listing.data.pagination.totalPages}
            onPageChange={(value) => change('page', String(value))}
          />
          {page > 1 && !listing.data.data.length && (
            <div>
              <Button variant="outline" onClick={() => change('page', '1')}>
                Return to first page
              </Button>
            </div>
          )}
        </>
      )}
    </Container>
  );
}

export function VideoSection({ film }) {
  const [selected, setSelected] = useState(null);
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
    ...(film.extras ?? []).map(({ title, video, thumbnail }, index) => ({
      key: 'extra-' + index,
      label: 'Watch ' + title,
      title,
      video,
      thumbnail,
    })),
  ];
  if (!choices.length) return null;
  const active = choices.find(({ key }) => key === selected);
  return (
    <section className="grid min-w-0 gap-3" aria-labelledby="film-playback">
      <h2 id="film-playback" className="text-xl font-semibold">
        {film.availability === 'upcoming' ? 'Trailer' : 'Playback'}
      </h2>
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
      {active && (
        <YouTubePlayer
          key={active.key}
          video={active.video}
          title={active.title}
        />
      )}
    </section>
  );
}

function FilmDetailContent({ film }) {
  return (
    <>
      {film.banner && <FilmImage image={film.banner} landscape eager />}
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
      <VideoSection key={film.id} film={film} />
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
    film && {
      title: film.title + ' | ' + filmLabels[classification],
      description: film.synopsis,
      path: filmPath(film),
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
