import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { PublicReviews } from '../public-ui/Reviews.jsx';
import { CatalogueCard } from '../public-ui/Catalogue.jsx';
import { Link, useParams, useSearchParams } from 'react-router';
import { Film, Star } from 'lucide-react';
import { genres, languages, filmPath } from '../../../../shared/films.js';
import { professions } from '../../../../shared/talent.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { Badge, Container } from '../../components/ui/surfaces.jsx';
import { EmptyState } from '../../components/ui/states.jsx';
import { control } from '../admin/common.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { SaveAction } from '../personal/Actions.jsx';
import { Related } from '../personal/Related.jsx';
import { YouTubePlayer } from '../media/YouTubePlayer.jsx';
import { PlaybackGate } from '../media/PlaybackGate.jsx';
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
const feedSort = [
  ['recent', 'Recent'],
  ['trending', 'Trending'],
  ['liked', 'Most liked'],
];
const cardGrid =
  'grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5';
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
    <CatalogueCard
      title={row.title}
      path={path}
      landscape={type !== 'movie'}
      image={type === 'movie' ? row.poster : (row.banner ?? row.poster)}
      metadata={[
        kinds[type],
        row.releaseYear,
        (row.genres ?? [])
          .map((genre) => allGenres[genre])
          .filter(Boolean)
          .join(', '),
      ]}
      rating={row.rating}
      save={{ ...row, module: row.classification ?? 'movies' }}
    />
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
export function ReviewsLanding() {
  return <PublicReviews />;
}
export function MoviesCatalogue() {
  return <PublicReviews catalogue />;
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
  const [showTrailer, setShowTrailer] = useState(false);
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
          <div className="flex flex-wrap items-start gap-3">
            <SaveAction item={movie} module="movies" />
            <Link to="#film-community" className={linkText}>
              Audience reviews
            </Link>
          </div>
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
        <section id="playback" tabIndex={-1} className="grid min-w-0 gap-3">
          <h2 className="text-xl font-semibold">
            <Film
              aria-hidden="true"
              className="mr-2 inline size-5 text-accent"
            />
            Official trailer
          </h2>
          <PlaybackGate
            module="movies"
            slug={movie.slug}
            artwork={movie.backdrop ?? movie.poster}
            id="trailer-access"
          >
            {({ trailer }) =>
              showTrailer ? (
                <YouTubePlayer
                  video={trailer}
                  title={movie.title + ' official trailer'}
                />
              ) : (
                <div>
                  <Button onClick={() => setShowTrailer(true)}>
                    Watch trailer
                  </Button>
                </div>
              )
            }
          </PlaybackGate>
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
      <Related module="movies" id={movie.id} />
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
        {(row) => <MovieContent key={row.id} movie={row} />}
      </QueryContent>
    </Container>
  );
}
