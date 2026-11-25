import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import {
  EmptyState,
  ErrorState,
  Spinner,
} from '../../components/ui/states.jsx';
import { protectedRequest } from '../auth/api.js';

export const get = (url, signal, params) =>
  protectedRequest({ url, signal, params });
export const date = (value) => (value ? new Date(value).toLocaleString() : '—');
export const readable = (value) =>
  value.replaceAll('_', ' ').replaceAll('.', ' · ');
export const control =
  'min-h-11 w-full min-w-0 rounded-control border border-line bg-base px-3 py-2 text-sm text-foreground';

export function Select({ label, options, value, onChange }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      {label}
      <select
        className={control}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function useRecords(url) {
  const [params, setParams] = useState({ page: 1 });
  const query = useQuery({
    queryKey: [url, params],
    queryFn: ({ signal }) => get(url, signal, params),
  });
  function filter(key, value) {
    setParams((current) => ({
      ...current,
      page: 1,
      [key]: value || undefined,
    }));
  }
  return {
    query,
    params,
    filter,
    changePage: (page) => setParams((current) => ({ ...current, page })),
  };
}

export function QueryState({ query, empty, children }) {
  if (query.isPending) return <Spinner label="Loading records" />;
  if (query.isError)
    return (
      <ErrorState
        title="Could not load records"
        description={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  if (query.data.data.length === 0)
    return <EmptyState title={empty ?? 'No records found'} />;
  return children(query.data.data);
}

export function Records({ records, columns, label, empty }) {
  const { query, params, changePage } = records;
  return (
    <>
      <QueryState query={query} empty={empty}>
        {(rows) => (
          <>
            <div className="hidden lg:block">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <caption className="sr-only">{label}</caption>
                <thead className="bg-surface">
                  <tr>
                    {columns.map(({ title }) => (
                      <th key={title} scope="col" className="p-3">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-line">
                      {columns.map(({ title, render }) => (
                        <td key={title} className="p-3 align-top wrap-anywhere">
                          {render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="grid gap-3 lg:hidden" aria-label={label}>
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="min-w-0 rounded-panel border border-line bg-surface p-4"
                >
                  <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 text-sm">
                    {columns.map(({ title, render }) => (
                      <div key={title} className="contents">
                        <dt className="wrap-anywhere text-muted">{title}</dt>
                        <dd className="min-w-0 wrap-anywhere">{render(row)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryState>
      {query.data && (
        <Pagination
          page={params.page}
          totalPages={query.data.pagination.totalPages}
          onPageChange={changePage}
        />
      )}
      {query.data && params.page > 1 && query.data.data.length === 0 && (
        <Button variant="outline" onClick={() => changePage(1)}>
          Return to first page
        </Button>
      )}
    </>
  );
}

export function DetailLink({ to, children }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center font-semibold text-accent underline"
    >
      {children}
    </Link>
  );
}

export function useChange(keys, onSuccess) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request) => protectedRequest(request),
    async onSuccess(result) {
      await Promise.all(
        keys.map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
      onSuccess?.(result);
    },
  });
}

export function ConfirmAction({ action, onClose, change }) {
  return (
    <Dialog
      open={Boolean(action)}
      onClose={() => {
        if (!change.isPending) onClose();
      }}
      title={action?.title ?? 'Confirm action'}
    >
      {action?.description && (
        <p className="mb-4 wrap-anywhere text-sm text-muted">
          {action.description}
        </p>
      )}
      {change.isError && (
        <p role="alert" className="mb-4 text-sm text-danger-text">
          {change.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={change.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={change.isPending}
          onClick={() => change.mutate(action.request, { onSuccess: onClose })}
        >
          Confirm
        </Button>
      </div>
    </Dialog>
  );
}
