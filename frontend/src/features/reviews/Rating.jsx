import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import {
  MutationError,
  panel,
  Participation,
  QueryContent,
  RatingText,
} from './common.jsx';
import { rateApi, stars, useRead, useReviewAction } from './client.js';

export function StarInput({ value, change, disabled }) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-semibold">Your star rating</legend>
      <div className="grid w-full max-w-sm grid-cols-5">
        {stars
          .filter((star) => Number.isInteger(star))
          .map((star) => (
            <div
              key={star}
              className="relative isolate flex min-h-11 min-w-0 items-center justify-center rounded-control"
            >
              <Star
                className="pointer-events-none absolute size-6 text-muted"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute grid size-6 place-items-center overflow-hidden"
                style={{
                  clipPath:
                    value >= star
                      ? 'none'
                      : value === star - 0.5
                        ? 'inset(0 50% 0 0)'
                        : 'inset(0 100% 0 0)',
                }}
              >
                <Star
                  className="size-6 fill-accent text-accent"
                  aria-hidden="true"
                />
              </div>
              {[star - 0.5, star].map((choice) => (
                <label
                  key={choice}
                  className="group relative flex min-h-11 flex-1 cursor-pointer rounded-control focus-within:ring-2 focus-within:ring-accent"
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="star-rating"
                    value={choice}
                    checked={choice === value}
                    onChange={() => change(choice)}
                  />
                  <span className="sr-only">
                    {choice} {choice === 1 ? 'star' : 'stars'}
                  </span>
                </label>
              ))}
            </div>
          ))}
      </div>
    </fieldset>
  );
}
export function RatingEditor({
  current,
  restricted = false,
  save,
  remove,
  pending,
  error,
}) {
  const [draft, setDraft] = useState(null);
  const value = draft ?? current;
  if (restricted)
    return (
      <p className="text-sm text-muted">
        Your rating is restricted. Contact support for help.
      </p>
    );
  return (
    <form
      className="grid min-w-0 gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value != null && value !== current)
          save(value, () => setDraft(null));
      }}
    >
      <StarInput value={value} change={setDraft} disabled={pending} />
      <p className="text-sm text-muted">
        {value == null
          ? 'Choose a rating from half a star to five stars.'
          : value + ' / 5 selected'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={value == null || value === current}
          loading={pending}
        >
          {current == null ? 'Save rating' : 'Update rating'}
        </Button>
        {current != null && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => remove(() => setDraft(null))}
          >
            Remove rating
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-danger-text text-sm">
          {error.message}
        </p>
      )}
    </form>
  );
}
export function TargetRatingEditor({ target, current, restricted }) {
  const action = useReviewAction();
  const url = rateApi(target);
  return (
    <RatingEditor
      current={current}
      restricted={restricted}
      pending={action.isPending}
      error={action.error}
      save={(rating, onSuccess) =>
        action.mutate({ url, method: 'put', data: { rating } }, { onSuccess })
      }
      remove={(onSuccess) =>
        action.mutate({ url, method: 'delete' }, { onSuccess })
      }
    />
  );
}
export function RatingPanel({ target, access }) {
  const url = rateApi(target);
  const stats = useRead(url);
  const mine = useRead(url + '/mine', {
    privateRead: true,
    enabled: access.allowed,
  });
  const [expanded, setExpanded] = useState(false);
  return (
    <section className={panel} aria-label="Community ratings">
      <h2 className="text-xl font-semibold">Community rating</h2>
      <QueryContent query={stats}>
        {(rating) => (
          <>
            <RatingText rating={rating} />
            <Button
              variant="outline"
              className="justify-self-start"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? 'Hide rating distribution'
                : 'Show rating distribution'}
            </Button>
            {expanded && (
              <ol className="grid gap-1" aria-label="Ratings by star value">
                {[...rating.distribution].reverse().map(({ stars, count }) => (
                  <li
                    className="grid grid-cols-[3.3rem_minmax(0,1fr)_3rem] items-center gap-2 text-sm"
                    key={stars}
                  >
                    <span>
                      {stars} <span aria-hidden="true">★</span>
                      <span className="sr-only"> stars</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-2 rounded-full bg-base"
                    >
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{
                          width:
                            (rating.count ? (count / rating.count) * 100 : 0) +
                            '%',
                        }}
                      />
                    </span>
                    <span className="text-right">
                      {count}
                      <span className="sr-only"> ratings</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </QueryContent>
      <Participation access={access} action="rate this title" />
      {access.allowed && (
        <QueryContent query={mine}>
          {(value) => (
            <TargetRatingEditor
              target={target}
              current={value.rating}
              restricted={value.restricted}
            />
          )}
        </QueryContent>
      )}
    </section>
  );
}
export function RemoveRating({ target }) {
  const action = useReviewAction();
  return (
    <>
      <Button
        variant="outline"
        loading={action.isPending}
        onClick={() =>
          action.mutate({ url: rateApi(target), method: 'delete' })
        }
      >
        Remove rating
      </Button>
      <MutationError action={action} />
    </>
  );
}
