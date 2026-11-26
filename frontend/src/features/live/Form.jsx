import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  eventCategories,
  eventLocalTime,
  eventUtcTime,
  formatEventTime,
} from '../../../../shared/live.js';
import { languages } from '../../../../shared/films.js';
import { apiClient } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import { control, DetailLink, useChange } from '../admin/common.jsx';
import { FilmImage } from '../films/FilmImage.jsx';
import { MediaPicker } from '../admin/MediaPicker.jsx';
import { ImageUpload, uploadImage } from '../media/Images.jsx';

export const field = 'grid min-w-0 gap-1 text-sm';

export function ScheduleFields({ event }) {
  const timeZone =
    event?.timeZone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    'UTC';
  return (
    <>
      <label className={field}>
        Event timezone (IANA)
        <input
          className={control}
          name="timeZone"
          defaultValue={timeZone}
          maxLength={64}
          required
        />
      </label>
      <label className={field}>
        Scheduled start
        <input
          className={control}
          name="startAt"
          type="datetime-local"
          required
          defaultValue={eventLocalTime(event?.startAt, timeZone)}
        />
      </label>
      <label className={field}>
        Scheduled end
        <input
          className={control}
          name="endAt"
          type="datetime-local"
          defaultValue={eventLocalTime(event?.endAt, timeZone)}
        />
      </label>
    </>
  );
}

export function readSchedule(data) {
  const timeZone = data.get('timeZone').trim();
  const startAt = eventUtcTime(data.get('startAt'), timeZone);
  const endAt = data.get('endAt')
    ? eventUtcTime(data.get('endAt'), timeZone)
    : undefined;
  if (endAt && endAt <= startAt)
    throw new Error('The event must end after its start.');
  return { startAt, endAt, timeZone };
}

function Choice({ name, label, options, value }) {
  return (
    <label className={field}>
      {label}
      <select className={control} name={name} defaultValue={value}>
        {Object.entries(options).map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function TalentPicker({ selected, setSelected }) {
  const [search, setSearch] = useState('');
  const [q, setQuery] = useState('');
  const results = useQuery({
    queryKey: ['live-talent-picker', q],
    enabled: Boolean(q),
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient
        .get('/talent', { params: { q, limit: 8 }, signal })
        .then((response) => response.data),
  });
  return (
    <fieldset className="grid gap-2">
      <legend className="font-semibold">Talent profiles</legend>
      <ul aria-label="Selected profiles" className="flex flex-wrap gap-2">
        {selected.map(({ id, displayName }) => (
          <li key={id}>
            <Button
              variant="outline"
              aria-label={'Remove ' + displayName}
              onClick={() =>
                setSelected(selected.filter((person) => person.id !== id))
              }
            >
              {displayName} ×
            </Button>
          </li>
        ))}
      </ul>
      <label className={field}>
        Find published profiles
        <input
          className={control}
          value={search}
          maxLength={80}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div>
        <Button variant="outline" onClick={() => setQuery(search.trim())}>
          Search profiles
        </Button>
      </div>
      {q && results.isPending && <p role="status">Searching profiles…</p>}
      {results.isError && <p role="alert">{results.error.message}</p>}
      {results.data?.length === 0 && (
        <p className="text-sm text-muted">No matching profiles.</p>
      )}
      {results.data
        ?.filter((person) => !selected.some(({ id }) => id === person.id))
        .map((person) => (
          <div key={person.id}>
            <Button
              variant="outline"
              disabled={selected.length >= 20}
              onClick={() => setSelected([...selected, person])}
            >
              Add {person.displayName}
            </Button>
          </div>
        ))}
    </fieldset>
  );
}

export function ArtworkUpload({ admin, label, image, onChange }) {
  return (
    <div className="grid min-w-0 gap-2">
      {image && (
        <div className="max-w-sm">
          <FilmImage landscape image={image} />
        </div>
      )}
      {admin && (
        <MediaPicker
          label={'Select ' + label.toLowerCase() + ' from library'}
          onSelect={onChange}
        />
      )}
      <ImageUpload
        label={label}
        onUpload={async (file) =>
          onChange(
            (
              await uploadImage(
                admin ? '/admin/media' : '/submissions/live-images',
                file,
                'post',
              )
            ).data,
          )
        }
      />
      {image && (
        <div>
          <Button variant="outline" onClick={() => onChange(undefined)}>
            Remove selection
          </Button>
        </div>
      )}
    </div>
  );
}

export function EventForm({
  admin = false,
  event,
  record,
  correction = false,
}) {
  const navigate = useNavigate();
  const initial = record?.eventProposal.event ?? event;
  const editing = Boolean(record || (admin && event));
  const [localError, setError] = useState('');
  const [poster, setPoster] = useState(
    record?.eventImages?.poster ??
      event?.poster ??
      (initial?.posterId && { id: initial.posterId }),
  );
  const [banner, setBanner] = useState(
    record?.eventImages?.banner ??
      event?.banner ??
      (initial?.bannerId && { id: initial.bannerId }),
  );
  const [talent, setTalent] = useState(
    record?.eventTalent ?? event?.talent ?? [],
  );
  const change = useChange(
    ['/admin/live', '/organizer/live', '/submissions', 'live'],
    (response) => {
      if (!editing)
        navigate((admin ? '/admin/live/' : '/submissions/') + response.data.id);
    },
  );
  function submit(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const optional = (name) => data.get(name)?.trim() || undefined;
    setError('');
    let schedule;
    try {
      schedule = readSchedule(data);
    } catch (error) {
      setError(
        error instanceof RangeError
          ? 'Enter a valid IANA timezone.'
          : error.message,
      );
      return;
    }
    const content = {
      ...schedule,
      title: optional('title'),
      summary: optional('summary'),
      description: optional('description'),
      category: optional('category'),
      topic: optional('topic'),
      language: optional('language'),
      venue: optional('venue'),
      videoUrl: optional('videoUrl'),
      rightsConfirmed: data.has('rightsConfirmed'),
      rightsNotes: optional('rightsNotes'),
      posterId: poster?.id,
      bannerId: banner?.id,
      talentIds: talent.map(({ id }) => id),
    };
    const submission = {
      title: content.title,
      summary: content.summary,
      eventProposal: {
        targetId:
          record?.eventProposal.targetId ?? (correction ? event.id : undefined),
        event: content,
      },
    };
    const target = admin
      ? event && '/admin/live/' + event.id
      : record && '/submissions/' + record.id;
    change.mutate({
      url: target || (admin ? '/admin/live' : '/submissions'),
      method: target ? 'patch' : 'post',
      data: admin
        ? {
            ...content,
            ...(event
              ? { revision: event.revision }
              : {
                  organizerId: optional('organizerId'),
                  plannedReplayUrl: optional('plannedReplayUrl'),
                  chatEnabled: data.has('chatEnabled'),
                  remindersEnabled: data.has('remindersEnabled'),
                }),
          }
        : { ...submission, ...(!record && { category: 'live' }) },
    });
  }
  return (
    <div className="grid min-w-0 gap-4">
      <Card className="grid min-w-0 gap-4 md:grid-cols-2">
        <ArtworkUpload
          admin={admin}
          label="Event poster"
          image={poster}
          onChange={setPoster}
        />
        <ArtworkUpload
          admin={admin}
          label="Event banner (optional)"
          image={banner}
          onChange={setBanner}
        />
      </Card>
      <form className="grid min-w-0 gap-4" onSubmit={submit}>
        <label className={field}>
          Event title
          <input
            name="title"
            className={control}
            required
            minLength={3}
            maxLength={140}
            defaultValue={initial?.title}
          />
        </label>
        <label className={field}>
          Short description
          <textarea
            name="summary"
            rows={2}
            className={control}
            required
            minLength={10}
            maxLength={280}
            defaultValue={initial?.summary}
          />
        </label>
        <label className={field}>
          Event description
          <textarea
            name="description"
            rows={5}
            className={control}
            required
            maxLength={6000}
            defaultValue={initial?.description}
          />
        </label>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Choice
            label="Event category"
            name="category"
            options={eventCategories}
            value={initial?.category ?? 'community'}
          />
          <Choice
            label="Primary language"
            name="language"
            options={languages}
            value={initial?.language ?? 'en'}
          />
          <label className={field}>
            Sport or topic
            <input
              name="topic"
              className={control}
              maxLength={100}
              defaultValue={initial?.topic}
            />
          </label>
          <label className={field}>
            Public venue
            <input
              name="venue"
              className={control}
              maxLength={200}
              defaultValue={initial?.venue}
            />
          </label>
          <ScheduleFields event={initial} />
        </div>
        <TalentPicker selected={talent} setSelected={setTalent} />
        {admin && !event && (
          <label className={field}>
            Organizer account ID (optional)
            <input name="organizerId" className={control} maxLength={36} />
          </label>
        )}
        {admin && !event && (
          <fieldset className="grid gap-2">
            <legend className="font-semibold">Event availability</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="chatEnabled" defaultChecked />
              Enable live chat
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="remindersEnabled" defaultChecked />
              Enable email reminders
            </label>
          </fieldset>
        )}
        <label className={field}>
          YouTube Live URL
          <input
            name="videoUrl"
            className={control}
            maxLength={2048}
            type="url"
            defaultValue={initial?.videoUrl ?? initial?.video?.sourceUrl}
          />
        </label>
        {admin && !event && (
          <label className={field}>
            Planned replay YouTube URL (optional)
            <input
              className={control}
              type="url"
              name="plannedReplayUrl"
              maxLength={2048}
            />
          </label>
        )}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="rightsConfirmed"
            defaultChecked={initial?.rightsConfirmed}
          />
          I confirm FDFS has permission to stream this event.
        </label>
        <label className={field}>
          Private rights notes
          <textarea
            name="rightsNotes"
            className={control}
            maxLength={1000}
            defaultValue={initial?.rightsNotes}
          />
        </label>
        <div>
          <Button type="submit" loading={change.isPending}>
            {editing ? 'Save event changes' : 'Create event draft'}
          </Button>
        </div>
        {(localError || change.isError) && (
          <p role="alert" className="text-sm text-danger-text">
            {localError || change.error?.message}
          </p>
        )}
        {editing && change.isSuccess && (
          <p role="status" className="text-sm text-success">
            Event changes saved.
          </p>
        )}
      </form>
    </div>
  );
}

export function EventProposalReview({ record, admin }) {
  const { event, targetId } = record.eventProposal;
  return (
    <Card className="grid min-w-0 gap-3 wrap-anywhere">
      <h2 className="text-lg font-semibold">
        {targetId ? 'Proposed event changes' : 'Proposed live event'}
      </h2>
      {targetId && (
        <DetailLink
          to={(admin ? '/admin/live/' : '/organizer/live/') + targetId}
        >
          Open current event
        </DetailLink>
      )}
      <p>
        {eventCategories[event.category]} · {languages[event.language]}
      </p>
      <p>
        {formatEventTime(event.startAt, event.timeZone)} ({event.timeZone})
        {event.endAt && ' to ' + formatEventTime(event.endAt, event.timeZone)}
      </p>
      <p className="whitespace-pre-wrap">{event.description}</p>
      {[event.topic, event.venue].filter(Boolean).map((value) => (
        <p key={value}>{value}</p>
      ))}
      {record.eventTalent?.length > 0 && (
        <p>
          Talent ·{' '}
          {record.eventTalent.map((person) => person.displayName).join(', ')}
        </p>
      )}
      {event.videoUrl && <p>YouTube URL · {event.videoUrl}</p>}
      <p>
        Streaming permission ·{' '}
        {event.rightsConfirmed ? 'Confirmed' : 'Awaiting confirmation'}
      </p>
      {event.rightsNotes && (
        <p className="whitespace-pre-wrap">
          Private rights notes · {event.rightsNotes}
        </p>
      )}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {record.eventImages?.poster && (
          <FilmImage landscape image={record.eventImages.poster} />
        )}
        {record.eventImages?.banner && (
          <FilmImage landscape image={record.eventImages.banner} />
        )}
      </div>
    </Card>
  );
}
