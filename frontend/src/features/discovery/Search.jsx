import { FilterDrawer } from '../public-ui/Catalogue.jsx';
import { SaveAction } from '../personal/Actions.jsx';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { sources } from '../../../../shared/homepage.js';
import { genres } from '../../../../shared/films.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { Button } from '../../components/ui/Button.jsx';
import { Container, SectionHeading } from '../../components/ui/surfaces.jsx';
import {
  EmptyState,
  ErrorState,
  Spinner,
} from '../../components/ui/states.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { accepted, control, field, url, useSearch } from './search-query.js';

const genreNames = { ...genres, ...reviewGenres };

function ResultRow({ item }) {
  return (
    <li className="min-w-0">
      <Link
        to={item.path}
        className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-panel border border-line bg-surface p-2 hover:border-accent/60"
      >
        <FilmImage image={item.image ?? item.landscape} square sizes="56px" />
        <div className="grid min-w-0 content-center gap-1 wrap-anywhere">
          <span className="font-semibold">{item.title}</span>
          <span className="text-sm text-muted">
            {sources[item.module]?.label}
            {item.upcoming ? ' · Upcoming' : ''}
            {item.live ? ' · Live' : ''}
          </span>
        </div>
      </Link>
      <div className="mt-1">
        <SaveAction item={item} />
      </div>
    </li>
  );
}
export function SearchResults() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q')?.trim().slice(0, 80) ?? '';
  const module = Object.hasOwn(sources, params.get('module'))
    ? params.get('module')
    : undefined;
  const genre = Object.hasOwn(genreNames, params.get('genre'))
    ? params.get('genre')
    : undefined;
  const page = Math.min(
    100,
    Math.max(1, Number.parseInt(params.get('page'), 10) || 1),
  );
  const query = useSearch(
    '/search',
    { q: accepted(q) ? q : undefined, module, genre, page, limit: 6 },
    accepted(q) || !!genre,
  );
  function filter(update) {
    setParams(
      Object.fromEntries(
        Object.entries({ q, module, genre, ...update }).filter(
          ([, value]) => value,
        ),
      ),
    );
  }
  return (
    <Container className="grid min-w-0 gap-5 py-8 sm:py-12">
      <SectionHeading as="h1">
        {genre ? genreNames[genre] + ' titles' : 'Search FDFS'}
      </SectionHeading>
      <form
        role="search"
        className="flex min-w-0 flex-wrap items-end gap-2"
        key={q}
        onSubmit={(event) => {
          event.preventDefault();
          const text = new FormData(event.currentTarget).get('q').trim();
          if (accepted(text) || genre)
            navigate(
              url({ q: accepted(text) ? text : undefined, genre, module }),
            );
        }}
      >
        <label className={field + ' flex-1 basis-44'}>
          Search titles
          <input
            name="q"
            className={control}
            type="search"
            maxLength={80}
            defaultValue={q}
          />
        </label>
        <Button type="submit">Search</Button>
      </form>
      <div>
        <FilterDrawer
          fields={[
            {
              key: 'module',
              label: 'Content type',
              options: Object.entries(sources).map(([key, item]) => [
                key,
                item.label,
              ]),
            },
            {
              key: 'genre',
              label: 'Genre',
              options: Object.entries(genreNames),
            },
          ]}
          values={{ ...(module && { module }), ...(genre && { genre }) }}
          apply={(values) => {
            const nextGenre = values.genre;
            const nextModule =
              nextGenre &&
              !['independent', 'original', 'movies'].includes(values.module)
                ? undefined
                : values.module;
            filter({ genre: nextGenre, module: nextModule });
          }}
        />
      </div>
      {!accepted(q) && !genre ? (
        <EmptyState title="Enter at least two characters to search" />
      ) : query.isPending ? (
        <Spinner label="Loading search results" />
      ) : query.isError ? (
        <ErrorState
          title="Search is unavailable"
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data.doesMatch ? (
        <EmptyState title="No matching content" />
      ) : (
        <>
          {query.data.groups
            .filter((group) => group.count > 0)
            .map((group) => (
              <section
                key={group.module}
                aria-labelledby={'search-' + group.module}
                className="grid min-w-0 gap-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2
                    id={'search-' + group.module}
                    className="text-xl font-semibold"
                  >
                    {group.label}{' '}
                    <span className="text-sm text-muted">({group.count})</span>
                  </h2>
                  {!module && group.totalPages > 1 && (
                    <Button
                      variant="outline"
                      onClick={() => filter({ module: group.module })}
                    >
                      View all {group.label}
                    </Button>
                  )}
                </div>
                <ul className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => (
                    <ResultRow key={item.id} item={item} />
                  ))}
                </ul>
                {module && (
                  <Pagination
                    page={page}
                    totalPages={Math.min(100, group.totalPages)}
                    onPageChange={(page) => filter({ page })}
                  />
                )}
              </section>
            ))}
        </>
      )}
    </Container>
  );
}
