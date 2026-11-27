import { useId, useState } from 'react';
import { Link, useBeforeUnload, useBlocker, useParams } from 'react-router';
import { Heart, MessageCircle, UserRound } from 'lucide-react';
import { z } from 'zod';
import { reportReasons } from '../../../../shared/reviews.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { EmptyState } from '../../components/ui/states.jsx';
import { control } from '../admin/common.jsx';
import { usePageMetadata } from '../../hooks/use-page-metadata.js';
import { useValidatedForm } from '../../hooks/use-validated-form.js';
import {
  kinds,
  rateApi,
  reviewApi,
  reviewLink,
  stars,
  useParticipation,
  useRead,
  useReviewAction,
} from './client.js';
import {
  CheckboxText,
  field,
  linkText,
  MutationError,
  PageMore,
  panel,
  Participation,
  QueryContent,
  Reveal,
  ReviewShell,
} from './common.jsx';
import { RatingPanel } from './Rating.jsx';

const plain = (min, max) =>
  z
    .string()
    .trim()
    .min(min, { message: 'Enter at least ' + min + ' characters.' })
    .max(max)
    .refine((value) => !/<\/?[a-z][^>]*>/i.test(value), 'Use plain text.');
const reviewForm = z.object({
  title: plain(0, 140),
  body: plain(5, 6000),
  spoiler: z.boolean(),
});
const commentForm = z.object({ body: plain(1, 2000), spoiler: z.boolean() });
const reasons = {
  harassment: 'Harassment',
  spam: 'Spam',
  inappropriate: 'Inappropriate content',
  spoiler: 'Unmarked spoiler',
  impersonation: 'Impersonation',
  other: 'Other policy violation',
};
const displayDate = (timestamp) =>
  new Date(timestamp).toLocaleDateString(undefined, { dateStyle: 'medium' });

function LeaveEditor({ dirty }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  return (
    <Dialog
      open={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      title="Discard unsaved review?"
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => blocker.reset?.()}>
          Keep editing
        </Button>
        <Button onClick={() => blocker.proceed?.()}>Discard changes</Button>
      </div>
    </Dialog>
  );
}
export function TextEditor({
  title = 'Write a review',
  kind = 'review',
  current,
  rating,
  ratingWrite,
  showRating = true,
  submitLabel,
  url,
  method = 'post',
  cancel,
  onSaved,
}) {
  const isReview = kind === 'review';
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useValidatedForm(isReview ? reviewForm : commentForm, {
    defaultValues: {
      ...(isReview && { title: current?.title ?? '' }),
      body: current?.body ?? '',
      spoiler: !!current?.spoiler,
    },
  });
  const action = useReviewAction();
  const saveRating = useReviewAction();
  const pending = action.isPending || saveRating.isPending;
  const heading = useId();
  const length = watch('body')?.length ?? 0;
  const maximum = isReview ? 6000 : 2000;
  const bodyError = heading + '-body';
  return (
    <form
      aria-labelledby={heading}
      className="grid min-w-0 gap-3"
      onSubmit={handleSubmit(async (fields) => {
        if (ratingWrite) {
          try {
            await saveRating.mutateAsync(ratingWrite);
          } catch {
            return;
          }
        }
        const data = {
          ...fields,
          ...(isReview && { title: fields.title || undefined }),
        };
        action.mutate(
          { url, method, data },
          {
            onSuccess: () => {
              reset(current ? fields : undefined);
              onSaved?.();
            },
          },
        );
      })}
    >
      {isReview && <LeaveEditor dirty={isDirty && !action.isSuccess} />}
      <h3 className="font-semibold" id={heading}>
        {title}
      </h3>
      {isReview && showRating && (
        <p className="text-sm text-muted">
          {rating == null
            ? 'A rating is optional.'
            : 'Your rating is ' + rating + ' / 5.'}
        </p>
      )}
      {isReview && (
        <label className={field}>
          Review title (optional)
          <input
            className={control}
            maxLength={140}
            aria-invalid={!!errors.title}
            {...register('title')}
          />
          {errors.title && (
            <span role="alert" className="text-danger-text">
              {errors.title.message}
            </span>
          )}
        </label>
      )}
      <label className={field}>
        {isReview ? 'Review' : 'Comment'}
        <textarea
          rows={isReview ? 5 : 3}
          className={control}
          maxLength={maximum}
          aria-invalid={!!errors.body}
          aria-describedby={bodyError}
          {...register('body')}
        />
        <span className="text-muted" id={bodyError}>
          {length} / {maximum}
          {errors.body && (
            <span role="alert" className="ml-2 text-danger-text">
              {errors.body.message}
            </span>
          )}
        </span>
      </label>
      <CheckboxText {...register('spoiler')}>Contains spoilers</CheckboxText>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          {submitLabel ??
            (isReview
              ? current
                ? 'Save review'
                : 'Post review'
              : current
                ? 'Save comment'
                : 'Post comment')}
        </Button>
        {cancel && (
          <Button variant="outline" disabled={pending} onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
      {action.isSuccess && !onSaved && (
        <p role="status" className="text-success">
          Saved.
        </p>
      )}
      <MutationError action={saveRating} />
      <MutationError action={action} />
    </form>
  );
}
export function ConfirmDelete({ url, kind, onDeleted }) {
  const [open, setOpen] = useState(false);
  const action = useReviewAction();
  const close = () => {
    if (!action.isPending) setOpen(false);
  };
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          action.reset();
          setOpen(true);
        }}
      >
        Delete {kind}
      </Button>
      <Dialog title={'Delete ' + kind + '?'} open={open} onClose={close}>
        <p className="mb-4 text-sm text-muted">
          This removes your {kind} from public discussion.
        </p>
        <MutationError action={action} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={action.isPending} onClick={close}>
            Cancel
          </Button>
          <Button
            loading={action.isPending}
            onClick={() =>
              action.mutate(
                { url, method: 'delete' },
                {
                  onSuccess: () => {
                    setOpen(false);
                    onDeleted?.();
                  },
                },
              )
            }
          >
            Confirm deletion
          </Button>
        </div>
      </Dialog>
    </>
  );
}
function Report({ url, kind }) {
  const [open, setOpen] = useState(false);
  const action = useReviewAction();
  const close = () => {
    if (!action.isPending) setOpen(false);
  };
  return (
    <>
      <Button
        variant="outline"
        disabled={action.isSuccess}
        onClick={() => setOpen(true)}
      >
        {action.isSuccess ? 'Report submitted' : 'Report ' + kind}
      </Button>
      <Dialog title={'Report ' + kind} open={open} onClose={close}>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const input = new FormData(event.currentTarget);
            action.mutate(
              {
                url: url + '/report',
                method: 'post',
                data: {
                  reason: input.get('reason'),
                  details: input.get('details').trim() || undefined,
                },
              },
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <label className={field}>
            Report reason
            <select className={control} name="reason" required>
              {reportReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reasons[reason]}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            Details (optional)
            <textarea
              className={control}
              name="details"
              maxLength={500}
              rows={3}
            />
          </label>
          <Button type="submit" loading={action.isPending}>
            Submit report
          </Button>
          <MutationError action={action} />
        </form>
      </Dialog>
    </>
  );
}
function Author({ author, date, edited }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-nav text-accent">
        <UserRound aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 wrap-anywhere">
        <p className="font-semibold">{author.name}</p>
        <p className="text-xs text-muted">
          <time dateTime={date}>{displayDate(date)}</time>
          {edited && ' · Edited'}
        </p>
      </div>
    </div>
  );
}
function Like({ url, liked, known, count }) {
  const action = useReviewAction();
  return (
    <div className="grid gap-1">
      <Button
        variant="outline"
        aria-pressed={liked}
        disabled={!known}
        loading={action.isPending}
        onClick={() =>
          action.mutate({
            url: url + '/like',
            method: liked ? 'delete' : 'put',
          })
        }
      >
        <Heart
          className={'size-4 ' + (liked ? 'fill-accent text-accent' : '')}
          aria-hidden="true"
        />
        {liked ? 'Unlike' : 'Like'}
        <span className="sr-only"> review</span> · {count}
      </Button>
      <MutationError action={action} />
    </div>
  );
}
function SpoilerText({ row, full }) {
  const [revealed, setRevealed] = useState(false);
  const query = useRead('/reviews/entry/' + row.id, {
    params: { reveal: 'true' },
    enabled: revealed && row.spoiler,
  });
  if (row.spoiler)
    return (
      <div className="grid gap-2">
        <p className="text-sm font-semibold text-accent">Contains spoilers</p>
        {full && (
          <Button
            variant="outline"
            className="justify-self-start"
            aria-expanded={revealed}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? 'Hide spoiler' : 'Reveal spoiler'}
          </Button>
        )}
        {full && revealed && (
          <QueryContent query={query}>
            {(entry) => <ReviewText row={entry} />}
          </QueryContent>
        )}
      </div>
    );
  return <ReviewText row={row} />;
}
function ReviewText({ row }) {
  return (
    <div className="grid min-w-0 gap-1 wrap-anywhere">
      {row.title && <h3 className="font-semibold">{row.title}</h3>}
      {row.body && <p className="whitespace-pre-wrap">{row.body}</p>}
    </div>
  );
}
export function ReviewCard({
  row,
  target,
  access,
  liked,
  known,
  full = false,
}) {
  const [edit, setEdit] = useState(false);
  const own = Boolean(access.account && row.author.id === access.account.id);
  const url = reviewApi(target) + '/' + row.id;
  const mine = useRead(reviewApi(target) + '/mine', {
    privateRead: true,
    enabled: edit && own,
  });
  return (
    <article className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Author
          author={row.author}
          date={row.createdAt}
          edited={row.updatedAt}
        />
        {row.rating != null && (
          <p className="text-sm text-accent">{row.rating} / 5</p>
        )}
      </div>
      {target.title && (
        <Link to={target.path} className={linkText}>
          {target.title}{' '}
          <span className="ml-2 text-xs text-muted">{kinds[target.type]}</span>
        </Link>
      )}
      <SpoilerText row={row} full={full} />
      {edit && (
        <QueryContent query={mine}>
          {(entry) =>
            entry && (
              <TextEditor
                title="Edit your review"
                current={entry}
                rating={row.rating}
                url={url}
                method="patch"
                cancel={() => setEdit(false)}
                onSaved={() => setEdit(false)}
              />
            )
          }
        </QueryContent>
      )}
      <div className="flex flex-wrap items-start gap-2">
        {access.allowed ? (
          <Like url={url} liked={liked} known={known} count={row.likes} />
        ) : (
          <span className="inline-flex min-h-11 items-center gap-2 text-sm text-muted">
            <Heart className="size-4" aria-hidden="true" />
            {row.likes} likes
          </span>
        )}
        {full ? (
          <span className="inline-flex min-h-11 items-center gap-2 text-sm text-muted">
            <MessageCircle className="size-4" aria-hidden="true" />
            {row.comments} comments
          </span>
        ) : (
          <Link to={reviewLink(row.id)} className={linkText}>
            Read review · {row.comments} comments
          </Link>
        )}
        {access.allowed &&
          (!own ? (
            <Report url={url} kind="review" />
          ) : (
            <>
              <Button variant="outline" onClick={() => setEdit(!edit)}>
                {edit ? 'Close editor' : 'Edit review'}
              </Button>
              <ConfirmDelete url={url} kind="review" />
            </>
          ))}
      </div>
    </article>
  );
}
export function ReviewCards({ rows, target, access, full = false }) {
  const ids = rows
    .map((row) => row.id)
    .sort()
    .join(',');
  const likes = useRead('/reviews/likes', {
    privateRead: true,
    params: { ids },
    enabled: access.allowed && !!ids,
  });
  const liked = new Set(likes.data?.data);
  return (
    <div className="grid min-w-0 gap-4">
      {rows.map((row) => (
        <ReviewCard
          key={row.id}
          row={row}
          target={target ?? row.target}
          access={access}
          full={full}
          known={likes.isSuccess}
          liked={liked.has(row.id)}
        />
      ))}
      {access.allowed && likes.isError && (
        <Button
          className="justify-self-start"
          variant="outline"
          onClick={() => void likes.refetch()}
        >
          Reload your likes
        </Button>
      )}
    </div>
  );
}
function Comment({ row, url, access }) {
  const [edit, setEdit] = useState(false);
  const own = Boolean(access.account && row.author.id === access.account.id);
  const path = url + '/' + row.id;
  return (
    <article className={panel}>
      <Author author={row.author} date={row.createdAt} edited={row.updatedAt} />
      <Reveal spoiler={row.spoiler}>
        <p className="whitespace-pre-wrap wrap-anywhere">{row.body}</p>
      </Reveal>
      {edit && (
        <TextEditor
          title="Edit your comment"
          current={row}
          url={path}
          method="patch"
          kind="comment"
          cancel={() => setEdit(false)}
          onSaved={() => setEdit(false)}
        />
      )}
      {access.allowed && (
        <div className="flex flex-wrap gap-2">
          {own ? (
            <>
              <Button variant="outline" onClick={() => setEdit(!edit)}>
                {edit ? 'Close editor' : 'Edit comment'}
              </Button>
              <ConfirmDelete url={path} kind="comment" />
            </>
          ) : (
            <Report url={path} kind="comment" />
          )}
        </div>
      )}
    </article>
  );
}
function Discussion({ row, access }) {
  const [page, setPage] = useState(1);
  const url = reviewApi(row.target) + '/' + row.id + '/comments';
  const comments = useRead(url, { params: { page }, refetchOnMount: 'always' });
  return (
    <section className="grid min-w-0 gap-4" aria-label="Discussion">
      <h2 className="text-xl font-semibold">Discussion</h2>
      {access.allowed ? (
        <div className={panel}>
          <TextEditor title="Add a comment" url={url} kind="comment" />
        </div>
      ) : (
        <Participation access={access} action="join the discussion" />
      )}
      <QueryContent query={comments}>
        {(rows, paging) => (
          <>
            {rows.length ? (
              rows.map((item) => (
                <Comment row={item} key={item.id} url={url} access={access} />
              ))
            ) : (
              <EmptyState title="No comments yet" />
            )}
            <PageMore pagination={paging} onChange={setPage} />
          </>
        )}
      </QueryContent>
    </section>
  );
}
export function ReviewDetail() {
  const { reviewId } = useParams();
  const access = useParticipation();
  const query = useRead('/reviews/entry/' + encodeURIComponent(reviewId), {
    refetchOnMount: 'always',
  });
  const row = query.data?.data;
  usePageMetadata(
    row && {
      title: 'Community review of ' + row.target.title + ' | FDFS.ONE',
      description:
        'Read a community review and discussion for ' + row.target.title + '.',
      path: reviewLink(row.id),
    },
  );
  return (
    <ReviewShell title="Community review">
      <QueryContent query={query} missing="This review is unavailable">
        {(entry) => (
          <>
            <ReviewCards rows={[entry]} access={access} full />
            <Discussion row={entry} access={access} key={entry.id} />
          </>
        )}
      </QueryContent>
    </ReviewShell>
  );
}
export function TargetCommunity({ target }) {
  const access = useParticipation();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('recent');
  const url = reviewApi(target);
  const list = useRead(url, {
    params: { page, sort, summary: 'true', limit: 8 },
  });
  const mine = useRead(url + '/mine', {
    privateRead: true,
    enabled: access.allowed,
  });
  const rating = useRead(rateApi(target) + '/mine', {
    privateRead: true,
    enabled: access.allowed,
  });
  return (
    <div className="grid min-w-0 gap-6">
      <RatingPanel target={target} access={access} />
      <section
        id="film-community"
        tabIndex={-1}
        aria-label="Community reviews"
        className="grid min-w-0 scroll-mt-24 gap-4"
      >
        <h2 className="text-xl font-semibold">Community reviews</h2>
        <Participation access={access} action="write a review" />
        {access.allowed && (
          <QueryContent query={mine}>
            {(value) =>
              value ? (
                <p className="text-sm text-muted">
                  {value.status === 'hidden'
                    ? 'Your review is hidden. '
                    : 'You already reviewed this title. '}
                  <Link className={linkText} to="/account/reviews">
                    Manage your reviews
                  </Link>
                </p>
              ) : (
                <div className={panel}>
                  <TextEditor
                    title="Write a review"
                    url={url}
                    rating={rating.data?.data.rating}
                  />
                </div>
              )
            }
          </QueryContent>
        )}
        <label className={field + ' max-w-xs'}>
          Sort reviews
          <select
            className={control}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="recent">Recent</option>
            <option value="liked">Most liked</option>
            <option value="trending">Trending</option>
          </select>
        </label>
        <QueryContent query={list}>
          {(rows, paging) => (
            <>
              {rows.length ? (
                <ReviewCards rows={rows} target={target} access={access} />
              ) : (
                <EmptyState title="No published reviews yet" />
              )}
              <PageMore pagination={paging} onChange={setPage} />
            </>
          )}
        </QueryContent>
      </section>
    </div>
  );
}
export function ReviewRatingOptions() {
  return stars.map((rating) => (
    <option key={rating} value={rating}>
      {rating} stars
    </option>
  ));
}
