import { useId, useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Spinner } from '../../components/ui/states.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { ConfirmDelete, TextEditor } from '../reviews/Community.jsx';
import { MovieRequestForm } from '../reviews/MovieRequests.jsx';
import { StarInput } from '../reviews/Rating.jsx';
import {
  reviewApi,
  rateApi,
  useParticipation,
  useRead,
} from '../reviews/client.js';
import { QueryContent } from '../reviews/common.jsx';

const fieldClass =
  'min-h-11 w-full rounded-control border border-control bg-base px-3 py-2 text-sm';
function TitlePicker({ type, onSelect, onQuery }) {
  const id = useId();
  const [text, setText] = useState('');
  const [q, commit] = useState('');
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const timer = setTimeout(() => commit(text.trim()), 230);
    return () => clearTimeout(timer);
  }, [text]);
  const query = useRead(type === 'movie' ? '/movies' : '/films', {
    enabled: q.length > 1 && q === text.trim(),
    params: {
      q,
      limit: 7,
      ...(type === 'short' && { availability: 'released' }),
    },
  });
  const rows =
    q === text.trim() && Array.isArray(query.data?.data) ? query.data.data : [];
  function pick(row) {
    const kind =
      type === 'movie'
        ? 'movie'
        : row.classification === 'original'
          ? 'original'
          : 'cinema';
    onSelect({
      type: kind,
      slug: row.slug,
      title: row.title,
      path:
        (kind === 'movie'
          ? '/movies'
          : kind === 'original'
            ? '/originals'
            : '/cinema') +
        '/' +
        row.slug,
    });
  }
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm font-medium">
        Content name
        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onQuery(event.target.value);
            setActive(-1);
          }}
          autoComplete="off"
          type="search"
          maxLength={80}
          role="combobox"
          aria-controls={id}
          aria-expanded={rows.length > 0}
          aria-autocomplete="list"
          aria-activedescendant={rows[active] ? id + '-' + active : undefined}
          className={fieldClass}
          onKeyDown={(event) => {
            if (!rows.length) return;
            if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
              event.preventDefault();
              setActive(
                (value) =>
                  (value + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) %
                  rows.length,
              );
            } else if (event.key === 'Enter' && rows[active]) {
              event.preventDefault();
              pick(rows[active]);
            }
          }}
        />
      </label>
      {q.length > 1 && q === text.trim() && query.isFetching && (
        <Spinner label="Searching catalogue" />
      )}
      {query.isError && (
        <p role="alert" className="text-sm text-danger-text">
          Title search is unavailable. Please try again.
        </p>
      )}
      {q.length > 1 && q === text.trim() && query.isSuccess && !rows.length && (
        <p className="text-sm text-muted">No published titles match.</p>
      )}
      <ul
        role="listbox"
        id={id}
        aria-label="Matching titles"
        hidden={!rows.length}
        className="grid max-h-64 gap-1 overflow-y-auto"
      >
        {rows.map((row, i) => (
          <li
            role="option"
            id={id + '-' + i}
            aria-selected={i === active}
            key={row.id}
            className={
              'flex min-h-14 cursor-pointer items-center gap-3 rounded-control p-2 ' +
              (i === active ? 'bg-accent/15' : 'hover:bg-base')
            }
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(row)}
          >
            <div className="w-8 shrink-0">
              <FilmImage image={row.poster} sizes="32px" />
            </div>
            <span className="min-w-0 wrap-anywhere">
              <strong className="block text-sm">{row.title}</strong>
              <small className="text-muted">
                {[
                  row.releaseYear,
                  type === 'short' &&
                    (row.classification === 'original'
                      ? 'Originals'
                      : 'Cinema'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
function OwnedReviewForm({ target, cancel, done }) {
  const url = reviewApi(target);
  const mine = useRead(url + '/mine', { privateRead: true });
  const score = useRead(rateApi(target) + '/mine', { privateRead: true });
  const [rating, setRating] = useState(null);
  return (
    <QueryContent query={mine}>
      {(current) => (
        <QueryContent query={score}>
          {(existing) => {
            const restricted = !!(existing?.excluded || existing?.restricted);
            return current?.status === 'hidden' ? (
              <p role="status">
                Your review is hidden. Visit{' '}
                <Link className="text-accent underline" to="/account/reviews">
                  your reviews
                </Link>{' '}
                for its status.
              </p>
            ) : (
              <>
                {!restricted && (
                  <div className="grid gap-2">
                    <StarInput
                      value={rating ?? existing?.rating}
                      change={setRating}
                    />
                    <p className="text-sm text-muted">
                      {(rating ?? existing?.rating) != null
                        ? (rating ?? existing.rating) + ' / 5 selected'
                        : 'Choose a rating from half a star to five stars.'}
                    </p>
                  </div>
                )}
                <TextEditor
                  current={current}
                  rating={rating ?? existing?.rating}
                  showRating={restricted}
                  ratingWrite={
                    !restricted && rating != null && rating !== existing?.rating
                      ? {
                          url: rateApi(target),
                          method: 'put',
                          data: { rating },
                        }
                      : undefined
                  }
                  submitLabel={current ? 'Save Review' : 'Submit Review'}
                  title={current ? 'Edit your review' : 'Your review'}
                  method={current ? 'patch' : 'post'}
                  url={current ? url + '/' + current.id : url}
                  cancel={cancel}
                  onSaved={done}
                />
                {current && (
                  <ConfirmDelete
                    url={url + '/' + current.id}
                    kind="review"
                    onDeleted={done}
                  />
                )}
              </>
            );
          }}
        </QueryContent>
      )}
    </QueryContent>
  );
}
function Composer({ close }) {
  const access = useParticipation();
  const [type, setType] = useState('movie');
  const [target, setTarget] = useState(null);
  const [finished, finish] = useState(false);
  const [missing, setMissing] = useState(false);
  const [queryTitle, setQueryTitle] = useState('');
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  if (access.checking) return <Spinner label="Checking your account" />;
  if (!access.allowed)
    return (
      <div className="grid gap-3">
        <p>
          {access.closed
            ? 'Review submissions are currently closed.'
            : access.guest
              ? 'Sign in to write a review.'
              : access.account?.status === 'active' &&
                  !access.account.emailVerified
                ? 'Verify your email to write a review.'
                : 'Your account cannot write reviews right now.'}
        </p>
        {access.guest && (
          <div>
            <Link
              className={buttonClasses()}
              to="/login"
              state={{ from: '/reviews?write=1' }}
            >
              Sign in
            </Link>
          </div>
        )}
        {!access.guest &&
          !access.closed &&
          access.account?.status === 'active' &&
          !access.account.emailVerified && (
            <Link className="text-accent underline" to="/verification-pending">
              Verify your email
            </Link>
          )}
      </div>
    );
  if (finished)
    return (
      <div className="grid gap-3">
        <p role="status" className="font-semibold text-success">
          {missing
            ? 'Review saved privately for movie verification.'
            : 'Review updated successfully.'}
        </p>
        <Link
          className="text-accent underline"
          to={missing ? '/account/reviews' : target.path + '#film-community'}
        >
          {missing ? 'Open My Reviews' : 'Open ' + target.title}
        </Link>
        <div>
          <Button onClick={close}>Done</Button>
        </div>
      </div>
    );
  if (missing)
    return (
      <MovieRequestForm
        initialTitle={queryTitle}
        done={() => finish(true)}
        cancel={() => setMissing(false)}
      />
    );
  return (
    <div className="grid gap-4">
      <label className="grid gap-1 text-sm font-medium">
        Content type
        <select
          value={type}
          className={fieldClass}
          onChange={(event) => {
            setType(event.target.value);
            setTarget(null);
            setQueryTitle('');
          }}
        >
          <option value="movie">Movie</option>
          <option value="short">Short Film</option>
        </select>
      </label>
      {target ? (
        <div className="flex flex-wrap items-center gap-2">
          <strong>{target.title}</strong>
          <Button variant="outline" onClick={() => setTarget(null)}>
            Change title
          </Button>
        </div>
      ) : (
        <TitlePicker
          type={type}
          key={type}
          onSelect={setTarget}
          onQuery={setQueryTitle}
        />
      )}
      {!target && type === 'movie' && (
        <Button
          className="w-fit"
          variant="outline"
          onClick={() => setMissing(true)}
        >
          Can't Find Your Movie?
        </Button>
      )}
      {target ? (
        <OwnedReviewForm
          key={target.type + target.slug}
          target={target}
          cancel={close}
          done={() => finish(true)}
        />
      ) : (
        <div>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
export function ReviewComposer({ open, close }) {
  return (
    <Dialog
      title="Write Your Review"
      open={open}
      onClose={close}
      className="mt-auto mb-0 max-h-[92dvh] w-full max-w-2xl rounded-b-none sm:my-auto sm:rounded-panel"
    >
      {open && <Composer close={close} />}
    </Dialog>
  );
}
export function ReviewStrip({ type, heading }) {
  const query = useRead('/reviews/feed', {
    params: { type, sort: 'recent', limit: 4 },
  });
  const rows = Array.isArray(query.data?.data)
    ? query.data.data.filter((row) => row.target?.type === type)
    : [];
  if (!rows.length) return null;
  return (
    <section className="grid gap-3" aria-label={heading}>
      <h2 className="text-xl font-bold">{heading}</h2>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <article
            key={row.id}
            className="grid min-w-0 content-start gap-2 rounded-panel bg-surface/55 p-4 wrap-anywhere"
          >
            <Link
              className="font-semibold text-accent hover:underline"
              to={'/reviews/' + row.id}
            >
              {row.target.title}
            </Link>
            <p className="text-sm text-muted">
              {[
                row.author?.name,
                Number.isFinite(row.rating) && row.rating + ' / 5',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="line-clamp-2 text-sm">
              {row.spoiler ? 'Contains spoilers' : row.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
