import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import { control } from './common.jsx';
import { CompactField } from './CompactFields.jsx';
import { useDebouncedValue } from '../media/AutomaticVideo.jsx';

export function ProfileSelection({ category, label, podcast, rows, setRows }) {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const matches = useQuery({
    queryKey: ['compact-profiles', category, term],
    enabled: term.length >= 2 && term === search.trim(),
    queryFn: ({ signal }) =>
      apiClient
        .get('/talent', { signal, params: { category, q: term, limit: 8 } })
        .then(({ data }) => data),
  });
  function update(id, fields) {
    setRows(rows.map((row) => (row.id === id ? { ...row, ...fields } : row)));
  }
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="font-semibold">{label}</legend>
      <CompactField
        label="Find Talent Profiles"
        value={search}
        maxLength={80}
        type="search"
        onChange={(event) => setSearch(event.target.value)}
      />
      {term.length >= 2 && term === search.trim() && matches.isError && (
        <p role="status">Profile search is unavailable.</p>
      )}
      {term === search.trim() && matches.data?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {matches.data.map((profile) => (
            <Button
              key={profile.id}
              variant="outline"
              disabled={rows.length >= (podcast ? 40 : 60)}
              onClick={() => {
                setRows([
                  ...rows,
                  {
                    profile,
                    id: crypto.randomUUID(),
                    label: '',
                    role: 'guest',
                  },
                ]);
                setSearch('');
              }}
            >
              {profile.displayName}
            </Button>
          ))}
        </div>
      )}
      {rows.map(({ profile, id, label, role }) => (
        <div
          key={id}
          className="grid items-end gap-2 rounded-control border border-line p-2 sm:grid-cols-[1fr_1fr_auto]"
        >
          <p className="py-2 font-semibold wrap-anywhere">
            {profile.displayName}
          </p>
          {podcast ? (
            <label className="grid gap-1 text-sm">
              Association
              <select
                className={control}
                value={role}
                onChange={(event) => update(id, { role: event.target.value })}
              >
                <option value="guest">Guest</option>
                <option value="host">Host</option>
              </select>
            </label>
          ) : (
            <CompactField
              label="Custom role"
              value={label}
              required
              maxLength={100}
              onChange={(event) => update(id, { label: event.target.value })}
            />
          )}
          <Button
            variant="ghost"
            onClick={() => setRows(rows.filter((row) => row.id !== id))}
          >
            Remove
          </Button>
        </div>
      ))}
    </fieldset>
  );
}
