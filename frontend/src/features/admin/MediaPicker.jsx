import { useState } from 'react';
import { mediaCategories } from '../../../../shared/site.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { ImagePreview, ImageUpload, uploadImage } from '../media/Images.jsx';
import { control, QueryState, Select, useRecords } from './common.jsx';

export function MediaFilters({ records }) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <form
        className="flex min-w-0 flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          records.filter(
            'q',
            new FormData(event.currentTarget).get('q').trim(),
          );
        }}
      >
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          Search media
          <input name="q" type="search" maxLength={80} className={control} />
        </label>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <Select
        label="Media category"
        options={Object.entries(mediaCategories)}
        value={records.params.category ?? ''}
        onChange={(value) => records.filter('category', value)}
      />
    </div>
  );
}

function LibrarySelection({ onSelect }) {
  const records = useRecords('/admin/media', { limit: 6, library: 'true' });
  return (
    <div className="grid gap-3">
      <MediaFilters records={records} />
      <QueryState query={records.query} empty="No matching library images">
        {(items) => (
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
            {items.map((image) => (
              <li
                key={image.id}
                className="grid min-w-0 gap-2 rounded-control border border-line p-2"
              >
                <ImagePreview
                  image={image}
                  alt={image.alt || 'Library image'}
                />
                <Button variant="outline" onClick={() => onSelect(image)}>
                  {image.title ? 'Select ' + image.title : 'Select image'}
                </Button>
              </li>
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
    </div>
  );
}

export function MediaPicker({ label, onSelect, upload = false }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {label ?? 'Choose from media library'}
        </Button>
      </div>
      <Dialog
        open={open}
        title={label ?? 'Choose from media library'}
        onClose={() => setOpen(false)}
      >
        {open && upload && (
          <div className="mb-4">
            <ImageUpload
              label="Upload new library artwork"
              onUpload={async (file) => {
                const { data } = await uploadImage(
                  '/admin/media',
                  file,
                  'post',
                );
                onSelect(data.image ?? data);
                setOpen(false);
              }}
            />
          </div>
        )}
        {open && (
          <LibrarySelection
            onSelect={(image) => {
              onSelect(image);
              setOpen(false);
            }}
          />
        )}
      </Dialog>
    </>
  );
}
