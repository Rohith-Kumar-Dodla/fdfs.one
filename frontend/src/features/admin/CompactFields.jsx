import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { parseYouTube } from '../../../../shared/youtube.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { control, get, QueryState } from './common.jsx';
import { MediaPicker } from './MediaPicker.jsx';
import { useDebouncedValue } from '../media/AutomaticVideo.jsx';

export function CompactField({ label, area, ...props }) {
  const Input = area ? 'textarea' : 'input';
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      {label}
      <Input {...props} className={control} {...(area && { rows: 3 })} />
    </label>
  );
}

export function CompactError({ error, change }) {
  const message = error || change?.error?.message;
  return (
    message && (
      <p role="alert" className="text-sm text-danger-text">
        {message}
      </p>
    )
  );
}

export function RightsDialog({
  action,
  close,
  proceed,
  original,
  live,
  draft = false,
}) {
  return createPortal(
    <Dialog
      title={action ?? 'Confirm submission'}
      open={Boolean(action)}
      onClose={close}
    >
      <p className="mb-4 text-sm">
        Confirm that you have permission to use the selected content and
        artwork.
        {!draft && ' Verify that the video plays in an authorized embed.'}
        {original && ' Confirm this is an authorized FDFS Original.'}
        {live && ' Confirm the YouTube broadcast is currently live.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={proceed}>Confirm</Button>
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
      </div>
    </Dialog>,
    document.body,
  );
}

export function useSupportingVideos() {
  const [items, set] = useState([]);
  const change = useCallback(
    (id, title, artwork, url, pending) =>
      set((rows) =>
        rows.map((row) => {
          if (id !== row.id) return row;
          if (url !== undefined)
            return { id, url, pending: Boolean(parseYouTube(url.trim())) };
          return row.title === title &&
            row.artwork === artwork &&
            row.pending === pending
            ? row
            : { ...row, title, artwork, pending };
        }),
      ),
    [],
  );
  return [
    items,
    {
      change,
      add: () => set((rows) => [...rows, { id: crypto.randomUUID(), url: '' }]),
      remove: (id) => set((rows) => rows.filter((row) => row.id !== id)),
    },
  ];
}

export function supportingPayload(items, mainId) {
  const urls = items.filter((item) => item.url.trim());
  const ids = urls.map(
    (item) => parseYouTube(item.url.trim())?.providerVideoId,
  );
  if (ids.some((id) => !id))
    throw new Error('Enter valid YouTube links for supporting videos.');
  if (ids.includes(mainId) || new Set(ids).size !== ids.length)
    throw new Error('Use a different YouTube video for each supporting link.');
  return urls.map(({ title, url, artwork }, index) => ({
    title: title?.trim().slice(0, 100) || 'Supporting video ' + (index + 1),
    url: url.trim(),
    videoArtwork: artwork,
  }));
}

export function ArtworkField({
  category,
  title,
  label,
  images,
  setImages,
  max = 1,
}) {
  const [open, setOpen] = useState(false);
  const select = (image) => {
    setImages(
      max === 1
        ? [image]
        : [...images.filter(({ id }) => id !== image.id), image].slice(0, max),
    );
    setOpen(false);
  };
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="font-semibold">{label}</legend>
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li className="grid gap-1" key={image.id}>
              <img
                src={image.url}
                alt={image.alt || label + ' ' + (index + 1)}
                className="h-20 w-28 rounded-control object-cover"
              />
              <Button
                variant="ghost"
                aria-label={'Remove ' + label + ' ' + (index + 1)}
                onClick={() =>
                  setImages(images.filter((item) => item.id !== image.id))
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {images.length < max && (
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => setOpen(true)}
        >
          {max === 1 ? 'Choose or upload image' : 'Add image'}
        </Button>
      )}
      {open &&
        createPortal(
          <Dialog title={label} open onClose={() => setOpen(false)}>
            {category && (
              <CollectionPicker
                category={category}
                title={title}
                select={select}
              />
            )}
            <MediaPicker
              label="Browse all library images or upload"
              upload
              onSelect={select}
            />
          </Dialog>,
          document.body,
        )}
    </fieldset>
  );
}

function CollectionPicker({ category, title, select }) {
  const [search, setSearch] = useState(title ?? '');
  const q = useDebouncedValue(search.trim().slice(0, 100));
  const url = '/admin/media-collections';
  const query = useQuery({
    queryKey: [url, category, q],
    queryFn: ({ signal }) =>
      get(url, signal, { category, q: q || undefined, limit: 12 }),
  });
  return (
    <div className="mb-3 grid gap-3">
      <CompactField
        label="Find image collections"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        maxLength={100}
      />
      <QueryState query={query} empty="No matching image collections">
        {(rows) =>
          rows.map((row) => (
            <div key={row.id} className="grid gap-2">
              <h3 className="font-semibold">{row.title}</h3>
              <div className="flex flex-wrap gap-2">
                {row.images.map((image, index) => (
                  <Button
                    key={image.id}
                    variant="outline"
                    aria-label={'Select ' + row.title + ' image ' + (index + 1)}
                    onClick={() => select(image)}
                  >
                    <img
                      src={image.url}
                      alt=""
                      className="h-14 w-20 rounded-control object-cover"
                    />
                  </Button>
                ))}
              </div>
            </div>
          ))
        }
      </QueryState>
    </div>
  );
}

export function useContentNotice(navigate, target, message) {
  return () => navigate(target, { state: { contentNotice: message } });
}
