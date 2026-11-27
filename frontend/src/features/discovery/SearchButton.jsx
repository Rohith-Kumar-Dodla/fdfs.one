import { useEffect, useId, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { sources } from '../../../../shared/homepage.js';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Spinner } from '../../components/ui/states.jsx';
import { accepted, control, field, url, useSearch } from './search-query.js';

function Suggestions({ close }) {
  const [draft, setDraft] = useState('');
  const [q, setQuery] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const navigate = useNavigate();
  const id = useId();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft.trim()), 275);
    return () => clearTimeout(timer);
  }, [draft]);
  const result = useSearch(
    '/search/suggestions',
    { q },
    accepted(q) && q === draft.trim(),
  );
  const options =
    q === draft.trim()
      ? (result.data?.groups ?? []).flatMap((group) => group.items)
      : [];
  const active = options[highlight];
  function choose(path) {
    close();
    navigate(path);
  }
  function keys(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((index) =>
        index < 0
          ? step === 1
            ? 0
            : options.length - 1
          : (index + step + options.length) % options.length,
      );
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
      choose(active.path);
    }
  }
  return (
    <form
      role="search"
      className="grid min-w-0 gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const value = draft.trim();
        if (accepted(value)) choose(url({ q: value }));
      }}
    >
      <label className={field}>
        Search FDFS
        <input
          autoFocus
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={options.length > 0}
          aria-controls={id}
          aria-activedescendant={active ? id + '-' + highlight : undefined}
          className={control}
          value={draft}
          autoComplete="off"
          maxLength={80}
          onChange={(event) => {
            setDraft(event.target.value);
            setHighlight(-1);
          }}
          onKeyDown={keys}
        />
      </label>
      <ul
        id={id}
        role="listbox"
        aria-label="Search suggestions"
        hidden={!options.length}
        className="max-h-64 overflow-y-auto"
      >
        {options.map((item, i) => (
          <li
            key={item.id}
            id={id + '-' + i}
            role="option"
            aria-selected={i === highlight}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => choose(item.path)}
            className={
              'grid min-h-11 cursor-pointer gap-1 rounded-control p-2 wrap-anywhere ' +
              (i === highlight ? 'bg-accent/15' : 'hover:bg-base')
            }
          >
            <strong>{item.title}</strong>
            <span className="text-xs text-muted">
              {sources[item.module]?.label}
            </span>
          </li>
        ))}
      </ul>
      {accepted(q) && q === draft.trim() && result.isFetching && (
        <Spinner label="Searching FDFS" />
      )}
      {accepted(q) && result.isSuccess && !options.length && (
        <p className="text-sm text-muted">No matching suggestions.</p>
      )}
      {result.isError && (
        <p role="status" className="text-sm text-muted">
          Suggestions are unavailable. You can still open search results.
        </p>
      )}
      <Button
        type="submit"
        disabled={!accepted(draft.trim())}
        className="justify-self-start"
      >
        View search results
      </Button>
    </form>
  );
}
export function GlobalSearchButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        label="Open search"
        variant="ghost"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden="true" className="size-5" />
      </IconButton>
      <Dialog title="Search FDFS" open={open} onClose={() => setOpen(false)}>
        {open && <Suggestions close={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}
