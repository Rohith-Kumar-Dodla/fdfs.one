import { useState } from 'react';
import { Link } from 'react-router';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { FilterDrawer } from '../public-ui/Catalogue.jsx';
import { control } from '../admin/common.jsx';
import { useRead, useReviewAction } from './client.js';
import { PageMore, QueryContent } from './common.jsx';
import { requestStatuses } from './MovieRequests.jsx';

function RequestCard({ row }) {
  const [search, setSearch] = useState(row.title.slice(0, 80));
  const [q, setQ] = useState(search);
  const [movie, setMovie] = useState('');
  const [action, setAction] = useState('approve');
  const review = useReviewAction();
  const matches = useRead('/movies', {
    params: { q, limit: 12 },
    enabled: row.open && action === 'approve' && q.length >= 2,
  });
  return (
    <Card as="article" className="grid min-w-0 gap-3">
      <h2 className="text-lg font-semibold wrap-anywhere">
        {row.title}
        {row.year ? ' (' + row.year + ')' : ''}
      </h2>
      <p className="text-sm text-accent">{requestStatuses[row.status]}</p>
      {row.details && <p className="text-sm wrap-anywhere">{row.details}</p>}
      {row.rating && (
        <p className="text-sm">
          {row.rating} / 5{row.spoiler && ' · Includes spoilers'}
        </p>
      )}
      {row.body && (
        <p className="text-sm whitespace-pre-wrap wrap-anywhere">{row.body}</p>
      )}
      {row.message && <p className="text-sm wrap-anywhere">{row.message}</p>}
      {row.movieSlug && (
        <Link
          to={'/movies/' + row.movieSlug}
          className="text-sm text-accent underline"
        >
          Open associated catalogue title
        </Link>
      )}
      {row.open && (
        <>
          <label className="grid gap-1 text-sm">
            Decision
            <select
              className={control}
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                review.reset();
              }}
            >
              <option value="approve">Associate with a published movie</option>
              <option value="clarify">Request clarification</option>
              <option value="reject">Reject</option>
            </select>
          </label>
          {action === 'approve' && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setMovie('');
                setQ(search.trim());
              }}
            >
              <label className="grid min-w-0 flex-1 gap-1 text-sm">
                Search catalogue
                <input
                  className={control}
                  maxLength={80}
                  minLength={2}
                  required
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <Button type="submit" variant="outline">
                Search
              </Button>
              <Link to="/admin/movies/new" className={buttonClasses('outline')}>
                Add Movie
              </Link>
            </form>
          )}
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              if (action === 'approve' && !movie) return;
              review.mutate({
                url: '/admin/movie-requests/' + row.id + '/resolve',
                method: 'post',
                data: {
                  action,
                  revision: row.revision,
                  ...(action === 'approve'
                    ? { movie }
                    : { message: form.get('message').trim() }),
                },
              });
            }}
          >
            {action === 'approve' ? (
              q.length >= 2 && (
                <QueryContent query={matches}>
                  {(rows) =>
                    rows.length ? (
                      <fieldset className="grid gap-2">
                        <legend className="mb-2 text-sm font-semibold">
                          Matching published movies
                        </legend>
                        {rows.map((item) => (
                          <label
                            key={item.id}
                            className="flex items-center gap-3 rounded-control border border-line p-2 text-sm"
                          >
                            <input
                              type="radio"
                              name="movie"
                              required
                              checked={movie === item.slug}
                              onChange={() => setMovie(item.slug)}
                            />
                            <div className="w-9 shrink-0">
                              <FilmImage image={item.poster} sizes="36px" />
                            </div>
                            <span className="min-w-0 wrap-anywhere">
                              {item.title}{' '}
                              {item.releaseYear && '(' + item.releaseYear + ')'}
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    ) : (
                      <p className="text-sm text-muted">
                        No published matches. Search another title or add and
                        publish a verified catalogue record.
                      </p>
                    )
                  }
                </QueryContent>
              )
            ) : (
              <label className="grid gap-1 text-sm">
                Message to reviewer
                <textarea
                  className={control}
                  key={action}
                  name="message"
                  required
                  minLength={3}
                  maxLength={500}
                />
              </label>
            )}
            {review.isError && (
              <p role="alert" className="text-sm text-danger-text">
                {review.error.message}
              </p>
            )}
            <Button
              className="w-fit"
              type="submit"
              disabled={action === 'approve' && !movie}
              loading={review.isPending}
            >
              {action === 'approve'
                ? 'Approve and associate'
                : action === 'clarify'
                  ? 'Request clarification'
                  : 'Reject request'}
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}

export function MovieRequestsAdmin() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const query = useRead('/admin/movie-requests', {
    privateRead: true,
    params: { status: status || undefined, page, limit: 8 },
  });
  return (
    <>
      <SectionHeading as="h1">Movie Requests</SectionHeading>
      <div>
        <FilterDrawer
          fields={[
            {
              key: 'status',
              label: 'Request status',
              options: Object.entries(requestStatuses),
            },
          ]}
          values={status ? { status } : {}}
          apply={(values) => {
            setStatus(values.status ?? '');
            setPage(1);
          }}
        />
      </div>
      <QueryContent query={query}>
        {(rows, pagination) => (
          <>
            <div className="grid gap-3 xl:grid-cols-2">
              {rows.map((row) => (
                <RequestCard key={row.id + ':' + row.revision} row={row} />
              ))}
            </div>
            {rows.length === 0 && (
              <p role="status">No movie requests match this status.</p>
            )}
            <PageMore page={page} pagination={pagination} change={setPage} />
          </>
        )}
      </QueryContent>
    </>
  );
}
