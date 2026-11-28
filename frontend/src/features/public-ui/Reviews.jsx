import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { PenLine, Search } from 'lucide-react';
import { genres, languages } from '../../../../shared/films.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Spinner } from '../../components/ui/states.jsx';
import { useRead } from '../reviews/client.js';
import {
  CatalogueCard,
  CatalogueHeading,
  CatalogueResults,
  FilterDrawer,
  PublicCatalogue,
  useCatalogueParams,
} from './Catalogue.jsx';
const ReviewComposer = lazy(() => import('./ReviewComposer.jsx'));

const movieGenres = { ...genres, ...reviewGenres };
const fields = [
  { key: 'genre', label: 'Genre', options: Object.entries(movieGenres) },
  { key: 'language', label: 'Language', options: Object.entries(languages) },
  { key: 'year', label: 'Release year', type: 'number', min: 1888, max: 2100 },
  {
    key: 'minimumRating',
    label: 'Minimum rating',
    options: [
      ['2', '2 stars'],
      ['3', '3 stars'],
      ['4', '4 stars'],
      ['4.5', '4.5 stars'],
    ],
  },
  {
    key: 'sort',
    label: 'Sort by',
    options: [
      ['release', 'Recently released'],
      ['published', 'Recently added'],
      ['rating', 'Top-rated'],
      ['popular', 'Most popular'],
      ['title', 'Title A–Z'],
    ],
  },
];
export function PublicReviews({ catalogue = false }) {
  const { params, values, update, page } = useCatalogueParams([
    { key: 'q', label: 'Find a Movie' },
    ...fields,
  ]);
  const query = useRead('/movies', { params: { ...values, page, limit: 24 } });
  const [input, setInput] = useState({
    base: values.q ?? '',
    text: values.q ?? '',
  });
  const q = values.q ?? '';
  const text = input.base === q ? input.text : q;
  const open = params.get('write') === '1';
  const filterValues = Object.fromEntries(
    Object.entries(values).filter(([key]) => key !== 'q'),
  );
  return (
    <PublicCatalogue>
      <CatalogueHeading
        title={catalogue ? 'Movie catalogue' : 'FDFS Reviews'}
        description="Find a movie, see what audiences thought, and share your own take."
        actions={
          <div className="hidden sm:block">
            <Button onClick={() => update({ write: '1' })}>
              <PenLine className="size-4" aria-hidden="true" />
              Write Your Review
            </Button>
          </div>
        }
      >
        <div className="sm:hidden">
          <Button onClick={() => update({ write: '1' })}>
            <PenLine className="size-4" aria-hidden="true" />
            Write Your Review
          </Button>
        </div>
        <form
          role="search"
          className="flex min-w-0 flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: text.trim() });
          }}
        >
          <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm font-semibold">
            Find a Movie
            <input
              className="min-h-11 min-w-0 rounded-control border border-control bg-surface px-3 text-sm"
              type="search"
              maxLength={80}
              value={text}
              onChange={(event) =>
                setInput({ base: q, text: event.target.value })
              }
              placeholder="Enter a movie title"
            />
          </label>
          <Button type="submit" variant="outline">
            <Search className="size-4" aria-hidden="true" />
            Find
          </Button>
          <FilterDrawer
            title="Movie filters"
            fields={fields}
            values={filterValues}
            apply={update}
          />
          {Object.keys(values).length > 0 && (
            <Button
              variant="ghost"
              onClick={() => update({}, ['q', ...fields.map((row) => row.key)])}
            >
              Reset search
            </Button>
          )}
        </form>
      </CatalogueHeading>
      <CatalogueResults
        page={page}
        onPage={(page) => update({ page })}
        query={query}
        empty="No movies have been published yet."
        filtered={Object.keys(values).length > 0}
      >
        {(row) => (
          <CatalogueCard
            key={row.id}
            title={row.title}
            path={'/movies/' + row.slug}
            image={row.poster}
            rating={row.rating}
            metadata={[
              row.releaseYear,
              (row.genres ?? [])
                .map((value) => movieGenres[value])
                .filter(Boolean)
                .join(', '),
            ]}
            save={{ ...row, module: 'movies' }}
          />
        )}
      </CatalogueResults>
      <div>
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline"
          to="/reviews/community?type=movie"
        >
          Browse movie discussions
        </Link>
      </div>
      <Dialog
        title="Write Your Review"
        open={open}
        onClose={() => update({ write: '' })}
        className="mt-auto mb-0 max-h-[92dvh] w-full max-w-2xl rounded-b-none sm:my-auto sm:rounded-panel"
      >
        {open && (
          <Suspense fallback={<Spinner label="Loading review editor" />}>
            <ReviewComposer close={() => update({ write: '' })} />
          </Suspense>
        )}
      </Dialog>
    </PublicCatalogue>
  );
}
