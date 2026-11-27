import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { participantRoles } from '../../../../shared/podcasts.js';
import { professions } from '../../../../shared/talent.js';
import { can } from '../../../../shared/admin.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import {
  control,
  get,
  QueryState,
  useChange,
  useRecords,
} from '../admin/common.jsx';

const modules = [
  ['movies', 'Movies', '/admin/movies'],
  ['independent', 'Cinema', '/admin/films'],
  ['original', 'Originals', '/admin/films'],
  ['podcasts', '404 episodes', '/admin/podcasts/episodes'],
];

export function TalentCredits({ profile, account }) {
  const available = modules.filter(([key]) => can(account, 'content', key));
  const [module, select] = useState(available[0]?.[0]);
  const match = available.find(([key]) => key === module);
  if (!match) return null;
  return (
    <Card className="grid gap-3">
      <h2 className="text-lg font-semibold">Content credits</h2>
      <label className="grid gap-1 text-sm">
        Content module
        <select
          className={control}
          value={module}
          onChange={(event) => select(event.target.value)}
        >
          {available.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <FindContent
        profile={profile}
        key={module}
        module={module}
        catalogue={match[2]}
      />
    </Card>
  );
}

function FindContent({ profile, module, catalogue }) {
  const [target, select] = useState(null);
  const records = useRecords(catalogue, {
    limit: 8,
    ...(catalogue === '/admin/films' && { classification: module }),
  });
  return (
    <>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          records.filter(
            'q',
            new FormData(event.currentTarget).get('q').trim(),
          );
        }}
      >
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          Find content
          <input className={control} type="search" name="q" maxLength={80} />
        </label>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <QueryState query={records.query} empty="No matching content">
        {(rows) => (
          <div className="flex flex-wrap gap-2">
            {rows.map((row) => (
              <Button
                key={row.id}
                variant={target?.id === row.id ? 'primary' : 'outline'}
                aria-pressed={target?.id === row.id}
                className="wrap-anywhere"
                onClick={() => select(row)}
              >
                {row.title}
              </Button>
            ))}
          </div>
        )}
      </QueryState>
      {records.query.data && (
        <Pagination
          page={records.params.page}
          totalPages={records.query.data.pagination.totalPages}
          onPageChange={records.changePage}
        />
      )}
      {target && (
        <CreditEditor
          key={target.id}
          profile={profile}
          target={target}
          module={module}
          catalogue={catalogue}
        />
      )}
    </>
  );
}

function CreditEditor({ profile, target, module, catalogue }) {
  const url =
    '/admin/talent/' + profile.id + '/credits/' + module + '/' + target.id;
  const query = useQuery({
    queryKey: [url],
    queryFn: ({ signal }) => get(url, signal),
  });
  const change = useChange([
    url,
    catalogue,
    'talent',
    '/admin/audit',
    'homepage-discovery',
  ]);
  return (
    <QueryState query={query}>
      {(record) => (
        <CreditForm
          key={record.revision}
          record={record}
          module={module}
          title={target.title}
          published={profile.status === 'published'}
          change={change}
          save={(rows) =>
            change.mutate({
              url,
              method: 'put',
              data: { revision: record.revision, rows },
            })
          }
        />
      )}
    </QueryState>
  );
}

function CreditForm({ record, module, title, published, change, save }) {
  const podcast = module === 'podcasts';
  const roles = podcast ? participantRoles : professions;
  const [rows, setRows] = useState(() =>
    record.rows.map((row) => ({ ...row, id: crypto.randomUUID() })),
  );
  const patch = (id, values) =>
    setRows((items) =>
      items.map((item) => (item.id === id ? { ...item, ...values } : item)),
    );
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save(
          rows.map((row) =>
            podcast
              ? {
                  role: row.role,
                  introduction: row.introduction?.trim() || undefined,
                }
              : {
                  role: row.role,
                  character: row.character?.trim() || undefined,
                  department: row.department?.trim() || undefined,
                },
          ),
        );
      }}
    >
      <h3 className="font-semibold wrap-anywhere">{title}</h3>
      {!record.editable && (
        <p className="text-sm text-muted">These credits are read-only.</p>
      )}
      <fieldset
        disabled={!record.editable || change.isPending}
        className="grid min-w-0 gap-3"
      >
        <legend className="sr-only">Credits for {title}</legend>
        {rows.map((row) => (
          <div key={row.id} className="grid gap-2 border-l-2 border-line pl-3">
            <label className="grid gap-1 text-sm">
              Role
              <select
                className={control}
                value={row.role}
                onChange={(event) =>
                  patch(row.id, { role: event.target.value })
                }
              >
                {Object.entries(roles).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {podcast ? (
              <label className="grid gap-1 text-sm">
                Introduction
                <input
                  className={control}
                  maxLength={300}
                  value={row.introduction ?? ''}
                  onChange={(event) =>
                    patch(row.id, { introduction: event.target.value })
                  }
                />
              </label>
            ) : (
              <label className="grid gap-1 text-sm">
                Custom role or character name
                <input
                  className={control}
                  maxLength={100}
                  value={row.character ?? ''}
                  onChange={(event) =>
                    patch(row.id, { character: event.target.value })
                  }
                />
              </label>
            )}
            <Button
              className="w-fit"
              variant="outline"
              onClick={() =>
                setRows((items) => items.filter((item) => item.id !== row.id))
              }
            >
              Remove credit
            </Button>
          </div>
        ))}
        {!published && (
          <p className="text-sm text-muted">
            Publish this profile to add credits.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!published || rows.length >= 20}
            onClick={() =>
              setRows((items) => [
                ...items,
                { role: podcast ? 'guest' : 'actor', id: crypto.randomUUID() },
              ])
            }
          >
            Add credit
          </Button>
          <Button type="submit" loading={change.isPending}>
            Save credits
          </Button>
        </div>
      </fieldset>
      {change.isError && (
        <p role="alert" className="text-sm text-danger-text">
          {change.error.message}
        </p>
      )}
      {change.isSuccess && (
        <p role="status" className="text-sm text-success">
          Credits saved.
        </p>
      )}
    </form>
  );
}
