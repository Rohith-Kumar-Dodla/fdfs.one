import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/states.jsx';
import { ConfirmDelete, TextEditor } from './Community.jsx';
import { TargetRatingEditor } from './Rating.jsx';
import {
  kinds,
  rateApi,
  reviewApi,
  reviewLink,
  useParticipation,
  useRead,
} from './client.js';
import {
  linkText,
  PageMore,
  panel,
  Participation,
  QueryContent,
  Reveal,
  ReviewShell,
} from './common.jsx';

function OwnedEntry({ row, kind, access }) {
  const [edit, setEdit] = useState(false);
  const isRating = kind === 'ratings';
  const mine = useRead(
    row.target ? rateApi(row.target) + '/mine' : '/ratings',
    { privateRead: true, enabled: !!row.target && edit && !isRating },
  );
  const available = Boolean(row.target);
  return (
    <article className={panel}>
      <div className="min-w-0 wrap-anywhere">
        {available ? (
          <Link className={linkText} to={row.target.path}>
            {row.target.title}
          </Link>
        ) : (
          <h2 className="font-semibold">Title unavailable</h2>
        )}
        <p className="text-sm text-muted">
          {kinds[row.type]} · Updated{' '}
          {new Date(row.updatedAt).toLocaleDateString()}
        </p>
      </div>
      {isRating ? (
        <p>
          {row.rating} / 5{row.restricted && ' · Rating restricted'}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            {row.status === 'hidden'
              ? 'Hidden by moderation'
              : 'Published review'}
          </p>
          <Reveal spoiler={row.spoiler}>
            <div className="grid gap-1 wrap-anywhere">
              {row.title && <h3 className="font-semibold">{row.title}</h3>}
              <p className="whitespace-pre-wrap">{row.body}</p>
            </div>
          </Reveal>
          {available && row.status === 'published' && (
            <Link className={linkText} to={reviewLink(row.id)}>
              Open review
            </Link>
          )}
        </>
      )}
      {access.allowed && (
        <>
          <div className="flex flex-wrap gap-2">
            {available &&
              (isRating ? !row.restricted : row.status === 'published') && (
                <Button
                  variant="outline"
                  aria-expanded={edit}
                  onClick={() => setEdit(!edit)}
                >
                  {edit
                    ? 'Close editor'
                    : isRating
                      ? 'Edit rating'
                      : 'Edit review'}
                </Button>
              )}
            {!isRating && (
              <ConfirmDelete
                kind="review"
                url={'/account/reviews/reviews/' + row.id}
              />
            )}
            {isRating && !row.restricted && !available && (
              <ConfirmDelete
                kind="rating"
                url={'/account/reviews/ratings/' + row.id}
              />
            )}
          </div>
          {edit &&
            available &&
            (isRating ? (
              <TargetRatingEditor
                target={row.target}
                current={row.rating}
                restricted={row.restricted}
              />
            ) : (
              <TextEditor
                title="Edit your review"
                current={row}
                rating={mine.data?.data.rating}
                url={reviewApi(row.target) + '/' + row.id}
                method="patch"
                onSaved={() => setEdit(false)}
                cancel={() => setEdit(false)}
              />
            ))}
        </>
      )}
    </article>
  );
}
export function ReviewHistory() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') === 'ratings' ? 'ratings' : 'reviews';
  const raw = Number(params.get('page'));
  const page = Number.isInteger(raw) && raw >= 1 && raw <= 10000 ? raw : 1;
  const access = useParticipation();
  const query = useRead('/account/reviews', {
    params: { kind, page, limit: 12 },
    privateRead: true,
  });
  return (
    <ReviewShell title="My reviews and ratings">
      <nav aria-label="Your review activity" className="flex flex-wrap gap-4">
        <Link
          className={linkText}
          to="/account/reviews"
          aria-current={kind === 'reviews' ? 'page' : undefined}
        >
          My reviews
        </Link>
        <Link
          className={linkText}
          to="/account/reviews?kind=ratings"
          aria-current={kind === 'ratings' ? 'page' : undefined}
        >
          My ratings
        </Link>
      </nav>
      <Participation access={access} action="manage your reviews" />
      <QueryContent query={query}>
        {(rows, paging) => (
          <div className="grid min-w-0 gap-4">
            {rows.length ? (
              rows.map((row) => (
                <OwnedEntry
                  key={kind + row.id}
                  row={row}
                  kind={kind}
                  access={access}
                />
              ))
            ) : (
              <EmptyState
                title={
                  kind === 'ratings'
                    ? 'You have no ratings yet'
                    : 'You have no reviews yet'
                }
              />
            )}
            <PageMore
              pagination={paging}
              onChange={(page) =>
                setParams({ kind, page }, { preventScrollReset: true })
              }
            />
          </div>
        )}
      </QueryContent>
    </ReviewShell>
  );
}
