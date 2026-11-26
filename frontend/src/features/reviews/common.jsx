import { Link, useLocation } from 'react-router';
import { Star } from 'lucide-react';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { Container, SectionHeading } from '../../components/ui/surfaces.jsx';
import {
  EmptyState,
  ErrorState,
  Spinner,
} from '../../components/ui/states.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';

export const field = 'grid min-w-0 gap-1 text-sm';
export const panel =
  'grid min-w-0 gap-4 rounded-panel border border-line bg-surface p-4 sm:p-5';
export const linkText =
  'inline-flex min-h-11 items-center font-semibold text-accent underline wrap-anywhere';
export function QueryContent({ query, children, empty, missing }) {
  if (query.isPending) return <Spinner label="Loading reviews data" />;
  if (query.isError) {
    if (missing && [400, 404].includes(query.error.status))
      return (
        <EmptyState title={missing}>
          <Link className={linkText} to="/reviews">
            Back to Reviews
          </Link>
        </EmptyState>
      );
    return (
      <ErrorState
        title="Could not load this content"
        description={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (empty && (!query.data.data || query.data.data.length === 0))
    return <EmptyState title={empty} />;
  return children(query.data.data, query.data.pagination);
}
export function PageMore({ pagination, onChange }) {
  return (
    pagination && (
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={onChange}
      />
    )
  );
}
export function ReviewShell({ title, description, children }) {
  return (
    <Container className="grid min-w-0 gap-6 py-8 sm:gap-8 sm:py-12">
      <header className="grid min-w-0 gap-3">
        <SectionHeading as="h1" description={description}>
          {title}
        </SectionHeading>
        <nav aria-label="Reviews navigation" className="flex flex-wrap gap-x-5">
          {[
            ['/reviews', 'Reviews'],
            ['/reviews/movies', 'Movies'],
            ['/reviews/short-films', 'Short films'],
            ['/reviews/community', 'Community'],
          ].map(([path, name]) => (
            <Link className={linkText} to={path} key={path}>
              {name}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </Container>
  );
}
export function RatingText({ rating }) {
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted">
      <Star className="size-4 shrink-0 text-accent" aria-hidden="true" />
      {rating?.count > 0 && rating.average != null ? (
        <>
          <span className="font-semibold text-foreground">
            {rating.average.toFixed(1)} / 5
          </span>
          <span>
            {rating.count} {rating.count === 1 ? 'rating' : 'ratings'}
          </span>
        </>
      ) : (
        'Unrated'
      )}
    </p>
  );
}
export function Participation({ access, action }) {
  const { pathname, search } = useLocation();
  if (access.allowed || access.checking) return null;
  if (access.closed)
    return (
      <p className="text-sm text-muted">
        Community participation is temporarily closed.
      </p>
    );
  if (access.guest)
    return (
      <Link
        to="/login"
        state={{ from: pathname + search }}
        className={buttonClasses('outline', 'justify-self-start')}
      >
        Sign in to {action}
      </Link>
    );
  if (access.account?.status !== 'active')
    return (
      <p className="text-sm text-muted">
        Participation is unavailable for this account.
      </p>
    );
  return (
    <Link to="/verification-pending" className={linkText}>
      Verify your email to {action}
    </Link>
  );
}
export function MutationError({ action }) {
  return (
    action.isError && (
      <p role="alert" className="text-sm text-danger-text wrap-anywhere">
        {action.error.message}
      </p>
    )
  );
}
export function CheckboxText({ children, ...props }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" {...props} />
      {children}
    </label>
  );
}
export function Reveal({ spoiler, children }) {
  return spoiler ? (
    <details className="min-w-0 rounded-control border border-line p-3">
      <summary className="min-h-11 cursor-pointer font-semibold text-accent">
        Reveal spoiler
      </summary>
      {children}
    </details>
  ) : (
    children
  );
}
export function RetryButton({ query }) {
  return (
    query.isError && (
      <div>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  );
}
