import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import { uploadImage } from '../media/Images.jsx';
import { protectedRequest } from '../auth/api.js';
import { useDebouncedValue } from '../media/AutomaticVideo.jsx';
import { CompactField } from './CompactFields.jsx';
import { ContentHeading } from './ContentGrid.jsx';
import { control, get, QueryState, useRecords } from './common.jsx';

const url = '/admin/media-collections';

export function MediaCollections({ category, title, nameLabel }) {
  const records = useRecords(url, { category, limit: 12 });
  const [editor, setEditor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState('');
  return (
    <>
      <ContentHeading title={title}>
        <Button onClick={() => setEditor({})}>Add Images</Button>
      </ContentHeading>
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
        <CompactField
          label="Search collections"
          name="q"
          type="search"
          maxLength={100}
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {notice && (
        <p role="status" className="text-success">
          {notice}
        </p>
      )}
      <QueryState query={records.query} empty="No image collections">
        {(rows) => (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <Card as="li" key={row.id} className="grid gap-3 p-3!">
                <img
                  src={row.images[0]?.url}
                  alt=""
                  className="aspect-video w-full rounded-control object-cover"
                />
                <h2 className="font-semibold wrap-anywhere">{row.title}</h2>
                <p className="text-sm text-muted">
                  {row.images.length}{' '}
                  {row.images.length === 1 ? 'image' : 'images'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setEditor(row)}>
                    Edit collection
                  </Button>
                  <Button variant="ghost" onClick={() => setPreview(row)}>
                    Preview
                  </Button>
                </div>
              </Card>
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
      {editor && (
        <CollectionEditor
          key={editor.id ?? 'new'}
          collection={editor}
          category={category}
          nameLabel={nameLabel}
          switchTo={setEditor}
          close={() => setEditor(null)}
          done={() => {
            setEditor(null);
            setNotice('Images saved.');
          }}
        />
      )}
      {preview && (
        <Dialog title={preview.title} open onClose={() => setPreview(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            {preview.images.map((image, index) => (
              <img
                key={image.id}
                src={image.url}
                alt={image.alt || 'Image ' + (index + 1)}
                className="rounded-control"
              />
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}

function CollectionEditor({
  collection,
  category,
  nameLabel,
  switchTo,
  close,
  done,
}) {
  const [title, setTitle] = useState(collection.title ?? '');
  const [images, setImages] = useState(collection.images ?? []);
  const [files, setFiles] = useState(collection.pendingFiles ?? []);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const client = useQueryClient();
  const q = useDebouncedValue(title.trim());
  const matches = useQuery({
    queryKey: [url, category, q],
    enabled: !collection.id && Boolean(q),
    queryFn: ({ signal }) => get(url, signal, { category, q, limit: 8 }),
  });
  async function submit(event) {
    event.preventDefault();
    if (working) return;
    if (!images.length && !files.length)
      return setError('Choose at least one image.');
    if (images.length + files.length > 24)
      return setError('Choose up to 24 images per collection.');
    setWorking(true);
    setError('');
    try {
      const saved = [...images];
      for (const file of files) {
        const { data } = await uploadImage('/admin/media', file, 'post');
        saved.push(data);
        setImages([...saved]);
        setFiles((remaining) => remaining.filter((item) => item !== file));
      }
      await protectedRequest({
        url: collection.id ? url + '/' + collection.id : url,
        method: collection.id ? 'patch' : 'post',
        data: {
          title: title.trim(),
          imageIds: saved.map(({ id }) => id),
          ...(collection.id
            ? { revision: collection.revision }
            : { category, id: requestId }),
        },
      });
      await client.invalidateQueries({ queryKey: [url] });
      done();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <Dialog
      title={collection.id ? 'Edit image collection' : 'Add Images'}
      open
      onClose={() => {
        if (!working) close();
      }}
    >
      <form className="grid gap-3" onSubmit={submit}>
        <CompactField
          label={nameLabel}
          value={title}
          required
          maxLength={100}
          disabled={working}
          onChange={(event) => setTitle(event.target.value)}
        />
        {!collection.id &&
          q === title.trim() &&
          matches.data?.data?.length > 0 && (
            <div className="grid gap-2">
              <p className="text-sm text-muted">Matching collections</p>
              {matches.data.data.map((row) => (
                <Button
                  key={row.id}
                  variant="outline"
                  disabled={working}
                  onClick={() => switchTo({ ...row, pendingFiles: files })}
                >
                  Add to {row.title}
                </Button>
              ))}
            </div>
          )}
        <label className="grid gap-1 text-sm">
          Images
          <input
            className={control}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={working}
            onChange={(event) => {
              setFiles(Array.from(event.target.files));
              event.target.value = '';
            }}
          />
        </label>
        {files.length > 0 && (
          <p className="text-sm text-muted">{files.length} images selected</p>
        )}
        {images.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {images.map((image, index) => (
              <li key={image.id} className="grid gap-1">
                <img
                  src={image.url}
                  alt={'Collection image ' + (index + 1)}
                  className="h-20 w-28 rounded-control object-cover"
                />
                <Button
                  variant="ghost"
                  disabled={working}
                  aria-label={'Remove image ' + (index + 1)}
                  onClick={() =>
                    setImages(images.filter((row) => row.id !== image.id))
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
        <Button className="w-fit" type="submit" loading={working}>
          Save Images
        </Button>
      </form>
    </Dialog>
  );
}
