import { Link } from 'react-router';
import { ManagedReviewListing } from './ReviewManagement.jsx';
import { linkText } from './common.jsx';
import { useState } from 'react';
import { reviewTargets } from '../../../../shared/reviews.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import {
  control,
  date,
  QueryState,
  readable,
  Select,
  useChange,
  useRecords,
} from '../admin/common.jsx';

const path = '/admin/review-moderation';
const reportsPath = path + '/reports';
const label = 'grid min-w-0 gap-1 text-sm';
const pairs = (array) => array.map((key) => [key, readable(key)]);
function ReportCard({ row }) {
  const action = useChange([reportsPath, '/admin/audit']);
  const hidden = row.subject?.status === 'hidden';
  const options = [
    ...(row.status === 'open' ? [['dismiss', 'Dismiss report']] : []),
    ...(hidden
      ? [['restore', 'Restore content']]
      : row.status === 'open' && row.subject?.status === 'published'
        ? [['hide', 'Hide content']]
        : []),
  ];
  return (
    <Card as="li" className="grid min-w-0 gap-3 wrap-anywhere">
      <div>
        <h2 className="text-lg font-semibold capitalize">
          {row.type} · {readable(row.reason)}
        </h2>
        <p className="text-sm text-muted">
          {date(row.createdAt)} · {readable(row.status)}
          {row.resolution && ' · ' + readable(row.resolution)}
        </p>
      </div>
      {row.reviewId && (
        <Link className={linkText} to={path + '/reviews/' + row.reviewId}>
          Inspect reported discussion
        </Link>
      )}
      {row.details && <p className="whitespace-pre-wrap">{row.details}</p>}
      {row.subject?.body && (
        <blockquote className="rounded-control border border-line p-3 whitespace-pre-wrap">
          {row.subject.title && (
            <p className="font-semibold">{row.subject.title}</p>
          )}
          {row.subject.spoiler && (
            <p className="text-sm text-muted">Contains spoilers</p>
          )}
          {row.subject.body}
        </blockquote>
      )}
      {options.length > 0 && (
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            action.mutate({
              url: reportsPath + '/' + row.id,
              method: 'patch',
              data: {
                action: data.get('action'),
                reason: data.get('reason').trim(),
              },
            });
          }}
        >
          <label className={label}>
            Resolution
            <select name="action" className={control}>
              {options.map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Moderation reason
            <input
              className={control}
              name="reason"
              minLength={3}
              maxLength={300}
              required
            />
          </label>
          <Button
            className="justify-self-start"
            type="submit"
            loading={action.isPending}
          >
            Apply resolution
          </Button>
        </form>
      )}
      {action.isError && (
        <p role="alert" className="text-danger-text">
          {action.error.message}
        </p>
      )}
    </Card>
  );
}
function RatingAbuse() {
  const change = useChange(['/admin/audit']);
  const [open, setOpen] = useState(false);
  return (
    <Card className="grid gap-3">
      <Button
        variant="outline"
        className="justify-self-start"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Rating abuse review
      </Button>
      {open && (
        <form
          className="grid min-w-0 gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const url =
              path +
              '/ratings/' +
              ['type', 'slug', 'account']
                .map((name) => encodeURIComponent(form.get(name).trim()))
                .join('/');
            change.mutate({
              url,
              method: 'patch',
              data: {
                reason: form.get('reason').trim(),
                action: form.get('action'),
              },
            });
          }}
        >
          <label className={label}>
            Target
            <select className={control} name="type">
              {reviewTargets.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Target slug
            <input className={control} name="slug" maxLength={90} required />
          </label>
          <label className={label}>
            Account public ID
            <input
              className={control}
              name="account"
              minLength={36}
              maxLength={36}
              required
            />
          </label>
          <label className={label}>
            Action
            <select className={control} name="action">
              <option value="exclude">Exclude fraudulent rating</option>
              <option value="restore">Restore rating</option>
            </select>
          </label>
          <label className={label}>
            Evidence summary
            <input
              className={control}
              name="reason"
              minLength={3}
              maxLength={300}
              required
            />
          </label>
          <Button
            className="self-end justify-self-start"
            type="submit"
            loading={change.isPending}
          >
            Apply rating decision
          </Button>
          {change.isSuccess && (
            <p role="status" className="text-success">
              Rating decision saved.
            </p>
          )}
          {change.isError && (
            <p role="alert" className="text-danger-text">
              {change.error.message}
            </p>
          )}
        </form>
      )}
    </Card>
  );
}
export function ReviewsModeration() {
  const records = useRecords(reportsPath, { status: 'open' });
  return (
    <>
      <SectionHeading as="h1">Review moderation</SectionHeading>
      <nav aria-label="Moderation views" className="flex flex-wrap gap-x-4">
        <Link className={linkText} to="#review-reports">
          Reports
        </Link>
        <Link className={linkText} to="#review-catalogue">
          Review catalogue
        </Link>
      </nav>
      <h2 tabIndex={-1} id="review-reports" className="text-xl font-semibold">
        Reports
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          label="Report status"
          options={pairs(['open', 'resolved'])}
          value={records.params.status ?? 'open'}
          onChange={(value) => records.filter('status', value)}
        />
        <Select
          label="Reported content"
          options={pairs(['review', 'comment'])}
          value={records.params.type ?? ''}
          onChange={(value) => records.filter('type', value)}
        />
      </div>
      <QueryState query={records.query} empty="No reports match these filters">
        {(rows) => (
          <ul className="grid min-w-0 gap-3">
            {rows.map((row) => (
              <ReportCard key={row.id} row={row} />
            ))}
          </ul>
        )}
      </QueryState>
      {records.query.data && (
        <Pagination
          page={records.params.page}
          totalPages={records.query.data.pagination.totalPages}
          onPageChange={records.changePage}
        />
      )}
      <section tabIndex={-1} id="review-catalogue">
        <ManagedReviewListing />
      </section>
      <RatingAbuse />
    </>
  );
}
