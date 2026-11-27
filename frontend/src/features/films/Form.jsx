import { GalleryOrder } from '../media/GalleryOrder.jsx';
import {
  PublicationFields,
  publicationValues,
} from '../admin/PublicationFields.jsx';
import { YouTubeDetails } from '../media/YouTubeDetails.jsx';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { genres, languages } from '../../../../shared/films.js';
import { professions } from '../../../../shared/talent.js';
import { parseYouTube } from '../../../../shared/youtube.js';
import { apiClient } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import {
  Checkbox,
  Select,
  Textarea,
  TextInput,
} from '../../components/ui/fields.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import { MediaPicker } from '../admin/MediaPicker.jsx';
import { ImageUpload, uploadImage } from '../media/Images.jsx';
import { protectedRequest } from '../auth/api.js';
import { FilmImage } from './FilmImage.jsx';

const trim = (value) => value?.trim() || undefined;
const labels = (items) =>
  Object.entries(items).map(([value, label]) => (
    <option value={value} key={value}>
      {label}
    </option>
  ));
const validDraft = z.object({
  title: z.string().min(1).max(140),
  synopsis: z.string().min(1).max(280),
  genres: z
    .array(z.enum(Object.keys(genres)))
    .min(1)
    .max(5),
  runtimeMinutes: z.number().int().min(1).max(300),
  releaseYear: z.number().int().min(1888).max(2100).optional(),
});

function Field({ label, children }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FilmMedia({ admin, record, images = [], value, change }) {
  const [uploaded, setUploaded] = useState(images);
  const [supporting, setSupporting] = useState(null);
  const endpoint = admin ? '/admin/media' : '/submissions/film-images';
  async function upload(file) {
    const { data } = await uploadImage(endpoint, file, 'post');
    setUploaded((current) => [...current, data]);
    return data;
  }
  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {['poster', 'banner'].map((field) => {
          const title = field === 'poster' ? 'Poster' : 'Banner';
          const id = value[field + 'Id'];
          const image =
            uploaded.find((entry) => entry.id === id) ??
            (id === record?.[field + 'Id'] ? record?.[field] : null);
          return (
            <Card className="grid min-w-0 gap-3" key={field}>
              <h3 className="font-semibold">{title}</h3>
              {image && (
                <div className={field === 'poster' ? 'max-w-32' : ''}>
                  <FilmImage image={image} landscape={field === 'banner'} />
                </div>
              )}
              {admin && (
                <Field label={title + ' media ID'}>
                  <TextInput
                    value={id}
                    onChange={(event) => {
                      const id = event.target.value;
                      change((current) => ({ ...current, [field + 'Id']: id }));
                    }}
                  />
                </Field>
              )}
              {admin && (
                <MediaPicker
                  label={'Select ' + field + ' from library'}
                  onSelect={(image) => {
                    setUploaded((current) => [...current, image]);
                    change((current) => ({
                      ...current,
                      [field + 'Id']: image.id,
                    }));
                  }}
                />
              )}
              {id && (
                <div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      change((current) => ({ ...current, [field + 'Id']: '' }))
                    }
                  >
                    Remove {field}
                  </Button>
                </div>
              )}
              <ImageUpload
                label={'Choose ' + field}
                onUpload={async (file) => {
                  const image = await upload(file);
                  change((current) => ({
                    ...current,
                    [field + 'Id']: image.id,
                  }));
                }}
              />
            </Card>
          );
        })}
      </div>
      <Card className="grid min-w-0 gap-3">
        <h3 className="font-semibold">Gallery and supporting images</h3>
        <GalleryOrder
          ids={value.galleryIds}
          library={admin}
          images={uploaded}
          change={(galleryIds) =>
            change((current) => ({ ...current, galleryIds }))
          }
        />
        <ImageUpload
          label="Choose gallery image"
          onUpload={async (file) => {
            if (value.galleryIds.length >= 8)
              throw Error('A film can have up to eight gallery images.');
            const image = await upload(file);
            change((current) => ({
              ...current,
              galleryIds: [...current.galleryIds, image.id],
            }));
          }}
        />
        <ImageUpload
          label="Choose behind-the-scenes thumbnail"
          onUpload={async (file) => setSupporting(await upload(file))}
        />
        {supporting && (
          <Field label="Uploaded thumbnail ID">
            <TextInput value={supporting.id} readOnly />
          </Field>
        )}
      </Card>
    </div>
  );
}

export function FilmCredits({
  fields,
  register,
  append,
  remove,
  maximum = 60,
  staffSearch,
  priorityCategory,
}) {
  const [search, setSearch] = useState('');
  const [q, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const matches = useQuery({
    queryKey: [
      'talent',
      'film-credit-selection',
      q,
      staffSearch,
      priorityCategory,
    ],
    meta: { public: !staffSearch },
    enabled: q.length >= 2,
    queryFn: async ({ signal }) => {
      const params = { q, limit: 8 };
      const request = staffSearch
        ? protectedRequest({ url: staffSearch, params, signal })
        : apiClient.get('/talent', { params, signal });
      const preferred =
        priorityCategory &&
        apiClient
          .get('/talent', {
            params: { ...params, category: priorityCategory },
            signal,
          })
          .catch(() => undefined);
      const [matching, first] = await Promise.all([request, preferred]);
      return [
        ...new Map(
          [...(first?.data ?? []), ...(matching.data ?? [])].map((person) => [
            person.id,
            person,
          ]),
        ).values(),
      ].slice(0, 8);
    },
  });
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-2 text-lg font-semibold">Cast and crew</legend>
      <Field label="Find Talent Profiles">
        <TextInput
          type="search"
          value={search}
          maxLength={80}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      {matches.isFetching && (
        <p role="status" className="text-sm text-muted">
          Searching Talent Profiles
        </p>
      )}
      {matches.isError && (
        <p role="alert" className="text-sm text-danger-text">
          {matches.error.message}
        </p>
      )}
      {matches.data?.length === 0 && (
        <p className="text-sm text-muted">No matching published profiles.</p>
      )}
      {matches.data?.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {matches.data.map((person) => (
            <li key={person.id} className="min-w-0">
              <Button
                variant="outline"
                disabled={fields.length >= maximum}
                className="max-w-full whitespace-normal wrap-anywhere"
                onClick={() =>
                  append({
                    personalityId: person.id,
                    displayName: person.displayName,
                    role: person.professions[0] ?? 'other',
                  })
                }
              >
                Add credit for {person.displayName}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/submissions/new?category=talent"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center text-accent underline"
      >
        Propose a missing Talent Profile (opens a new tab)
      </Link>
      {fields.map(({ id, displayName }, index) => (
        <Card className="grid min-w-0 gap-3 wrap-anywhere" key={id}>
          <h3 className="font-semibold">
            {displayName ?? 'Existing Talent Profile'}
          </h3>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label="Credit role">
              <Select {...register('credits.' + index + '.role')}>
                {labels(professions)}
              </Select>
            </Field>
            <Field label="Custom role or character name">
              <TextInput
                {...register('credits.' + index + '.character')}
                maxLength={100}
              />
            </Field>
            <Field label="Department">
              <TextInput
                {...register('credits.' + index + '.department')}
                maxLength={80}
              />
            </Field>
          </div>
          <div>
            <Button variant="outline" onClick={() => remove(index)}>
              Remove credit {index + 1}
            </Button>
          </div>
        </Card>
      ))}
    </fieldset>
  );
}

function RoleChoices({ title, name, items, register }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 font-semibold">{title}</legend>
      <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(items).map(([key, label]) => (
          <label
            key={key}
            className="flex min-h-11 min-w-0 items-center gap-2 text-sm"
          >
            <Checkbox value={key} {...register(name)} /> {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FilmForm({
  record,
  images,
  admin = false,
  creation = false,
  classification = record?.classification,
  change,
  save,
  button = record?.status === 'published'
    ? 'Save published film'
    : 'Save film draft',
}) {
  const [media, setMedia] = useState({
    posterId: record?.posterId ?? '',
    bannerId: record?.bannerId ?? '',
    galleryIds: record?.galleryIds ?? [],
  });
  const [error, setError] = useState('');
  const [artwork, setArtwork] = useState(() => ({
    key: record?.videoArtwork,
    id: parseYouTube(record?.mainUrl)?.providerVideoId,
  }));
  const { register, handleSubmit, control, getValues, setValue } = useForm({
    defaultValues: {
      title: record?.title ?? '',
      synopsis: record?.synopsis ?? '',
      description: record?.description ?? '',
      genres: record?.genres ?? [],
      language: record?.language ?? '',
      subtitles: record?.subtitles ?? [],
      runtimeMinutes: record?.runtimeMinutes ?? '',
      releaseYear: record?.releaseYear ?? '',
      productionCompany: record?.productionCompany ?? '',
      advisory: record?.advisory ?? '',
      mainUrl: record?.mainUrl ?? '',
      trailerUrl: record?.trailerUrl ?? '',
      rightsNotes: record?.rightsNotes ?? '',
      rightsConfirmed: record?.rightsConfirmed ?? false,
      credits: record?.credits ?? [],
      extras: record?.extras ?? [],
      awards: record?.awards ?? [],
    },
  });
  const credits = useFieldArray({ control, name: 'credits' });
  const extras = useFieldArray({ control, name: 'extras' });
  const awards = useFieldArray({ control, name: 'awards' });
  const lockedVideo =
    admin && Boolean(record?.creatorId || record?.status === 'published');
  function submit(values) {
    let release;
    try {
      release = admin && creation ? publicationValues(values) : undefined;
    } catch (error) {
      return setError(error.message);
    }
    const draft = validDraft.safeParse({
      ...values,
      title: values.title.trim(),
      synopsis: values.synopsis.trim(),
      runtimeMinutes: Number(values.runtimeMinutes),
      releaseYear: values.releaseYear ? Number(values.releaseYear) : undefined,
    });
    if (!draft.success)
      return setError(
        'Enter a title, synopsis, one to five genres, and runtime.',
      );
    if (
      [
        trim(values.mainUrl),
        trim(values.trailerUrl),
        ...values.extras.map(({ url }) => trim(url)),
      ]
        .filter(Boolean)
        .some((url) => !parseYouTube(url))
    ) {
      return setError('Enter supported HTTPS YouTube links for the videos.');
    }
    const assets = [
      media.posterId,
      media.bannerId,
      ...media.galleryIds,
      ...values.extras.map(({ thumbnailId }) => thumbnailId),
    ].filter(Boolean);
    if (assets.some((id) => !z.uuid().safeParse(id.trim()).success))
      return setError('Enter a valid media ID or remove the field.');
    const prepared = values.credits.map(
      ({ personalityId, role, character, department }) => ({
        personalityId,
        role,
        character: trim(character),
        department: trim(department),
      }),
    );
    const creditKeys = prepared.map(({ personalityId, role, character }) =>
      [
        personalityId,
        role,
        (character ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' '),
      ].join('|'),
    );
    if (new Set(creditKeys).size !== creditKeys.length)
      return setError('Remove duplicate cast or crew credits.');
    setError('');
    save({
      ...draft.data,
      language: values.language,
      subtitles: values.subtitles ?? [],
      description: trim(values.description),
      productionCompany: trim(values.productionCompany),
      advisory: trim(values.advisory),
      posterId: trim(media.posterId),
      bannerId: trim(media.bannerId),
      galleryIds: media.galleryIds,
      mainUrl: trim(values.mainUrl),
      videoArtwork:
        artwork.id === parseYouTube(trim(values.mainUrl))?.providerVideoId
          ? artwork.key
          : undefined,
      ...(release && { release }),
      trailerUrl: trim(values.trailerUrl),
      credits: prepared,
      extras: values.extras.map(
        ({ title, url, thumbnailId, videoArtwork }) => ({
          title: title.trim(),
          url: url.trim(),
          thumbnailId: trim(thumbnailId),
          videoArtwork,
        }),
      ),
      awards: values.awards.map(({ title, organization, year, source }) => ({
        title: title.trim(),
        organization: trim(organization),
        year: year ? Number(year) : undefined,
        source: trim(source),
      })),
      rightsConfirmed: lockedVideo
        ? record.rightsConfirmed
        : values.rightsConfirmed,
      rightsNotes: trim(values.rightsNotes),
      ...(admin && creation && { slug: trim(values.slug) }),
    });
  }
  return (
    <>
      <FilmMedia
        admin={admin}
        record={record}
        images={images}
        value={media}
        change={setMedia}
      />
      <Card className="min-w-0">
        <form
          className="grid grid-cols-1 gap-5"
          onSubmit={handleSubmit(submit)}
        >
          <Field label="Main film YouTube URL">
            <TextInput
              type="url"
              maxLength={2048}
              readOnly={lockedVideo}
              {...register('mainUrl')}
            />
          </Field>
          {admin && !lockedVideo && (
            <YouTubeDetails
              module={classification ?? 'original'}
              source={() => getValues('mainUrl')}
              current={getValues}
              values={(details) => ({
                title: details.title?.trim().slice(0, 140),
                synopsis: details.description?.trim().slice(0, 280),
                description: details.description?.trim().slice(0, 6000),
                runtimeMinutes:
                  details.durationSeconds &&
                  Math.ceil(details.durationSeconds / 60) <= 300
                    ? Math.ceil(details.durationSeconds / 60)
                    : undefined,
                language: Object.hasOwn(
                  languages,
                  details.language?.split('-')[0],
                )
                  ? details.language.split('-')[0]
                  : undefined,
              })}
              apply={(fields, thumbnail, replace) => {
                for (const [name, value] of Object.entries(fields))
                  setValue(name, value, { shouldDirty: true });
                if (thumbnail && (replace || !artwork.key))
                  setArtwork({
                    key: thumbnail.key,
                    id: parseYouTube(getValues('mainUrl')).providerVideoId,
                  });
              }}
            />
          )}
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label="Film title">
              <TextInput required maxLength={140} {...register('title')} />
            </Field>
            {admin && creation && (
              <Field label="Public slug (optional)">
                <TextInput
                  maxLength={90}
                  pattern="[a-z0-9]+(?:\x2D[a-z0-9]+)*"
                  {...register('slug')}
                />
              </Field>
            )}
            <Field label="Primary language">
              <Select required {...register('language')}>
                <option value="">Select a language</option>
                {labels(languages)}
              </Select>
            </Field>
            <Field label="Runtime in minutes">
              <TextInput
                type="number"
                min={1}
                max={300}
                required
                {...register('runtimeMinutes')}
              />
            </Field>
            <Field label="Release year">
              <TextInput
                type="number"
                min={1888}
                max={2100}
                {...register('releaseYear')}
              />
            </Field>
            <Field label="Production company">
              <TextInput maxLength={120} {...register('productionCompany')} />
            </Field>
            <Field label="Content advisory">
              <TextInput maxLength={300} {...register('advisory')} />
            </Field>
          </div>
          <Field label="Short synopsis">
            <Textarea
              rows={2}
              maxLength={280}
              required
              {...register('synopsis')}
            />
          </Field>
          <Field label="Detailed description">
            <Textarea maxLength={6000} {...register('description')} />
          </Field>
          <RoleChoices
            title="Genres"
            name="genres"
            items={genres}
            register={register}
          />
          <details>
            <summary className="cursor-pointer py-2 font-semibold">
              Advanced Settings · Subtitles and trailer
            </summary>
            <RoleChoices
              title="Subtitle languages"
              name="subtitles"
              items={languages}
              register={register}
            />
            <fieldset className="grid min-w-0 gap-3">
              <legend className="mb-2 font-semibold">Trailer</legend>
              {lockedVideo && (
                <p className="text-sm text-muted">
                  {record.creatorId
                    ? 'Video and rights changes for creator submissions require creator review.'
                    : 'Unpublish first to change video sources or distribution rights.'}
                </p>
              )}
              <Field label="Trailer YouTube URL">
                <TextInput
                  type="url"
                  maxLength={2048}
                  readOnly={lockedVideo}
                  {...register('trailerUrl')}
                />
              </Field>
            </fieldset>
          </details>
          <fieldset className="grid min-w-0 gap-3">
            <legend className="mb-2 text-lg font-semibold">
              Supporting videos
            </legend>
            {extras.fields.map(({ id }, index) => (
              <Card key={id} className="grid min-w-0 gap-3">
                <Field label="Supporting video title">
                  <TextInput
                    required
                    maxLength={100}
                    {...register('extras.' + index + '.title')}
                  />
                </Field>
                <Field label="Supporting YouTube URL">
                  <TextInput
                    type="url"
                    required
                    maxLength={2048}
                    readOnly={lockedVideo}
                    {...register('extras.' + index + '.url')}
                  />
                </Field>
                <Field label="Thumbnail media ID">
                  <TextInput
                    {...register('extras.' + index + '.thumbnailId')}
                  />
                </Field>
                {!lockedVideo && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={index === 0}
                      onClick={() => extras.move(index, index - 1)}
                    >
                      Move video up
                    </Button>
                    <Button
                      variant="outline"
                      disabled={index === extras.fields.length - 1}
                      onClick={() => extras.move(index, index + 1)}
                    >
                      Move video down
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => extras.remove(index)}
                    >
                      Remove video {index + 1}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
            {!lockedVideo && (
              <div>
                <Button
                  variant="outline"
                  disabled={extras.fields.length >= 5}
                  onClick={() => extras.append({ title: '', url: '' })}
                >
                  Add supporting video
                </Button>
              </div>
            )}
          </fieldset>
          <FilmCredits
            {...credits}
            register={register}
            priorityCategory={admin ? 'short-films' : undefined}
          />
          <fieldset className="grid min-w-0 gap-3">
            <legend className="mb-2 text-lg font-semibold">
              Awards and recognitions
            </legend>
            {awards.fields.map(({ id }, index) => (
              <Card key={id} className="grid min-w-0 gap-3">
                <Field label="Award title">
                  <TextInput
                    required
                    maxLength={140}
                    {...register('awards.' + index + '.title')}
                  />
                </Field>
                <Field label="Award organization">
                  <TextInput
                    maxLength={120}
                    {...register('awards.' + index + '.organization')}
                  />
                </Field>
                <Field label="Award year">
                  <TextInput
                    type="number"
                    min={1888}
                    max={2100}
                    {...register('awards.' + index + '.year')}
                  />
                </Field>
                <Field label="Award source">
                  <TextInput
                    type="url"
                    maxLength={2048}
                    {...register('awards.' + index + '.source')}
                  />
                </Field>
                <div>
                  <Button
                    variant="outline"
                    onClick={() => awards.remove(index)}
                  >
                    Remove award {index + 1}
                  </Button>
                </div>
              </Card>
            ))}
            <div>
              <Button
                variant="outline"
                disabled={awards.fields.length >= 12}
                onClick={() => awards.append({ title: '' })}
              >
                Add award
              </Button>
            </div>
          </fieldset>
          <fieldset className="grid min-w-0 gap-3">
            <legend className="mb-2 text-lg font-semibold">
              Content authorization
            </legend>
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <Checkbox
                disabled={lockedVideo}
                {...register('rightsConfirmed')}
              />
              I confirm permission to publish this film, embed the linked
              videos, and use the supplied images on FDFS.
            </label>
            <Field label="Rights notes (private)">
              <Textarea
                maxLength={1000}
                readOnly={lockedVideo}
                {...register('rightsNotes')}
              />
            </Field>
          </fieldset>
          {admin && creation && <PublicationFields register={register} />}
          {(error || change.isError) && (
            <p role="alert" className="text-sm text-danger-text">
              {error || change.error.message}
            </p>
          )}
          {change.isSuccess && !error && (
            <p role="status" className="text-sm text-success">
              Changes saved.
            </p>
          )}
          <div>
            <Button type="submit" loading={change.isPending}>
              {button}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
