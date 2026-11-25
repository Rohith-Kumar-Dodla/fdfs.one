import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';
import { Button } from './Button.jsx';
import { Card } from './surfaces.jsx';

export function Spinner({ label = 'Loading' }) {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 text-sm text-muted"
    >
      <LoaderCircle
        aria-hidden="true"
        className="size-5 animate-spin text-accent"
      />
      {label}
    </span>
  );
}

export function Skeleton({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`min-h-4 animate-pulse rounded-control bg-surface ${className}`}
    />
  );
}

export function EmptyState({ title, description, children }) {
  return (
    <Card className="grid justify-items-start gap-3">
      <Inbox aria-hidden="true" className="size-5 text-accent" />
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && (
        <p className="text-sm leading-relaxed text-muted">{description}</p>
      )}
      {children}
    </Card>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  retrying,
}) {
  return (
    <Card className="grid justify-items-start gap-3">
      <div role="alert" className="grid gap-2">
        <AlertCircle aria-hidden="true" className="size-5 text-danger-text" />
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="text-sm leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      )}
    </Card>
  );
}
