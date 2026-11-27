import { useId, useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Spinner } from '../../components/ui/states.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { StarInput } from '../reviews/Rating.jsx';
import {
  reviewApi,
  useReviewAction,
  useParticipation,
  useRead,
} from '../reviews/client.js';

const fieldClass =
  'min-h-11 w-full rounded-control border border-control bg-base px-3 py-2 text-sm';
function TitlePicker({ type, text, target, onSelect, onQuery }) {
  const id = useId();
  const [q, commit] = useState('');
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const timer = setTimeout(() => commit(text.trim().slice(0, 80)), 230);
    return () => clearTimeout(timer);
  }, [text]);
  const query = useRead(type === 'movie' ? '/movies' : '/films', {
    enabled: !target && q.length > 1 && q === text.trim().slice(0, 80),
    params: {
      q,
      limit: 7,
      ...(type === 'short' && { availability: 'released' }),
    },
  });
  const rows =
    !target && q === text.trim().slice(0, 80) && Array.isArray(query.data?.data)
      ? query.data.data
      : [];
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
        {type === 'movie' ? 'Movie name' : 'Short film name'}
        <input
          value={text}
          onChange={(event) => {
            onQuery(event.target.value);
            setActive(-1);
          }}
          autoComplete="off"
          type="search"
          maxLength={140}
          required
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
      {q.length > 1 && q === text.trim().slice(0, 80) && query.isFetching && (
        <Spinner label="Searching catalogue" />
      )}
      {query.isError && (
        <p role="alert" className="text-sm text-danger-text">
          Title search is unavailable. Please try again.
        </p>
      )}
      {!target &&
        type === 'short' &&
        q.length > 1 &&
        q === text.trim().slice(0, 80) &&
        query.isSuccess &&
        !rows.length && (
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
function Composer({ close }) {
  const access = useParticipation();
  const [type, setType] = useState('movie');
  const [target, setTarget] = useState(null);
  const [finished, finish] = useState(false);
  const [rating, setRating] = useState(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const change = useReviewAction();
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
  function submit(event) {
    event.preventDefault();
    if (change.isPending) return;
    if (type === 'short' && !target)
      return setError('Select a published short film.');
    if (rating == null) return setError('Choose a rating.');
    setError('');
    change.mutate(
      {
        url: target ? reviewApi(target) : '/account/movie-requests',
        method: 'post',
        data: {
          rating,
          body: body.trim(),
          ...(!target && { title: queryTitle.trim() }),
        },
      },
      { onSuccess: () => finish(true) },
    );
  }
  if (finished)
    return (
      <div className="grid gap-3">
        <p role="status" className="text-success">
          {target
            ? 'Review published.'
            : 'Review saved privately for movie verification.'}
        </p>
        <Link className="text-accent underline" to="/account/reviews">
          My Reviews
        </Link>
        <Button className="w-fit" variant="outline" onClick={close}>
          Close
        </Button>
      </div>
    );
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <label className="grid gap-1 text-sm font-medium">
        Content type
        <select
          value={type}
          className={fieldClass}
          onChange={(event) => {
            setType(event.target.value);
            setTarget(null);
            setQueryTitle('');
            setError('');
            change.reset();
          }}
        >
          <option value="movie">Movie</option>
          <option value="short">Short Film</option>
        </select>
      </label>
      <TitlePicker
        key={type}
        type={type}
        target={target}
        text={queryTitle}
        onSelect={(row) => {
          setTarget(row);
          setQueryTitle(row.title);
          setError('');
          change.reset();
        }}
        onQuery={(value) => {
          setTarget(null);
          setQueryTitle(value);
          setError('');
          change.reset();
        }}
      />
      <StarInput value={rating} change={setRating} />
      <label className="grid gap-1 text-sm font-medium">
        Written review
        <textarea
          className={fieldClass}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          minLength={5}
          maxLength={6000}
          required
        />
      </label>
      {(error || change.isError) && (
        <p role="alert" className="text-sm text-danger-text">
          {error || change.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={change.isPending}>
          Submit
        </Button>
        <Button variant="outline" onClick={close}>
          Close
        </Button>
      </div>
    </form>
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
