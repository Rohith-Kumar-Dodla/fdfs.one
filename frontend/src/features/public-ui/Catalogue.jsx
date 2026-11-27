import { useId, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Clapperboard,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../components/ui/states.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Container } from '../../components/ui/surfaces.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { SaveAction } from '../personal/Actions.jsx';

export const layout =
  'grid min-w-0 gap-4 min-[425px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5';
export const posters =
  'grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6';
const input =
  'min-h-11 w-full min-w-0 rounded-control border border-control bg-base px-3 py-2 text-sm';
export const pageNumber = (value) =>
  Math.max(1, Math.min(10000, Number.parseInt(value, 10) || 1));
export function useCatalogueParams(fields) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(
    fields.flatMap(({ key, options, type, min, max }) => {
      const value = params.get(key)?.trim().slice(0, 80);
      if (
        !value ||
        (options && !options.some(([item]) => String(item) === value))
      )
        return [];
      if (
        type === 'number' &&
        (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max)
      )
        return [];
      if (type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return [];
      return [[key, value]];
    }),
  );
  function update(changes, clear = []) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of clear) next.delete(key);
        if (!Object.hasOwn(changes, 'page')) next.delete('page');
        for (const [key, value] of Object.entries(changes)) {
          if (value && (key !== 'page' || Number(value) > 1))
            next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { preventScrollReset: true },
    );
  }
  return { values, params, update, page: pageNumber(params.get('page')) };
}
export function FilterDrawer({
  fields,
  values,
  apply,
  title = 'Filters',
  resetKeys = fields.map((row) => row.key),
}) {
  const [draft, setDraft] = useState(null);
  const trigger = useRef(null);
  const triggerId = useId();
  const count = Object.keys(values).filter((key) =>
    fields.some((entry) => entry.key === key),
  ).length;
  const open = Boolean(draft);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      trigger.current?.focus();
    };
  }, [open]);
  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count ? 'Filters (' + count + ' active)' : 'Filters'}
        id={triggerId}
        className="shrink-0"
        onClick={() => setDraft({ ...values })}
      >
        <SlidersHorizontal aria-hidden="true" className="size-5" />
        <span className="hidden sm:inline">Filters</span>
        {count > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-xs text-ink">
            {count}
          </span>
        )}
      </Button>
      <Dialog
        open={open}
        onClose={() => setDraft(null)}
        title={title}
        className="mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-lg rounded-b-none sm:my-auto sm:mr-3 sm:rounded-panel"
      >
        {draft && (
          <form
            className="grid min-w-0 gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              apply(draft);
              setDraft(null);
            }}
          >
            {fields.map(
              ({ key, label, type = 'search', options, min, max }) => (
                <label
                  className="grid min-w-0 gap-1 text-sm font-medium"
                  key={key}
                >
                  {label}
                  {options ? (
                    <select
                      className={input}
                      value={draft[key] ?? ''}
                      onChange={(event) =>
                        setDraft({ ...draft, [key]: event.target.value })
                      }
                    >
                      <option value="">Any</option>
                      {options.map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={input}
                      value={draft[key] ?? ''}
                      type={type}
                      min={min}
                      max={max}
                      maxLength={80}
                      onChange={(event) =>
                        setDraft({ ...draft, [key]: event.target.value })
                      }
                    />
                  )}
                </label>
              ),
            )}
            <div className="sticky bottom-0 flex flex-wrap gap-2 bg-surface py-2">
              <Button type="submit">Apply Filters</Button>
              <Button
                variant="outline"
                onClick={() => {
                  apply(Object.fromEntries(resetKeys.map((key) => [key, ''])));
                  setDraft(null);
                }}
              >
                Reset Filters
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
export function CatalogueHeading({ title, description, actions, children }) {
  return (
    <header className="grid min-w-0 gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[clamp(1.85rem,5vw,3.7rem)] leading-[1.05] font-extrabold tracking-[-.05em] wrap-anywhere">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </header>
  );
}
export function PublicCatalogue({ children }) {
  return (
    <Container className="grid max-w-[112rem]! min-w-0 gap-7 py-8 sm:gap-10 sm:py-12">
      {children}
    </Container>
  );
}
export function CatalogueCard({
  title,
  path,
  image,
  landscape,
  metadata = [],
  rating,
  status,
  live = false,
  description,
  action,
  save,
  sizes,
}) {
  const statusId = useId();
  const score =
    typeof rating === 'number'
      ? rating
      : rating?.count > 0
        ? rating.average
        : null;
  return (
    <article className="group relative grid min-w-0 content-start gap-1.5 wrap-anywhere">
      <Link
        to={path}
        aria-label={title}
        aria-describedby={status ? statusId : undefined}
        className="group/art grid min-w-0 gap-2.5 rounded-control focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="relative min-w-0 overflow-hidden rounded-panel bg-surface group-hover/art:brightness-110 motion-safe:transition">
          <FilmImage
            image={image}
            landscape={landscape}
            sizes={
              sizes ?? '(min-width: 1280px) 22vw, (min-width: 425px) 47vw, 95vw'
            }
          />
          {status && (
            <span
              id={statusId}
              className={
                'absolute top-2 left-2 rounded-control px-2 py-1 text-xs font-bold ' +
                (live ? 'bg-red-700 text-white' : 'bg-nav text-foreground')
              }
            >
              {status}
            </span>
          )}
        </div>
        <h3 className="leading-snug font-bold group-hover/art:text-accent">
          {title}
        </h3>
      </Link>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        {metadata.filter(Boolean).length > 0 && (
          <span>{metadata.filter(Boolean).join(' · ')}</span>
        )}
        {Number.isFinite(score) && (
          <span
            className="inline-flex items-center gap-1 font-semibold text-accent"
            aria-label={score.toFixed(1) + ' out of 5'}
          >
            <Star className="size-3.5 fill-current" aria-hidden="true" />
            {score.toFixed(1)}
          </span>
        )}
      </div>
      {description && (
        <p className="line-clamp-2 text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {(action || save) && (
        <div className="flex flex-wrap items-start gap-2">
          {action && (
            <Link
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent hover:underline"
              to={action.to}
            >
              {action.label}
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </Link>
          )}
          {save && <SaveAction item={save} />}
        </div>
      )}
    </article>
  );
}
export function PublicEmpty({ message, Icon = Clapperboard }) {
  return (
    <div
      className="flex min-h-27 items-center gap-3 rounded-panel bg-surface/40 p-4 text-muted"
      role="status"
    >
      <Icon aria-hidden="true" className="size-6 shrink-0 text-accent" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
export function CatalogueResults({
  query,
  page,
  onPage,
  empty,
  filtered,
  children,
  landscape,
  grid = landscape ? layout : posters,
}) {
  if (query.isPending)
    return (
      <div className={grid} role="status" aria-label="Loading catalogue">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton
            key={i}
            className={landscape ? 'aspect-video' : 'aspect-[2/3]'}
          />
        ))}
      </div>
    );
  if (query.isError)
    return (
      <ErrorState
        title="Could not load the catalogue"
        description="Check your connection and try again."
        onRetry={() => void query.refetch()}
      />
    );
  const rows = Array.isArray(query.data?.data) ? query.data.data : [];
  if (!rows.length)
    return (
      <>
        <EmptyState
          title={filtered ? 'No results match your filters.' : empty}
        />
        {page > 1 && (
          <div>
            <Button variant="outline" onClick={() => onPage(1)}>
              Return to first page
            </Button>
          </div>
        )}
      </>
    );
  return (
    <>
      <div className={grid}>{rows.map(children)}</div>
      {query.data.pagination && (
        <Pagination
          page={page}
          totalPages={query.data.pagination.totalPages}
          onPageChange={onPage}
        />
      )}
    </>
  );
}
export const actionStyle = buttonClasses('outline');
