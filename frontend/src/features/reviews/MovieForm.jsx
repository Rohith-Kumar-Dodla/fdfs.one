import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { genres, languages } from '../../../../shared/films.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { MediaPicker } from '../admin/MediaPicker.jsx';
import { control } from '../admin/common.jsx';
import { FilmCredits } from '../films/Form.jsx';
import { ImagePreview, ImageUpload, uploadImage } from '../media/Images.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/surfaces.jsx';

export const movieGenres = { ...genres, ...reviewGenres };
const label = 'grid min-w-0 gap-1 text-sm';
const grid = 'grid min-w-0 gap-3 sm:grid-cols-2';
function Item({
  name,
  title,
  initial,
  type = 'text',
  maxLength,
  min,
  max,
  step,
  required,
}) {
  return (
    <label className={label}>
      {title}
      <input
        className={control}
        name={name}
        type={type}
        defaultValue={initial}
        maxLength={maxLength}
        min={min}
        max={max}
        step={step}
        required={required}
      />
    </label>
  );
}
function LongText({ name, title, initial, maxLength, rows }) {
  return (
    <label className={label}>
      {title}
      <textarea
        className={control}
        name={name}
        defaultValue={initial}
        maxLength={maxLength}
        rows={rows}
      />
    </label>
  );
}
function OptionList({ values }) {
  return Object.entries(values).map(([key, value]) => (
    <option key={key} value={key}>
      {value}
    </option>
  ));
}
function Checks({ name, title, values, selected }) {
  return (
    <fieldset className="grid min-w-0 gap-1 sm:grid-cols-2 xl:grid-cols-3">
      <legend className="mb-2 font-semibold">{title}</legend>
      {Object.entries(values).map(([key, value]) => (
        <label
          className="flex min-h-11 min-w-0 items-center gap-2 text-sm"
          key={key}
        >
          <input
            type="checkbox"
            name={name}
            value={key}
            defaultChecked={selected?.includes(key)}
          />
          {value}
        </label>
      ))}
    </fieldset>
  );
}
function Artwork({ name, images, select, remove, max }) {
  const client = useQueryClient();
  const selected = images.length >= max;
  return (
    <Card className="grid min-w-0 content-start gap-3">
      <h3 className="font-semibold">{name}</h3>
      {images.map((image, i) => (
        <div className="grid min-w-0 gap-2" key={image.id}>
          <ImagePreview image={image} alt={image.alt || name} />
          <Button
            variant="outline"
            className="justify-self-start"
            onClick={() => remove(image.id)}
          >
            Remove {name.toLowerCase()}
            {max > 1 ? ' ' + (i + 1) : ''}
          </Button>
        </div>
      ))}
      {(!selected || max === 1) && (
        <>
          <MediaPicker
            label={'Choose ' + name.toLowerCase() + ' from library'}
            onSelect={select}
          />
          <ImageUpload
            label={'Choose ' + name.toLowerCase() + ' file'}
            onUpload={async (file) => {
              const { data } = await uploadImage('/admin/media', file, 'post');
              select(data);
              void client.invalidateQueries({ queryKey: ['/admin/media'] });
            }}
          />
        </>
      )}
    </Card>
  );
}
function Repeatable({ title, initial, name, fields, maximum }) {
  const [rows, setRows] = useState(() =>
    initial.map((item) => ({ ...item, key: crypto.randomUUID() })),
  );
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="mb-2 font-semibold">{title}</legend>
      {rows.map(({ key, ...item }) => (
        <div
          className="grid min-w-0 gap-2 rounded-control border border-line p-3"
          key={key}
          data-movie-row={name}
        >
          <div className={grid}>
            {fields.map((field) => (
              <Item key={field.name} {...field} initial={item[field.name]} />
            ))}
          </div>
          <Button
            className="justify-self-start"
            variant="outline"
            onClick={() =>
              setRows((current) => current.filter((row) => row.key !== key))
            }
          >
            Remove {name}
          </Button>
        </div>
      ))}
      <Button
        className="justify-self-start"
        variant="outline"
        disabled={rows.length >= maximum}
        onClick={() =>
          setRows((current) => [...current, { key: crypto.randomUUID() }])
        }
      >
        Add {name}
      </Button>
    </fieldset>
  );
}
const parts = (raw) =>
  raw
    ? raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
const rowValues = (form, name) =>
  Array.from(
    form.querySelectorAll('[data-movie-row="' + name + '"]'),
    (element) =>
      Object.fromEntries(
        [...element.querySelectorAll('[name]')].map((input) => [
          input.name,
          input.value.trim() || undefined,
        ]),
      ),
  );

export function MovieForm({ record = {}, save, pending, error }) {
  const [poster, setPoster] = useState(record.poster);
  const [backdrop, setBackdrop] = useState(record.backdrop);
  const [gallery, setGallery] = useState(record.gallery ?? []);
  const creditForm = useForm({
    defaultValues: {
      credits: (record.credits ?? []).map(({ name, ...item }) => ({
        ...item,
        displayName: name,
      })),
    },
  });
  const credits = useFieldArray({
    control: creditForm.control,
    name: 'credits',
  });
  const [metadata, setMetadata] = useState(Boolean(record.metadata));
  function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key) => data.get(key)?.trim() || undefined;
    const number = (key) => (value(key) ? Number(value(key)) : undefined);
    const plain = [
      'title',
      'originalTitle',
      'synopsis',
      'description',
      'releaseDate',
      'language',
      'advisory',
      'trailerUrl',
    ];
    save({
      ...Object.fromEntries(plain.map((key) => [key, value(key)])),
      ...(record.id ? { revision: record.revision } : { slug: value('slug') }),
      releaseYear: number('releaseYear'),
      runtimeMinutes: number('runtimeMinutes'),
      genres: data.getAll('genres'),
      languages: data.getAll('languages'),
      countries: parts(value('countries')).map((x) => x.toUpperCase()),
      companies: parts(value('companies')),
      awards: rowValues(form, 'award').map((row) => ({
        ...row,
        year: row.year ? Number(row.year) : undefined,
      })),
      links: rowValues(form, 'link'),
      posterId: poster?.id,
      backdropId: backdrop?.id,
      galleryIds: gallery.map((image) => image.id),
      artworkAuthorized: data.has('artworkAuthorized'),
      trailerAuthorized: data.has('trailerAuthorized'),
      credits: creditForm
        .getValues('credits')
        .map(({ personalityId, role, character, department }) => ({
          personalityId,
          role,
          character: character?.trim() || undefined,
          department: department?.trim() || undefined,
        })),
      metadata: metadata
        ? {
            provider: value('provider'),
            id: value('providerId'),
            attribution: value('attribution'),
            externalRating: number('externalRating'),
            scale: number('scale'),
          }
        : undefined,
    });
  }
  return (
    <>
      <section aria-label="Movie artwork" className={grid}>
        <Artwork
          name="Poster"
          images={poster ? [poster] : []}
          select={setPoster}
          remove={() => setPoster(undefined)}
          max={1}
        />
        <Artwork
          name="Backdrop"
          images={backdrop ? [backdrop] : []}
          select={setBackdrop}
          remove={() => setBackdrop(undefined)}
          max={1}
        />
        <Artwork
          name="Gallery"
          images={gallery}
          select={(image) =>
            setGallery((current) =>
              current.length < 12 && !current.some((x) => x.id === image.id)
                ? [...current, image]
                : current,
            )
          }
          remove={(id) =>
            setGallery((current) => current.filter((x) => x.id !== id))
          }
          max={12}
        />
      </section>
      <form onSubmit={submit} className="grid min-w-0 gap-4">
        <Card className="grid min-w-0 gap-3">
          <h2 className="text-lg font-semibold">Movie metadata</h2>
          <div className={grid}>
            <Item
              name="title"
              title="Title"
              initial={record.title}
              maxLength={140}
              required
            />
            <Item
              name="originalTitle"
              title="Original title"
              initial={record.originalTitle}
              maxLength={140}
            />
            {!record.id && (
              <Item name="slug" title="Public slug (optional)" maxLength={90} />
            )}
            <Item
              name="releaseDate"
              title="Release date"
              type="date"
              initial={record.releaseDate}
            />
            <Item
              name="releaseYear"
              title="Release year"
              type="number"
              min={1888}
              max={2100}
              initial={record.releaseYear}
            />
            <Item
              name="runtimeMinutes"
              title="Runtime in minutes"
              type="number"
              min={1}
              max={1440}
              initial={record.runtimeMinutes}
            />
            <label className={label}>
              Original language
              <select
                name="language"
                className={control}
                defaultValue={record.language ?? ''}
              >
                <option value="">Unknown</option>
                <OptionList values={languages} />
              </select>
            </label>
            <Item
              name="countries"
              title="Production countries (comma-separated two-letter codes)"
              initial={record.countries?.join(', ')}
            />
            <Item
              name="companies"
              title="Production companies (comma-separated)"
              initial={record.companies?.join(', ')}
            />
            <Item
              name="advisory"
              title="Certification or content advisory"
              initial={record.advisory}
              maxLength={300}
            />
          </div>
          <LongText
            name="synopsis"
            title="Short synopsis"
            initial={record.synopsis}
            maxLength={280}
            rows={3}
          />
          <LongText
            name="description"
            title="Detailed description"
            initial={record.description}
            maxLength={6000}
            rows={6}
          />
          <Checks
            name="genres"
            title="Genres"
            values={movieGenres}
            selected={record.genres}
          />
          <Checks
            name="languages"
            title="Available languages"
            values={languages}
            selected={record.languages}
          />
        </Card>
        <Card className="grid min-w-0 gap-3">
          <h2 className="text-lg font-semibold">Trailer and rights</h2>
          <Item
            name="trailerUrl"
            type="url"
            title="Official YouTube trailer URL"
            maxLength={2048}
            initial={record.trailerUrl}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              name="artworkAuthorized"
              type="checkbox"
              defaultChecked={record.artworkAuthorized}
            />
            I have authorization to publish the selected artwork.
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              name="trailerAuthorized"
              type="checkbox"
              defaultChecked={record.trailerAuthorized}
            />
            I have authorization to publish the trailer.
          </label>
        </Card>
        <Card className="grid min-w-0 gap-3">
          <FilmCredits
            {...credits}
            register={creditForm.register}
            maximum={80}
            staffSearch="/admin/movies/credit-talent"
          />
        </Card>
        <Card className="grid min-w-0 gap-4">
          <Repeatable
            name="award"
            title="Awards"
            initial={record.awards ?? []}
            maximum={20}
            fields={[
              {
                name: 'title',
                title: 'Award title',
                maxLength: 140,
                required: true,
              },
              { name: 'organization', title: 'Organization', maxLength: 120 },
              {
                name: 'year',
                title: 'Award year',
                type: 'number',
                min: 1888,
                max: 2100,
              },
              {
                name: 'source',
                title: 'Award source URL',
                type: 'url',
                maxLength: 2048,
              },
            ]}
          />
          <Repeatable
            name="link"
            title="Official links"
            initial={record.links ?? []}
            maximum={12}
            fields={[
              {
                name: 'label',
                title: 'Link label',
                maxLength: 80,
                required: true,
              },
              {
                name: 'url',
                title: 'Official HTTPS URL',
                type: 'url',
                maxLength: 2048,
                required: true,
              },
            ]}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={metadata}
              onChange={(event) => setMetadata(event.target.checked)}
            />
            Record an authorized metadata source
          </label>
          {metadata && (
            <div className={grid}>
              <label className={label}>
                Provider
                <select
                  name="provider"
                  className={control}
                  defaultValue={record.metadata?.provider ?? 'other'}
                >
                  <option value="other">Other</option>
                  <option value="tmdb">TMDB</option>
                </select>
              </label>
              <Item
                name="providerId"
                title="External identifier"
                initial={record.metadata?.id}
                maxLength={80}
                required
              />
              <Item
                name="attribution"
                title="Source attribution"
                initial={record.metadata?.attribution}
                maxLength={240}
                required
              />
              <Item
                name="externalRating"
                title="External rating (optional)"
                type="number"
                step="any"
                min={0}
                initial={record.metadata?.externalRating}
              />
              <Item
                name="scale"
                title="External rating scale"
                type="number"
                step="any"
                min={0}
                initial={record.metadata?.scale}
              />
            </div>
          )}
        </Card>
        <Button className="justify-self-start" type="submit" loading={pending}>
          {record.status === 'published'
            ? 'Save published movie'
            : 'Save movie draft'}
        </Button>
        {error && (
          <div role="alert" className="text-danger-text wrap-anywhere">
            <p>{error.message}</p>
            {Array.isArray(error.details) && (
              <ul>
                {error.details.map(({ path, message }, i) => (
                  <li key={i}>
                    {path.replace(/^body[.]/, '')} · {message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>
    </>
  );
}
