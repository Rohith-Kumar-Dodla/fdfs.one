import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { control } from '../admin/common.jsx';
import { useRead, useReviewAction } from './client.js';
import { ConfirmDelete } from './Community.jsx';
import { PageMore, panel, QueryContent, Reveal } from './common.jsx';
import { StarInput } from './Rating.jsx';

const url = '/account/movie-requests';
export const requestStatuses = {
  pending: 'Pending Movie Verification',
  clarification: 'Clarification Requested',
  conflict: 'Existing Review or Rating',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export function MovieRequestForm({ row, done, cancel, initialTitle }) {
  const [rating, setRating] = useState(row?.rating ?? null);
  const [error, setError] = useState('');
  const change = useReviewAction();
  function submit(event) {
    event.preventDefault();
    if (rating == null) return setError('Choose a star rating.');
    setError('');
    const form = new FormData(event.currentTarget);
    change.mutate(
      {
        url: row ? url + '/' + row.id : url,
        method: row ? 'patch' : 'post',
        data: {
          title: form.get('title').trim(),
          year: Number(form.get('year')) || undefined,
          details: form.get('details').trim() || undefined,
          body: form.get('body').trim(),
          spoiler: form.has('spoiler'),
          rating,
          ...(row && { revision: row.revision }),
        },
      },
      { onSuccess: done },
    );
  }
  return (
    <form className="grid gap-3" onSubmit={submit}>
      <label className="grid gap-1 text-sm">
        Movie title
        <input
          className={control}
          name="title"
          required
          maxLength={180}
          defaultValue={row?.title ?? initialTitle}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Release year (optional)
        <input
          className={control}
          name="year"
          type="number"
          min={1888}
          max={2100}
          defaultValue={row?.year}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Language or distinguishing information (optional)
        <input
          className={control}
          name="details"
          maxLength={240}
          defaultValue={row?.details}
        />
      </label>
      <StarInput value={rating} change={setRating} />
      <label className="grid gap-1 text-sm">
        Your review
        <textarea
          className={control}
          name="body"
          rows={5}
          required
          minLength={5}
          maxLength={6000}
          defaultValue={row?.body}
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="spoiler" defaultChecked={row?.spoiler} />{' '}
        Contains spoilers
      </label>
      {(error || change.isError) && (
        <p role="alert" className="text-sm text-danger-text">
          {error || change.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={change.isPending}>
          {row ? 'Save pending review' : 'Submit for Movie Verification'}
        </Button>
        <Button variant="outline" onClick={cancel}>
          {row ? 'Close editor' : 'Back to catalogue search'}
        </Button>
      </div>
    </form>
  );
}

function OwnedMovieRequest({ row, editable }) {
  const [editing, edit] = useState(false);
  return (
    <article className={panel}>
      <h3 className="font-semibold wrap-anywhere">
        {row.title}
        {row.year ? ' (' + row.year + ')' : ''}
      </h3>
      <p className="text-sm font-semibold text-accent">
        {requestStatuses[row.status]}
      </p>
      {row.details && (
        <p className="text-sm text-muted wrap-anywhere">{row.details}</p>
      )}
      {row.message && <p className="text-sm wrap-anywhere">{row.message}</p>}
      {row.movieSlug && (
        <Link
          className="text-sm text-accent underline"
          to={'/movies/' + row.movieSlug}
        >
          Open catalogue movie
        </Link>
      )}
      {row.rating && <p>{row.rating} / 5</p>}
      {row.body && (
        <Reveal spoiler={row.spoiler}>
          <p className="whitespace-pre-wrap wrap-anywhere">{row.body}</p>
        </Reveal>
      )}
      {editing && row.open && editable ? (
        <MovieRequestForm
          row={row}
          done={() => edit(false)}
          cancel={() => edit(false)}
        />
      ) : (
        row.open && (
          <div className="flex flex-wrap gap-2">
            {editable && (
              <Button variant="outline" onClick={() => edit(true)}>
                Edit pending review
              </Button>
            )}
            <ConfirmDelete kind="pending review" url={url + '/' + row.id} />
          </div>
        )
      )}
    </article>
  );
}

export function OwnedMovieRequests({ editable }) {
  const [page, setPage] = useState(1);
  const query = useRead(url, { params: { page, limit: 6 }, privateRead: true });
  if (query.data?.data?.length === 0 && page === 1) return null;
  return (
    <section className="grid gap-3" aria-label="Movie verification requests">
      <h2 className="text-lg font-semibold">Movie verification requests</h2>
      <QueryContent query={query}>
        {(rows, pagination) => (
          <>
            {rows.map((row) => (
              <OwnedMovieRequest key={row.id} row={row} editable={editable} />
            ))}
            <PageMore page={page} pagination={pagination} change={setPage} />
            {page > 1 && rows.length === 0 && (
              <Button variant="outline" onClick={() => setPage(1)}>
                First page
              </Button>
            )}
          </>
        )}
      </QueryContent>
    </section>
  );
}
