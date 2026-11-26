import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button.jsx';
import { SectionHeading } from '../../components/ui/surfaces.jsx';
import { EmptyState } from '../../components/ui/states.jsx';
import {
  control,
  date,
  get,
  readable,
  Select,
  useChange,
  useRecords,
} from '../admin/common.jsx';
import { kinds } from './client.js';
import {
  field,
  linkText,
  MutationError,
  PageMore,
  panel,
  QueryContent,
  Reveal,
} from './common.jsx';

const base = '/admin/review-moderation';
const path = base + '/reviews';
export function ManagedReviewListing() {
  const { params, filter, query, changePage } = useRecords(path, { limit: 12 });
  return (
    <section aria-label="Review catalogue" className="grid min-w-0 gap-4">
      <h2 className="text-xl font-semibold">Review catalogue</h2>
      <form
        className="flex min-w-0 flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          filter('q', new FormData(event.currentTarget).get('q').trim());
        }}
      >
        <label className={field + ' flex-1'}>
          Search reviews
          <input name="q" className={control} maxLength={80} type="search" />
        </label>
        <Button type="submit" variant="outline">
          Search reviews
        </Button>
      </form>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Select
          label="Target type"
          options={Object.entries(kinds)}
          value={params.type ?? ''}
          onChange={(v) => filter('type', v)}
        />
        <Select
          label="Review moderation status"
          options={['published', 'hidden', 'deleted'].map((s) => [
            s,
            readable(s),
          ])}
          value={params.status ?? ''}
          onChange={(v) => filter('status', v)}
        />
        <Select
          label="Spoiler flag"
          options={[
            ['true', 'Contains spoilers'],
            ['false', 'No spoiler flag'],
          ]}
          value={params.spoiler ?? ''}
          onChange={(v) => filter('spoiler', v)}
        />
      </div>
      <QueryContent query={query}>
        {(result, pagination) => (
          <>
            <dl className="flex flex-wrap gap-4 text-sm">
              <div className="rounded-control border border-line p-3">
                <dt>Reviews</dt>
                <dd className="font-semibold">{result.totalReviews}</dd>
              </div>
              <div className="rounded-control border border-line p-3">
                <dt>Open reports</dt>
                <dd className="font-semibold">{result.openReports}</dd>
              </div>
            </dl>
            {!result.rows.length && (
              <EmptyState title="No reviews match these filters" />
            )}
            {result.rows.map((row) => (
              <article key={row.id} className={panel + ' gap-2!'}>
                <h3 className="font-semibold wrap-anywhere">
                  {row.target?.title ?? 'Title unavailable'}
                </h3>
                <p className="text-sm text-muted wrap-anywhere">
                  {row.author.name} · {kinds[row.type]} · {readable(row.status)}
                  {row.spoiler ? ' · Spoiler flagged' : ''}
                </p>
                <Link className={linkText} to={path + '/' + row.id}>
                  Inspect review
                </Link>
              </article>
            ))}
            <PageMore pagination={pagination} onChange={changePage} />
          </>
        )}
      </QueryContent>
    </section>
  );
}
function ModerationAction({ row, url, kind }) {
  const action = useChange([
    path,
    base + '/reports',
    '/admin/audit',
    'reviews',
  ]);
  if (row.status === 'deleted') return null;
  const hide = row.status === 'published';
  return (
    <form
      className="flex min-w-0 flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        action.mutate(
          {
            url,
            method: 'patch',
            data: {
              action: hide ? 'hide' : 'restore',
              reason: new FormData(form).get('reason').trim(),
            },
          },
          { onSuccess: () => form.reset() },
        );
      }}
    >
      <label className={field + ' flex-1 basis-44'}>
        Moderation reason for this {kind}
        <input
          className={control}
          name="reason"
          minLength={3}
          maxLength={300}
          required
        />
      </label>
      <Button variant="outline" type="submit" loading={action.isPending}>
        {hide ? 'Hide' : 'Restore'} {kind}
      </Button>
      <MutationError action={action} />
    </form>
  );
}
function ManagedItem({ row, url, kind }) {
  return (
    <article className={panel + ' wrap-anywhere'}>
      <p className="text-sm text-muted">
        {row.author.name} · {readable(row.status)} · {date(row.createdAt)}
      </p>
      {(row.title || row.body) && (
        <Reveal spoiler={row.spoiler}>
          <div>
            {row.title && <h3 className="font-semibold">{row.title}</h3>}
            {row.body && <p className="whitespace-pre-wrap">{row.body}</p>}
          </div>
        </Reveal>
      )}
      {row.moderationReason && (
        <p className="text-sm text-muted">
          Moderation reason · {row.moderationReason}
        </p>
      )}
      <ModerationAction row={row} url={url} kind={kind} />
    </article>
  );
}
export function ManageReview() {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const url = path + '/' + id;
  const query = useQuery({
    queryKey: [path, id, page],
    queryFn: ({ signal }) => get(url, signal, { page, limit: 12 }),
  });
  const audit = useQuery({
    queryKey: [path, id, 'audit', auditPage],
    queryFn: ({ signal }) =>
      get(url + '/audit', signal, { page: auditPage, limit: 12 }),
  });
  return (
    <>
      <Link to={base} className={linkText}>
        Back to review moderation
      </Link>
      <SectionHeading as="h1">Moderate review</SectionHeading>
      <QueryContent query={query} missing="This review was not found">
        {({ review, comments, openReports, pagination }) => (
          <>
            <p className="text-sm text-muted wrap-anywhere">
              {review.target?.title ?? 'Title unavailable'} · {openReports} open{' '}
              {openReports === 1 ? 'report' : 'reports'}
            </p>
            <ManagedItem row={review} url={url} kind="review" />
            <section aria-label="Comments" className="grid min-w-0 gap-4">
              <h2 className="text-xl font-semibold">Comments</h2>
              {comments.length ? (
                comments.map((row) => (
                  <ManagedItem
                    key={row.id}
                    row={row}
                    url={url + '/comments/' + row.id}
                    kind="comment"
                  />
                ))
              ) : (
                <EmptyState title="No comments" />
              )}
              <PageMore pagination={pagination} onChange={setPage} />
            </section>
            <section
              aria-label="Moderation audit history"
              className="grid min-w-0 gap-3"
            >
              <h2 className="text-xl font-semibold">
                Moderation audit history
              </h2>
              <QueryContent query={audit}>
                {(rows, paging) => (
                  <>
                    {rows.length ? (
                      <ul className="grid gap-2">
                        {rows.map((row) => (
                          <li className={panel + ' wrap-anywhere'} key={row.id}>
                            <p className="font-semibold">
                              {readable(row.action)}
                            </p>
                            <p className="text-sm text-muted">
                              {date(row.createdAt)}
                            </p>
                            {row.summary?.reason && <p>{row.summary.reason}</p>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted">
                        No moderation actions recorded.
                      </p>
                    )}
                    <PageMore pagination={paging} onChange={setAuditPage} />
                  </>
                )}
              </QueryContent>
            </section>
          </>
        )}
      </QueryContent>
    </>
  );
}
