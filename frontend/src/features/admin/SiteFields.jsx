import { useState } from 'react';
import { sources } from '../../../../shared/homepage.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { ImagePreview } from '../media/Images.jsx';
import { control, QueryState, useRecords } from './common.jsx';
import { MediaPicker } from './MediaPicker.jsx';

export function Field({ label, multiline, ...props }) {
  const Input = multiline ? 'textarea' : 'input';
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      {label}
      <Input className={control} {...props} />
    </label>
  );
}

export function ArtworkField({ label, image, onChange, upload }) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <h3 className="text-sm font-semibold">{label}</h3>
      {image?.url && <ImagePreview image={image} alt={image.alt || label} />}
      <MediaPicker
        label={'Choose ' + label.toLowerCase()}
        upload={upload}
        onSelect={onChange}
      />
      {image && (
        <div>
          <Button variant="outline" onClick={() => onChange(undefined)}>
            Remove {label.toLowerCase()}
          </Button>
        </div>
      )}
    </div>
  );
}

function ContentSearch({ onSelect, url, allowUpcoming }) {
  const records = useRecords(url, {
    module: 'independent',
    limit: 6,
  });
  return (
    <div className="grid min-w-0 gap-3">
      <label className="grid gap-1 text-sm">
        Content module
        <select
          className={control}
          value={records.params.module}
          onChange={(event) => records.filter('module', event.target.value)}
        >
          {Object.entries(sources).map(([module, { label }]) => (
            <option value={module} key={module}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {allowUpcoming && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={records.params.upcoming === 'true'}
            onChange={(event) =>
              records.filter('upcoming', event.target.checked ? 'true' : '')
            }
          />
          Show upcoming content
        </label>
      )}
      <form
        className="grid min-w-0 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          records.filter(
            'q',
            new FormData(event.currentTarget).get('q').trim(),
          );
        }}
      >
        <Field
          name="q"
          label="Search published content"
          type="search"
          maxLength={80}
        />
        <div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </div>
      </form>
      <QueryState query={records.query} empty="No matching published content">
        {(items) => (
          <ul className="grid gap-2">
            {items.map((item) => (
              <li className="min-w-0 wrap-anywhere" key={item.id}>
                <Button
                  variant="outline"
                  onClick={() =>
                    onSelect({
                      ...item,
                      upcoming: records.params.upcoming === 'true' || undefined,
                    })
                  }
                >
                  {item.title}
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

export function ContentPicker({
  onSelect,
  url = '/admin/site/content',
  allowUpcoming = false,
  label = 'Choose published content',
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {label}
        </Button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={label}>
        {open && (
          <ContentSearch
            url={url}
            allowUpcoming={allowUpcoming}
            onSelect={(item) => {
              onSelect(item);
              setOpen(false);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function wallTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function PromotionDates({ value, update }) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      {[
        ['startAt', 'Promotion starts'],
        ['endAt', 'Promotion ends'],
      ].map(([key, label]) => (
        <Field
          key={key}
          label={label}
          type="datetime-local"
          value={wallTime(value[key])}
          onChange={(event) =>
            update({
              [key]: event.target.value
                ? new Date(event.target.value).toISOString()
                : undefined,
            })
          }
        />
      ))}
    </div>
  );
}
