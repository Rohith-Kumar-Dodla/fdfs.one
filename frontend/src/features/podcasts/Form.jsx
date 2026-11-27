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
import { languages } from '../../../../shared/films.js';
import { participantRoles } from '../../../../shared/podcasts.js';
import { parseYouTube } from '../../../../shared/youtube.js';
import { apiClient } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import {
  Checkbox,
  Select,
  TextInput,
  Textarea,
} from '../../components/ui/fields.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { MediaPicker } from '../admin/MediaPicker.jsx';
import { ImageUpload, uploadImage } from '../media/Images.jsx';

const optional = (value) => value?.trim() || undefined;
const langChoices = Object.entries(languages);
const field = 'grid min-w-0 gap-1 text-sm';
const pickId = z.uuid();
const validEpisode = z.object({
  title: z.string().min(1).max(140),
  synopsis: z.string().min(1).max(280),
  number: z.number().int().min(1).max(9999),
  season: z.number().int().min(1).max(999),
  duration: z.number().int().min(1).max(28800),
});

function Field({ label, children }) {
  return (
    <label className={field}>
      {label}
      {children}
    </label>
  );
}
function localDate(date) {
  if (!date) return '';
  const time = new Date(date);
  return new Date(time.getTime() - time.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function useArtwork(record, primary) {
  return useState({
    primary: record?.[primary]?.id ?? '',
    banner: record?.banner?.id ?? '',
  });
}
function Artwork({ record, primary, label, value, change }) {
  const [uploaded, remember] = useState({});
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {[
        ['primary', primary, label],
        ['banner', 'banner', 'Banner'],
      ].map(([slot, key, title]) => {
        const id = value[slot];
        const image =
          uploaded[slot]?.id === id
            ? uploaded[slot]
            : record?.[key]?.id === id
              ? record[key]
              : null;
        return (
          <Card className="grid min-w-0 gap-2" key={slot}>
            <h3 className="font-semibold">{title}</h3>
            {image && (
              <div className="max-w-48">
                <FilmImage
                  image={image}
                  square={key === 'cover'}
                  landscape={key !== 'cover'}
                />
              </div>
            )}
            <Field label={title + ' media ID'}>
              <TextInput
                value={id}
                maxLength={36}
                onChange={(event) => {
                  const id = event.target.value;
                  change((current) => ({ ...current, [slot]: id }));
                }}
              />
            </Field>
            <MediaPicker
              label={'Select ' + title.toLowerCase() + ' from library'}
              onSelect={(image) => {
                remember((current) => ({ ...current, [slot]: image }));
                change((current) => ({ ...current, [slot]: image.id }));
              }}
            />
            {id && (
              <div>
                <Button
                  variant="outline"
                  onClick={() =>
                    change((current) => ({ ...current, [slot]: '' }))
                  }
                >
                  Remove {title.toLowerCase()}
                </Button>
              </div>
            )}
            <ImageUpload
              label={'Choose ' + title.toLowerCase()}
              onUpload={async (file) => {
                const { data } = await uploadImage(
                  '/admin/media',
                  file,
                  'post',
                );
                remember((current) => ({ ...current, [slot]: data }));
                change((current) => ({ ...current, [slot]: data.id }));
              }}
            />
          </Card>
        );
      })}
    </div>
  );
}
function PeoplePicker({ fields, register, append, remove, hosts = false }) {
  const [text, setText] = useState('');
  const [q, search] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => search(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const results = useQuery({
    queryKey: ['talent', 'podcast-participants', q],
    meta: { public: true },
    enabled: q.length >= 2,
    queryFn: ({ signal }) =>
      apiClient
        .get('/talent', { params: { q, limit: 8 }, signal })
        .then(({ data }) => data),
  });
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-2 text-lg font-semibold">
        {hosts ? 'Show hosts' : 'Episode participants'}
      </legend>
      <Field label="Find Talent Profiles">
        <TextInput
          type="search"
          value={text}
          maxLength={80}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      {results.isFetching && (
        <p role="status" className="text-muted">
          Searching Talent Profiles
        </p>
      )}
      {results.isError && (
        <p role="alert" className="text-danger-text">
          {results.error.message}
        </p>
      )}
      {results.data?.length === 0 && (
        <p className="text-muted">No matching published profiles.</p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {results.data?.map(({ id, displayName }) => (
          <li key={id} className="min-w-0">
            <Button
              variant="outline"
              className="max-w-full whitespace-normal wrap-anywhere"
              disabled={
                fields.length >= (hosts ? 20 : 40) ||
                (hosts && fields.some((entry) => entry.personalityId === id))
              }
              onClick={() =>
                append({
                  personalityId: id,
                  displayName,
                  role: hosts ? 'host' : 'guest',
                })
              }
            >
              Add {displayName}
            </Button>
          </li>
        ))}
      </ul>
      <Link
        to="/admin/talent/new"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center text-accent underline"
      >
        Create an authorized Talent Profile (opens a new tab)
      </Link>
      {fields.map(({ id, displayName }, index) => (
        <Card key={id} className="grid min-w-0 gap-2 wrap-anywhere">
          <h3 className="font-semibold">
            {displayName ?? 'Existing Talent Profile'}
          </h3>
          {!hosts && (
            <>
              <Field label="Participation role">
                <Select {...register('participants.' + index + '.role')}>
                  {Object.entries(participantRoles).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Episode introduction">
                <Textarea
                  maxLength={300}
                  rows={2}
                  {...register('participants.' + index + '.introduction')}
                />
              </Field>
            </>
          )}
          <div>
            <Button variant="outline" onClick={() => remove(index)}>
              Remove {displayName ?? 'participant'}
            </Button>
          </div>
        </Card>
      ))}
    </fieldset>
  );
}
function Links({ array, register, resources = false }) {
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-2 text-lg font-semibold">
        {resources ? 'Useful resource links' : 'Links'}
      </legend>
      {array.fields.map(({ id }, index) => (
        <Card key={id} className="grid min-w-0 gap-2">
          <Field label="Link label">
            <TextInput
              required
              maxLength={80}
              {...register('links.' + index + '.label')}
            />
          </Field>
          <Field label={resources ? 'HTTP or HTTPS link' : 'HTTPS link'}>
            <TextInput
              type="url"
              required
              maxLength={2048}
              {...register('links.' + index + '.url')}
            />
          </Field>
          {resources && (
            <Field label="Description (optional)">
              <TextInput
                maxLength={300}
                {...register('links.' + index + '.description')}
              />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={index === 0}
              onClick={() => array.move(index, index - 1)}
            >
              Move link up
            </Button>
            <Button
              variant="outline"
              disabled={index === array.fields.length - 1}
              onClick={() => array.move(index, index + 1)}
            >
              Move link down
            </Button>
            <Button variant="outline" onClick={() => array.remove(index)}>
              Remove link {index + 1}
            </Button>
          </div>
        </Card>
      ))}
      <div>
        <Button
          variant="outline"
          disabled={array.fields.length >= 10}
          onClick={() => array.append({ label: '', url: '' })}
        >
          Add link
        </Button>
      </div>
    </fieldset>
  );
}
function Chapters({ array, register, getValues, setValue }) {
  function move(from, destination) {
    const source = getValues('chapters.' + from);
    const target = getValues('chapters.' + destination);
    array.move(from, destination);
    for (const unit of ['hours', 'minutes', 'seconds']) {
      setValue('chapters.' + from + '.' + unit, source[unit]);
      setValue('chapters.' + destination + '.' + unit, target[unit]);
    }
  }
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-2 text-lg font-semibold">Chapters</legend>
      {array.fields.length > 1 && (
        <p className="text-sm text-muted">
          Moving a chapter exchanges its time slot with its neighbor.
        </p>
      )}
      {array.fields.map(({ id }, index) => (
        <Card key={id} className="grid min-w-0 gap-3">
          <Field label="Chapter title">
            <TextInput
              required
              maxLength={100}
              {...register('chapters.' + index + '.title')}
            />
          </Field>
          <div className="grid min-w-0 grid-cols-3 gap-2">
            {[
              ['hours', 8],
              ['minutes', 59],
              ['seconds', 59],
            ].map(([part, max]) => (
              <Field label={part[0].toUpperCase() + part.slice(1)} key={part}>
                <TextInput
                  type="number"
                  required
                  min={0}
                  max={max}
                  className="min-w-0 px-2!"
                  {...register('chapters.' + index + '.' + part)}
                />
              </Field>
            ))}
          </div>
          <Field label="Chapter description">
            <Textarea
              maxLength={400}
              rows={2}
              {...register('chapters.' + index + '.description')}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
            >
              Move earlier
            </Button>
            <Button
              variant="outline"
              disabled={index === array.fields.length - 1}
              onClick={() => move(index, index + 1)}
            >
              Move later
            </Button>
            <Button variant="outline" onClick={() => array.remove(index)}>
              Remove chapter {index + 1}
            </Button>
          </div>
        </Card>
      ))}
      <div>
        <Button
          variant="outline"
          disabled={array.fields.length >= 60}
          onClick={() =>
            array.append({ title: '', hours: 0, minutes: 0, seconds: 0 })
          }
        >
          Add chapter
        </Button>
      </div>
    </fieldset>
  );
}
function Rights({ register, show }) {
  return (
    <label className="flex min-h-11 items-start gap-2 text-sm">
      <Checkbox {...register('rightsConfirmed')} />{' '}
      {show
        ? 'I confirm permission to publish this show information and artwork.'
        : 'I confirm permission to publish and embed the supplied videos and artwork.'}
    </label>
  );
}
function formError(change, error) {
  return (
    (error || change.isError) && (
      <p role="alert" className="text-sm text-danger-text">
        {error || change.error.message}
      </p>
    )
  );
}
export function ShowForm({ show, change, save }) {
  const [art, setArt] = useArtwork(show, 'cover');
  const [error, setError] = useState('');
  const { register, handleSubmit, control } = useForm({
    defaultValues: {
      name: show?.name ?? '404 Reality Not Found',
      introduction: show?.introduction ?? '',
      description: show?.description ?? '',
      languages: show?.languages ?? [],
      participants:
        show?.hosts.map((host) => ({
          personalityId: host.id,
          displayName: host.displayName,
        })) ?? [],
      links: show?.links ?? [],
      rightsConfirmed: show?.rightsConfirmed ?? false,
    },
  });
  const hosts = useFieldArray({ control, name: 'participants' });
  const links = useFieldArray({ control, name: 'links' });
  return (
    <>
      <Artwork
        record={show}
        primary="cover"
        label="Show cover"
        value={art}
        change={setArt}
      />
      <Card className="min-w-0">
        <form
          className="grid grid-cols-1 gap-4"
          onSubmit={handleSubmit(({ participants, ...fields }) => {
            if (!Array.isArray(fields.languages) || !fields.languages.length)
              return setError('Select at least one show language.');
            if (
              [art.primary, art.banner]
                .filter(Boolean)
                .some((value) => !pickId.safeParse(value.trim()).success)
            )
              return setError('Enter a valid media ID or remove it.');
            setError('');
            save({
              ...fields,
              revision: show?.revision,
              coverId: optional(art.primary),
              bannerId: optional(art.banner),
              hostIds: participants.map(({ personalityId }) => personalityId),
            });
          })}
        >
          <Field label="Show name">
            <TextInput required maxLength={120} {...register('name')} />
          </Field>
          <Field label="Short introduction">
            <Textarea
              required
              rows={2}
              maxLength={280}
              {...register('introduction')}
            />
          </Field>
          <Field label="Show description">
            <Textarea required maxLength={6000} {...register('description')} />
          </Field>
          <fieldset>
            <legend className="font-semibold">Show languages</legend>
            <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
              {langChoices.map(([key, label]) => (
                <label
                  className="flex min-h-11 items-center gap-2 text-sm"
                  key={key}
                >
                  <Checkbox value={key} {...register('languages')} /> {label}
                </label>
              ))}
            </div>
          </fieldset>
          <PeoplePicker {...hosts} register={register} hosts />
          <Links array={links} register={register} />
          <Rights show register={register} />
          {formError(change, error)}
          {change.isSuccess && !error && (
            <p role="status" className="text-sm text-success">
              Show saved.
            </p>
          )}
          <div>
            <Button type="submit" loading={change.isPending}>
              Save show
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
export function EpisodeForm({ episode, change, save }) {
  const [art, setArt] = useArtwork(episode, 'thumbnail');
  const [error, setError] = useState('');
  const [galleryIds, setGallery] = useState(episode?.galleryIds ?? []);
  const locked = episode?.status === 'published';
  const [artwork, setArtwork] = useState(() => ({
    key: episode?.videoArtwork,
    id: parseYouTube(episode?.mainUrl)?.providerVideoId,
  }));
  const { register, handleSubmit, control, getValues, setValue } = useForm({
    defaultValues: {
      title: episode?.title ?? '',
      commentsEnabled: episode?.commentsEnabled ?? true,
      synopsis: episode?.synopsis ?? '',
      notes: episode?.notes ?? '',
      season: episode?.season ?? 1,
      number: episode?.number ?? '',
      duration: episode?.duration ?? '',
      language: episode?.language ?? '',
      topics: episode?.topics?.join(', ') ?? '',
      advisory: episode?.advisory ?? '',
      participants: episode?.participants ?? [],
      links: episode?.links ?? [],
      mainUrl: episode?.mainUrl ?? '',
      teaserUrl: episode?.teaserUrl ?? '',
      extras:
        episode?.extras?.map(({ title, video }) => ({
          title,
          url: video.sourceUrl,
        })) ?? [],
      releaseAt: localDate(episode?.releaseAt),
      rightsConfirmed: episode?.rightsConfirmed ?? false,
      rightsNotes: episode?.rightsNotes ?? '',
      chapters: (episode?.chapters ?? []).map(
        ({ title, start, description }) => ({
          title,
          description,
          hours: Math.floor(start / 3600),
          minutes: Math.floor(start / 60) % 60,
          seconds: start % 60,
        }),
      ),
    },
  });
  const participants = useFieldArray({ control, name: 'participants' });
  const links = useFieldArray({ control, name: 'links' });
  const extras = useFieldArray({ control, name: 'extras' });
  const chapters = useFieldArray({ control, name: 'chapters' });
  function submit(values) {
    let release;
    try {
      release = episode ? undefined : publicationValues(values);
    } catch (error) {
      return setError(error.message);
    }
    const fields = validEpisode.safeParse({
      ...values,
      title: values.title.trim(),
      synopsis: values.synopsis.trim(),
      number: Number(values.number),
      season: Number(values.season),
      duration: Number(values.duration),
    });
    if (!fields.success)
      return setError(
        'Enter a title, summary, episode number, season and duration.',
      );
    if (
      [art.primary, art.banner]
        .filter(Boolean)
        .some((value) => !pickId.safeParse(value.trim()).success)
    )
      return setError('Enter a valid media ID or remove it.');
    const main = optional(values.mainUrl),
      teaser = optional(values.teaserUrl);
    if (
      [main, teaser, ...values.extras.map(({ url }) => url.trim())]
        .filter(Boolean)
        .some((value) => !parseYouTube(value))
    )
      return setError('Enter supported HTTPS YouTube links.');
    const times = values.chapters.map(
      ({ hours, minutes, seconds }) =>
        Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds),
    );
    if (
      new Set(times).size !== times.length ||
      times.some((time) => time >= fields.data.duration)
    )
      return setError(
        'Use unique chapter times before the end of the episode.',
      );
    if (
      new Set(
        values.participants.map(
          ({ personalityId, role }) => personalityId + ':' + role,
        ),
      ).size !== values.participants.length
    ) {
      return setError('Remove duplicate participant roles.');
    }
    setError('');
    save({
      ...fields.data,
      language: values.language,
      notes: optional(values.notes),
      advisory: optional(values.advisory),
      topics: [
        ...new Set(
          values.topics
            .split(',')
            .map((topic) => topic.trim().toLowerCase().replace(/\s+/g, '-'))
            .filter(Boolean),
        ),
      ],
      thumbnailId: optional(art.primary),
      bannerId: optional(art.banner),
      galleryIds,
      extras: values.extras.map(({ title, url }) => ({
        title: title.trim(),
        url: url.trim(),
      })),
      mainUrl: main,
      videoArtwork:
        artwork.id === parseYouTube(main)?.providerVideoId
          ? artwork.key
          : undefined,
      ...(release && { release }),
      teaserUrl: teaser,
      participants: values.participants.map(
        ({ personalityId, role, introduction }) => ({
          personalityId,
          role,
          introduction: optional(introduction),
        }),
      ),
      chapters: values.chapters.map(({ title, description }, index) => ({
        title: title.trim(),
        description: optional(description),
        start: times[index],
      })),
      links: values.links.map(({ label, url, description }) => ({
        label,
        url,
        description: optional(description),
      })),
      releaseAt: values.releaseAt
        ? new Date(values.releaseAt).toISOString()
        : undefined,
      rightsConfirmed: values.rightsConfirmed,
      commentsEnabled: values.commentsEnabled,
      rightsNotes: optional(values.rightsNotes),
      ...(episode
        ? { revision: episode.revision }
        : { slug: optional(values.slug) }),
    });
  }
  return (
    <>
      <Artwork
        record={episode}
        primary="thumbnail"
        label="Episode thumbnail"
        value={art}
        change={setArt}
      />
      <Card className="grid gap-3">
        <h2 className="font-semibold">Supporting images</h2>
        <GalleryOrder
          ids={galleryIds}
          change={setGallery}
          images={episode?.gallery}
          library
        />
      </Card>
      <Card className="min-w-0">
        <form
          className="grid grid-cols-1 gap-4"
          onSubmit={handleSubmit(submit)}
        >
          <Field label="Main YouTube URL">
            <TextInput type="url" maxLength={2048} {...register('mainUrl')} />
          </Field>

          {episode?.status !== 'published' && (
            <YouTubeDetails
              module="podcasts"
              source={() => getValues('mainUrl')}
              current={getValues}
              values={(details) => ({
                title: details.title?.trim().slice(0, 140),
                synopsis: details.description?.trim().slice(0, 280),
                notes: details.description?.trim().slice(0, 12000),
                duration:
                  details.durationSeconds <= 28800
                    ? details.durationSeconds
                    : undefined,
                language: langChoices.some(
                  ([key]) => key === details.language?.split('-')[0],
                )
                  ? details.language.split('-')[0]
                  : undefined,
              })}
              apply={(fields, thumbnail, replace) => {
                for (const [key, value] of Object.entries(fields))
                  setValue(key, value, { shouldDirty: true });
                if (thumbnail && (replace || !artwork.key))
                  setArtwork({
                    key: thumbnail.key,
                    id: parseYouTube(getValues('mainUrl')).providerVideoId,
                  });
              }}
            />
          )}
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label="Episode title">
              <TextInput required maxLength={140} {...register('title')} />
            </Field>
            {!episode && (
              <Field label="Public slug (optional)">
                <TextInput
                  pattern="[a-z0-9]+(?:\x2D[a-z0-9]+)*"
                  maxLength={90}
                  {...register('slug')}
                />
              </Field>
            )}
            <Field label="Episode number">
              <TextInput
                type="number"
                required
                min={1}
                max={9999}
                {...register('number')}
              />
            </Field>
            <Field label="Season">
              <TextInput
                type="number"
                required
                min={1}
                max={999}
                {...register('season')}
              />
            </Field>
            <Field label="Duration in seconds">
              <TextInput
                type="number"
                required
                min={1}
                max={28800}
                {...register('duration')}
              />
            </Field>
            <Field label="Primary language">
              <Select required {...register('language')}>
                <option value="">Select a language</option>
                {langChoices.map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Topics (comma separated)">
              <TextInput maxLength={480} {...register('topics')} />
            </Field>
            <Field label="Release date and time (local)">
              <TextInput type="datetime-local" {...register('releaseAt')} />
            </Field>
          </div>
          <Field label="Short description">
            <Textarea
              required
              maxLength={280}
              rows={2}
              {...register('synopsis')}
            />
          </Field>
          <Field label="Show notes">
            <Textarea maxLength={12000} rows={6} {...register('notes')} />
          </Field>
          <Field label="Content advisory">
            <TextInput maxLength={300} {...register('advisory')} />
          </Field>
          <Field label="Teaser YouTube URL">
            <TextInput type="url" maxLength={2048} {...register('teaserUrl')} />
          </Field>
          <fieldset className="grid gap-3">
            <legend className="mb-2 font-semibold">Supporting videos</legend>
            {extras.fields.map(({ id }, index) => (
              <div
                className="grid gap-2 rounded-control border border-line p-3"
                key={id}
              >
                <Field label="Video label">
                  <TextInput
                    required
                    maxLength={100}
                    {...register('extras.' + index + '.title')}
                  />
                </Field>
                <Field label="Supporting YouTube URL">
                  <TextInput
                    required
                    readOnly={locked}
                    type="url"
                    maxLength={2048}
                    {...register('extras.' + index + '.url')}
                  />
                </Field>
                {!locked && (
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
                      Remove video
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!locked && (
              <Button
                className="w-fit"
                variant="outline"
                disabled={extras.fields.length >= 5}
                onClick={() => extras.append({ title: '', url: '' })}
              >
                Add supporting video
              </Button>
            )}
          </fieldset>
          <details>
            <summary className="cursor-pointer py-2 font-semibold">
              Advanced Settings · Chapters
            </summary>
            <Chapters
              array={chapters}
              register={register}
              getValues={getValues}
              setValue={setValue}
            />
          </details>
          <PeoplePicker {...participants} register={register} />
          <Links array={links} register={register} resources />
          <label className="flex min-h-11 items-center gap-2">
            <Checkbox {...register('commentsEnabled')} />
            Enable episode comments
          </label>
          <Rights register={register} />
          <Field label="Private rights notes">
            <Textarea maxLength={1000} rows={2} {...register('rightsNotes')} />
          </Field>
          {!episode && <PublicationFields register={register} />}
          {formError(change, error)}
          {change.isSuccess && !error && (
            <p role="status" className="text-sm text-success">
              Episode saved.
            </p>
          )}
          <div>
            <Button type="submit" loading={change.isPending}>
              {episode ? 'Save episode' : 'Submit Episode'}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
