import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Film, Search, Star } from 'lucide-react';
import { genres, languages, filmPath } from '../../../../shared/films.js';
import { professions } from '../../../../shared/talent.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Badge, Container } from '../../components/ui/surfaces.jsx';
import { EmptyState } from '../../components/ui/states.jsx';
import { control } from '../admin/common.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { YouTubePlayer } from '../media/YouTubePlayer.jsx';
import { usePageMetadata } from '../../hooks/use-page-metadata.js';
import { kinds, useParticipation, useRead } from './client.js';
import {
  field,
  linkText,
  PageMore,
  panel,
  QueryContent,
  RatingText,
  ReviewShell,
} from './common.jsx';
import {
  ReviewCards,
  ReviewRatingOptions,
  TargetCommunity,
} from './Community.jsx';

const allGenres = { ...genres, ...reviewGenres };
const sortOptions = [
  ['release', 'Recently released'],
  ['published', 'Recently added'],
  ['rating', 'Top-rated'],
  ['popular', 'Most popular'],
  ['title', 'Title A–Z'],
];
const feedSort = [
  ['recent', 'Recent'],
  ['trending', 'Trending'],
  ['liked', 'Most liked'],
];
const cardGrid =
  'grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5';
const movieFilters = ['q', 'genre', 'language', 'year', 'sort', 'page'];
const safePage = (value) =>
  /^\d+$/.test(value ?? '') ? Math.max(1, Math.min(Number(value), 10000)) : 1;
const chosen = (set, value) => (Object.hasOwn(set, value) ? value : undefined);
const facts = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

function useFilters(allowed) {
  const [params, setParams] = useSearchParams();
  function change(updates, replace = false) {
    setParams(
      (current) => {
        const next = new URLSearchParams(
          [...current].filter(([name]) => allowed.includes(name)),
        );
        if (!Object.hasOwn(updates, 'page')) next.delete('page');
        for (const [name, value] of Object.entries(updates)) {
          if (value && !(name === 'page' && value === 1))
            next.set(name, String(value));
          else next.delete(name);
        }
        return next;
      },
      { replace, preventScrollReset: true },
    );
  }
  return {
    params,
    change,
    clear: () => setParams({}, { preventScrollReset: true }),
  };
}
function Options({ items }) {
  return items.map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}
function Filter({ title, value, change, options, empty = 'Any' }) {
  return (
    <label className={field}>
      {title}
      <select
        className={control}
        value={value ?? ''}
        onChange={(event) => change(event.target.value)}
      >
        {empty && <option value="">{empty}</option>}
        <Options items={options} />
      </select>
    </label>
  );
}
function MovieSearch({ initial = '', commit, debounce = false }) {
  const [search, setSearch] = useState(initial);
  const callback = useRef(commit);
  const timer = useRef(null);
  useEffect(() => {
    callback.current = commit;
  }, [commit]);
  useEffect(() => {
    setSearch(initial);
  }, [initial]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function update(text) {
    setSearch(text);
    if (debounce) {
      clearTimeout(timer.current);
      timer.current = setTimeout(
        () => callback.current(text.trim(), true),
        300,
      );
    }
  }
  return (
    <form
      role="search"
      className="flex min-w-0 flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        commit(search.trim());
      }}
    >
      <label className={field + ' flex-1 basis-40'}>
        Search movies
        <input
          name="q"
          type="search"
          className={control}
          value={search}
          maxLength={80}
          onChange={(event) => update(event.target.value)}
          placeholder="Enter a movie title"
        />
      </label>
      <Button type="submit" variant="outline">
        <Search aria-hidden="true" className="size-4" />
        Search
      </Button>
    </form>
  );
}
export function TitleCard({ row }) {
  const type =
    row.classification === 'independent'
      ? 'cinema'
      : row.classification === 'original'
        ? 'original'
        : 'movie';
  const path =
    type === 'movie' ? (row.path ?? '/movies/' + row.slug) : filmPath(row);
  return (
    <article className="grid min-w-0 overflow-hidden rounded-panel border border-line bg-surface">
      <Link
        className="group grid min-w-0 content-start gap-2 rounded-panel focus-visible:ring-2 focus-visible:ring-accent"
        to={path}
      >
        <FilmImage image={row.poster} />
        <div className="grid min-w-0 gap-1 px-3 pb-3 wrap-anywhere">
          <p className="text-xs text-muted">
            {[kinds[type], row.releaseYear, languages[row.language]]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <h3 className="font-semibold leading-tight group-hover:text-accent group-hover:underline">
            {row.title}
          </h3>
          <RatingText rating={row.rating} />
        </div>
      </Link>
    </article>
  );
}
function TitleGrid({ rows }) {
  return (
    <div className={cardGrid}>
      {rows.map((row) => (
        <TitleCard row={row} key={row.id} />
      ))}
    </div>
  );
}
function MovieShelf({ title, sort }) {
  const query = useRead('/movies', { params: { sort, shelf: sort, limit: 5 } });
  return (
    <section className="grid min-w-0 gap-3" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Link className={linkText} to={'/reviews/movies?sort=' + sort}>
          Browse movies
        </Link>
      </div>
      <QueryContent query={query} empty="No movies in this section yet">
        {(rows) => <TitleGrid rows={rows} />}
      </QueryContent>
    </section>
  );
}
function FeedShelf({ sort, title }) {
  const query = useRead('/reviews/feed', { params: { sort, limit: 3 } });
  const access = useParticipation();
  return (
    <section className="grid min-w-0 gap-3" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Link className={linkText} to={'/reviews/community?sort=' + sort}>
          Browse community
        </Link>
      </div>
      <QueryContent query={query} empty="No reviews to show yet">
        {(rows) => <ReviewCards rows={rows} access={access} />}
      </QueryContent>
    </section>
  );
}
function ShortShelf() {
  const query = useRead('/films', {
    params: { availability: 'released', ratings: 'true', limit: 5 },
  });
  return (
    <section className="grid min-w-0 gap-3" aria-label="Short films">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Cinema and Originals</h2>
        <Link to="/reviews/short-films" className={linkText}>
          Browse short films
        </Link>
      </div>
      <QueryContent query={query} empty="No released short films yet">
        {(rows) => <TitleGrid rows={rows} />}
      </QueryContent>
    </section>
  );
}
export function ReviewsLanding() {
  const navigate = useNavigate();
  return (
    <ReviewShell
      title="FDFS Reviews"
      description="Discover movies and short films, rate what you have watched, and join the discussion."
    >
      <div className="grid min-w-0 gap-4 rounded-panel border border-line bg-linear-to-br from-surface to-nav p-5 sm:p-7">
        <div className="flex min-w-0 items-center gap-3">
          <Search className="size-5 text-accent" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Find a movie</h2>
        </div>
        <MovieSearch
          commit={(q) =>
            navigate(
              '/reviews/movies' + (q ? '?' + new URLSearchParams({ q }) : ''),
            )
          }
        />
      </div>
      <MovieShelf sort="popular" title="Popular movies" />
      <MovieShelf sort="release" title="Recent releases" />
      <MovieShelf sort="rating" title="Top-rated movies" />
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <FeedShelf sort="trending" title="Trending reviews" />
        <FeedShelf sort="recent" title="Recent reviews" />
      </div>
      <ShortShelf />
    </ReviewShell>
  );
}
function MovieFilters({ query, change, clear }) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Filter
        title="Genre"
        value={query.genre}
        change={(v) => change({ genre: v })}
        options={Object.entries(allGenres)}
      />
      <Filter
        title="Language"
        value={query.language}
        change={(v) => change({ language: v })}
        options={Object.entries(languages)}
      />
      <label className={field}>
        Release year
        <input
          type="number"
          name="year"
          className={control}
          min={1888}
          max={2100}
          defaultValue={query.year ?? ''}
          key={query.year ?? 'all'}
          onBlur={(event) => {
            const val = event.target.value;
            if (
              event.target.checkValidity() &&
              val !== String(query.year ?? '')
            )
              change({ year: val });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.target.blur();
          }}
        />
      </label>
      <Filter
        title="Sort movies"
        empty={null}
        value={query.sort}
        change={(v) => change({ sort: v })}
        options={sortOptions}
      />
      <Button variant="outline" className="justify-self-start" onClick={clear}>
        Clear filters
      </Button>
    </div>
  );
}
export function MoviesCatalogue() {
  const { params, change, clear } = useFilters(movieFilters);
  const [open, setOpen] = useState(false);
  const rawYear = Number(params.get('year'));
  const query = {
    q: params.get('q')?.trim().slice(0, 80) || undefined,
    genre: chosen(allGenres, params.get('genre')),
    language: chosen(languages, params.get('language')),
    year:
      Number.isInteger(rawYear) && rawYear >= 1888 && rawYear <= 2100
        ? rawYear
        : undefined,
    sort: sortOptions.some(([code]) => code === params.get('sort'))
      ? params.get('sort')
      : 'release',
    page: safePage(params.get('page')),
    limit: 20,
  };
  const movies = useRead('/movies', { params: query });
  return (
    <ReviewShell
      title="Movie catalogue"
      description="Browse mainstream movies and community ratings."
    >
      <div className={panel}>
        <MovieSearch
          initial={query.q ?? ''}
          commit={(q, replace) => change({ q }, replace)}
          debounce
        />
        <div className="hidden sm:block">
          <MovieFilters query={query} change={change} clear={clear} />
        </div>
        <div className="sm:hidden">
          <Button
            variant="outline"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            Filters and sort
          </Button>
        </div>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Filter movies"
        >
          {open && (
            <div className="grid gap-4">
              <MovieFilters query={query} change={change} clear={clear} />
              <Button onClick={() => setOpen(false)}>Show results</Button>
            </div>
          )}
        </Dialog>
      </div>
      <QueryContent query={movies}>
        {(rows, paging) => (
          <>
            <p role="status" className="text-sm text-muted">
              {paging.total} {paging.total === 1 ? 'movie' : 'movies'}
            </p>
            {rows.length ? (
              <TitleGrid rows={rows} />
            ) : (
              <EmptyState title="No movies match these filters">
                <Button variant="outline" onClick={clear}>
                  Reset search
                </Button>
              </EmptyState>
            )}
            <PageMore
              pagination={paging}
              onChange={(page) => change({ page })}
            />
          </>
        )}
      </QueryContent>
    </ReviewShell>
  );
}
export function ShortFilmDiscovery() {
  const { params, change } = useFilters(['classification', 'page']);
  const classification = ['independent', 'original'].includes(
    params.get('classification'),
  )
    ? params.get('classification')
    : undefined;
  const list = useRead('/films', {
    params: {
      classification,
      availability: 'released',
      ratings: 'true',
      page: safePage(params.get('page')),
      limit: 15,
    },
  });
  return (
    <ReviewShell
      title="Short films"
      description="Discover released Cinema and FDFS Originals titles."
    >
      <div className={panel + ' max-w-md'}>
        <Filter
          title="Short-film collection"
          value={classification}
          change={(v) => change({ classification: v })}
          options={[
            ['independent', 'Cinema'],
            ['original', 'FDFS Originals'],
          ]}
          empty="All short films"
        />
      </div>
      <QueryContent query={list}>
        {(rows, paging) => (
          <>
            {rows.length ? (
              <TitleGrid rows={rows} />
            ) : (
              <EmptyState title="No released titles in this collection" />
            )}
            <PageMore
              pagination={paging}
              onChange={(page) => change({ page })}
            />
          </>
        )}
      </QueryContent>
    </ReviewShell>
  );
}
export function CommunityFeed() {
  const { params, change } = useFilters(['type', 'sort', 'rating', 'page']);
  const access = useParticipation();
  const type = chosen(kinds, params.get('type'));
  const sort = feedSort.some(([value]) => value === params.get('sort'))
    ? params.get('sort')
    : 'recent';
  const raw = Number(params.get('rating'));
  const rating =
    raw >= 0.5 && raw <= 5 && Number.isInteger(raw * 2) ? raw : undefined;
  const query = useRead('/reviews/feed', {
    params: {
      type,
      sort,
      rating,
      page: safePage(params.get('page')),
      limit: 12,
    },
  });
  return (
    <ReviewShell
      title="Community reviews"
      description="Read what the FDFS community is watching and discussing."
    >
      <div className={panel + ' sm:grid-cols-3'}>
        <Filter
          title="Content type"
          value={type}
          change={(v) => change({ type: v })}
          options={Object.entries(kinds)}
        />
        <Filter
          title="Sort reviews"
          value={sort}
          change={(v) => change({ sort: v })}
          options={feedSort}
          empty={null}
        />
        <label className={field}>
          Review rating
          <select
            value={rating ?? ''}
            onChange={(event) => change({ rating: event.target.value })}
            className={control}
          >
            <option value="">Any rating</option>
            <ReviewRatingOptions />
          </select>
        </label>
      </div>
      <QueryContent query={query}>
        {(rows, paging) => (
          <>
            {rows.length ? (
              <ReviewCards rows={rows} access={access} />
            ) : (
              <EmptyState title="No reviews match these filters" />
            )}
            <PageMore
              pagination={paging}
              onChange={(page) => change({ page })}
            />
          </>
        )}
      </QueryContent>
    </ReviewShell>
  );
}
function Facts({ movie }) {
  const rows = [
    ['Original title', movie.originalTitle],
    [
      'Release',
      movie.releaseDate
        ? facts.format(new Date(movie.releaseDate))
        : movie.releaseYear,
    ],
    ['Runtime', movie.runtimeMinutes && movie.runtimeMinutes + ' min'],
    [
      'Genres',
      movie.genres
        ?.map((value) => allGenres[value])
        .filter(Boolean)
        .join(', '),
    ],
    ['Original language', languages[movie.language]],
    [
      'Available languages',
      movie.languages
        ?.map((key) => languages[key])
        .filter(Boolean)
        .join(', '),
    ],
    ['Countries', movie.countries?.join(', ')],
    ['Production companies', movie.companies?.join(', ')],
    ['Content advisory', movie.advisory],
  ].filter(([, value]) => value);
  if (!rows.length)
    return (
      <p className="text-sm text-muted">
        Additional movie details are unavailable.
      </p>
    );
  return (
    <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
      {rows.map(([key, value]) => (
        <div
          className="min-w-0 rounded-control border border-line p-3 wrap-anywhere"
          key={key}
        >
          <dt className="text-sm text-muted">{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
const externalLink = { target: '_blank', rel: 'noopener noreferrer' };
function MovieContent({ movie }) {
  return (
    <>
      {movie.backdrop && <FilmImage image={movie.backdrop} landscape eager />}
      <header className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:items-center">
        <div className="w-32 sm:w-full">
          <FilmImage image={movie.poster} eager sizes="160px" />
        </div>
        <div className="grid min-w-0 content-start gap-3 wrap-anywhere">
          <div>
            <Badge>Movie</Badge>
          </div>
          <h1 className="text-3xl font-semibold sm:text-5xl">{movie.title}</h1>
          {movie.synopsis && (
            <p className="text-lg text-muted">{movie.synopsis}</p>
          )}
          <RatingText rating={movie.rating} />
        </div>
      </header>
      <section className="grid min-w-0 gap-3">
        <h2 className="text-xl font-semibold">About the movie</h2>
        {movie.description && (
          <p className="whitespace-pre-wrap wrap-anywhere">
            {movie.description}
          </p>
        )}
        <Facts movie={movie} />
      </section>
      {movie.trailer && (
        <section className="grid min-w-0 gap-3">
          <h2 className="text-xl font-semibold">
            <Film
              aria-hidden="true"
              className="mr-2 inline size-5 text-accent"
            />
            Official trailer
          </h2>
          <YouTubePlayer
            video={movie.trailer}
            title={movie.title + ' official trailer'}
          />
        </section>
      )}
      {movie.credits?.length > 0 && (
        <section className="grid min-w-0 gap-3">
          <h2 className="text-xl font-semibold">Cast and crew</h2>
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {movie.credits.map(
              ({ personalityId, name, slug, role, character, department }) => (
                <li
                  className={panel + ' gap-1!'}
                  key={[personalityId, role, character].join(':')}
                >
                  <Link to={'/talent/' + slug} className={linkText}>
                    {name}
                  </Link>
                  <p className="text-sm text-muted wrap-anywhere">
                    {[professions[role], character, department]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ),
            )}
          </ul>
        </section>
      )}
      {movie.gallery?.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-semibold">Gallery</h2>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            {movie.gallery.map((image) => (
              <FilmImage
                key={image.id ?? image.url}
                image={image}
                landscape
                sizes="45vw"
              />
            ))}
          </div>
        </section>
      )}
      {movie.awards?.length > 0 && (
        <section className="grid gap-3 wrap-anywhere">
          <h2 className="text-xl font-semibold">Awards and achievements</h2>
          <ul className="grid gap-2">
            {movie.awards.map(({ title, organization, year, source }, i) => (
              <li key={i}>
                {[title, organization, year].filter(Boolean).join(' · ')}
                {source && (
                  <>
                    <br />
                    <a href={source} className={linkText} {...externalLink}>
                      Source for {title}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {movie.links?.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold">Official links</h2>
          <ul>
            {movie.links.map(({ url, label }, i) => (
              <li key={i}>
                <a href={url} className={linkText} {...externalLink}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {movie.metadata && (
        <div className="text-sm text-muted wrap-anywhere">
          <p>Metadata: {movie.metadata.attribution}</p>
          {movie.metadata.rating && (
            <p>
              <Star aria-hidden="true" className="mr-1 inline size-4" />
              External rating: {movie.metadata.rating.value} /{' '}
              {movie.metadata.rating.scale}
            </p>
          )}
        </div>
      )}
      <TargetCommunity
        key={movie.slug}
        target={{
          type: 'movie',
          slug: movie.slug,
          title: movie.title,
          path: movie.path,
        }}
      />
    </>
  );
}
export function MovieDetail() {
  const { slug } = useParams();
  const query = useRead('/movies/' + encodeURIComponent(slug));
  const movie = query.data?.data;
  usePageMetadata(
    movie && {
      title: movie.title + ' | FDFS Reviews',
      description:
        movie.synopsis ??
        'Movie details and community reviews for ' + movie.title + '.',
      path: movie.path,
    },
  );
  return (
    <Container className="grid min-w-0 gap-6 py-8" aria-label="Movie details">
      <Link to="/reviews/movies" className={linkText}>
        Back to movie catalogue
      </Link>
      <QueryContent query={query} missing="Movie unavailable">
        {(row) => <MovieContent movie={row} />}
      </QueryContent>
    </Container>
  );
}
