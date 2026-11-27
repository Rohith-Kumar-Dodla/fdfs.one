import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { genres, languages } from '../../../../shared/films.js';
import { eventLocalTime, eventUtcTime } from '../../../../shared/live.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import {
  ArtworkField,
  CompactError,
  CompactField,
  RightsDialog,
  supportingPayload,
  useContentNotice,
  useSupportingVideos,
} from './CompactFields.jsx';
import { control, get, useChange } from './common.jsx';
import {
  SupportingVideos,
  useAutomaticVideo,
  VideoPreview,
  VideoURL,
} from '../media/AutomaticVideo.jsx';
import { ProfileSelection } from './ProfileSelection.jsx';

const options = (values) =>
  Object.entries(values).map(([key, label]) => (
    <option value={key} key={key}>
      {label}
    </option>
  ));
const languageFrom = (video) => {
  const code = video.metadata?.language?.toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(languages, code) ? code : 'und';
};
const browserZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
const trim = (form, key) => form.get(key)?.trim();
const publicationKeys = [
  '/admin/overview',
  'homepage-discovery',
  'site-homepage',
  'public-catalogue',
];

function Frames({ video, name, setName, titleLabel, fallback, limit }) {
  const duration = video.metadata?.durationSeconds;
  return (
    <>
      <CompactField
        label={titleLabel}
        name="title"
        required
        maxLength={140}
        value={name ?? video.metadata?.title?.trim().slice(0, 140) ?? ''}
        onChange={(event) => setName(event.target.value)}
      />
      <VideoPreview video={video} duration label={false} />
      {video.id &&
        !video.pending &&
        (!duration || Math.ceil(duration / 60) > limit) && (
          <CompactField
            label={fallback}
            name="manualMinutes"
            type="number"
            min="1"
            max={limit}
            required
          />
        )}
    </>
  );
}

function useSubmission({ target, path, message, keys }) {
  const navigate = useNavigate();
  const change = useChange(
    [path, ...keys, ...publicationKeys],
    useContentNotice(navigate, target, message),
  );
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  function submit(event, prepare) {
    event.preventDefault();
    if (change.isPending || confirmation) return;
    try {
      setError('');
      setConfirmation(prepare(new FormData(event.currentTarget)));
    } catch (failure) {
      setError(failure.message);
    }
  }
  function proceed() {
    if (!confirmation || change.isPending) return;
    setConfirmation(null);
    change.mutate({ url: path, method: 'post', data: confirmation.payload });
  }
  return {
    change,
    error,
    confirmation,
    submit,
    proceed,
    close: () => setConfirmation(null),
  };
}
function Confirmation({ form }) {
  return (
    <RightsDialog
      action={form.confirmation?.message}
      close={form.close}
      proceed={form.proceed}
      {...form.confirmation?.rights}
    />
  );
}

export function CompactFilmForm({ classification }) {
  const original = classification === 'original';
  const path = original ? '/admin/films' : '/admin/cinema';
  const form = useSubmission({
    target: original ? '/admin/originals' : '/admin/cinema',
    path,
    message: 'Film saved.',
    keys: ['/admin/films', 'films', 'talent'],
  });
  const [source, setSource] = useState('');
  const [title, setTitle] = useState(null);
  const [description, setDescription] = useState(null);
  const [language, setLanguage] = useState(null);
  const [publication, setPublication] = useState('now');
  const [banner, setBanner] = useState([]);
  const [images, setImages] = useState([]);
  const [credits, setCredits] = useState([]);
  const [videos, videoActions] = useSupportingVideos();
  const video = useAutomaticVideo(classification, source);
  const currentTitle = title ?? video.metadata?.title ?? '';
  function prepare(data) {
    if (!video.id) throw new Error('Enter a valid YouTube video URL.');
    const body = trim(data, 'description');
    const seconds = video.metadata?.durationSeconds;
    const runtime =
      seconds && Math.ceil(seconds / 60) <= 300
        ? Math.ceil(seconds / 60)
        : Number(data.get('manualMinutes'));
    if (!runtime) throw new Error('Enter the film runtime to continue.');
    const releaseAt =
      publication === 'schedule'
        ? eventUtcTime(data.get('scheduledAt'), data.get('timeZone').trim())
        : undefined;
    if (releaseAt && Date.parse(releaseAt) <= Date.now())
      throw new Error('Choose a future release date.');
    return {
      message:
        publication === 'draft'
          ? 'Save film draft'
          : 'Confirm film publication',
      rights: { original, draft: publication === 'draft' },
      payload: {
        classification,
        title: trim(data, 'title'),
        synopsis: body.slice(0, 280),
        description: body,
        genres: [data.get('genre')],
        language: data.get('language'),
        runtimeMinutes: runtime,
        mainUrl: source.trim(),
        videoArtwork: video.artwork?.key,
        posterId: video.artwork ? undefined : (images[0]?.id ?? banner[0]?.id),
        bannerId: banner[0]?.id,
        galleryIds: images.map(({ id }) => id),
        extras: supportingPayload(videos, video.id),
        credits: credits.map(({ profile, label }) => ({
          personalityId: profile.id,
          role: profile.professions[0] ?? 'other',
          character: label.trim(),
        })),
        rightsConfirmed: true,
        ...(original && { originalAttested: true }),
        ...(publication !== 'draft' && {
          release: { playbackChecked: true, releaseAt },
        }),
      },
    };
  }
  return (
    <Card className="p-4!">
      <form
        className="grid min-w-0 gap-4"
        onSubmit={(event) => form.submit(event, prepare)}
      >
        <VideoURL value={source} change={setSource} />
        <Frames
          video={video}
          name={title}
          setName={setTitle}
          titleLabel="Cinema title"
          fallback="Runtime in minutes"
          limit={300}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Genre
            <select name="genre" className={control} required defaultValue="">
              <option value="">Select genre</option>
              {options(genres)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Primary language
            <select
              name="language"
              className={control}
              value={language ?? languageFrom(video)}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {options(languages)}
            </select>
          </label>
        </div>
        <CompactField
          label="Description"
          area
          name="description"
          required
          maxLength={6000}
          value={
            description ??
            video.metadata?.description?.trim().slice(0, 6000) ??
            ''
          }
          onChange={(event) => setDescription(event.target.value)}
        />
        <ArtworkField
          category="films"
          title={currentTitle}
          label="Supporting banner"
          images={banner}
          setImages={setBanner}
        />
        <ArtworkField
          category="films"
          title={currentTitle}
          label="Supporting images"
          images={images}
          setImages={setImages}
          max={8}
        />
        <SupportingVideos
          module={classification}
          items={videos}
          update={videoActions}
        />
        <ProfileSelection
          category="short-films"
          label="Cast and crew"
          rows={credits}
          setRows={setCredits}
        />
        <label className="grid gap-1 text-sm">
          Publishing option
          <select
            className={control}
            value={publication}
            onChange={(event) => setPublication(event.target.value)}
          >
            <option value="now">Publish Now</option>
            <option value="draft">Draft</option>
            <option value="schedule">Schedule</option>
          </select>
        </label>
        {publication === 'schedule' && <Schedule zone={browserZone()} />}
        <CompactError error={form.error} change={form.change} />
        <Button
          className="w-fit"
          type="submit"
          loading={form.change.isPending}
          disabled={video.pending || videos.some((item) => item.pending)}
        >
          {original ? 'Submit Original' : 'Submit Cinema'}
        </Button>
      </form>
      <Confirmation form={form} />
    </Card>
  );
}

function Schedule({ zone, initial }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CompactField
        label="Date and time"
        name="scheduledAt"
        type="datetime-local"
        defaultValue={eventLocalTime(initial, zone)}
        required
      />
      <CompactField
        label="Timezone"
        name="timeZone"
        defaultValue={zone}
        maxLength={64}
        required
      />
    </div>
  );
}

function ResourceLinks({ rows, set }) {
  const update = (id, field, value) =>
    set(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  return (
    <fieldset className="grid gap-2">
      <legend className="font-semibold">Useful links</legend>
      {rows.map((row) => (
        <div className="grid gap-2 sm:grid-cols-2" key={row.id}>
          <CompactField
            label="Link URL"
            type="url"
            maxLength={2048}
            required
            value={row.url}
            onChange={(event) => update(row.id, 'url', event.target.value)}
          />
          <CompactField
            label="Display label (optional)"
            maxLength={80}
            value={row.label}
            onChange={(event) => update(row.id, 'label', event.target.value)}
          />
          <Button
            variant="ghost"
            className="w-fit"
            onClick={() => set(rows.filter((item) => item.id !== row.id))}
          >
            Remove link
          </Button>
        </div>
      ))}
      {rows.length < 15 && (
        <Button
          variant="outline"
          className="w-fit"
          onClick={() =>
            set([...rows, { id: crypto.randomUUID(), url: '', label: '' }])
          }
        >
          Add link
        </Button>
      )}
    </fieldset>
  );
}

export function CompactEpisodeForm() {
  const path = '/admin/podcasts/episodes';
  const form = useSubmission({
    target: '/admin/podcasts',
    path,
    message: 'Episode saved.',
    keys: ['podcasts', 'talent'],
  });
  const next = useQuery({
    queryKey: [path, 'next-number'],
    queryFn: ({ signal }) =>
      get(path + '/next-number', signal).then(({ data }) => data),
  });
  const show = useQuery({
    queryKey: ['/admin/podcasts/show'],
    queryFn: ({ signal }) =>
      get('/admin/podcasts/show', signal).then(({ data }) => data),
  });
  const [source, setSource] = useState('');
  const [title, setTitle] = useState(null);
  const [guest, setGuest] = useState(null);
  const [number, setNumber] = useState(null);
  const [images, setImages] = useState([]);
  const [people, setPeople] = useState([]);
  const [links, setLinks] = useState([]);
  const [videos, videoActions] = useSupportingVideos();
  const video = useAutomaticVideo('podcasts', source);
  const currentTitle = title ?? video.metadata?.title ?? '';
  function prepare(data) {
    if (!video.id) throw new Error('Enter a valid YouTube video URL.');
    const duration =
      video.metadata?.durationSeconds <= 28800
        ? video.metadata.durationSeconds
        : Number(data.get('manualMinutes')) * 60;
    if (!duration) throw new Error('Enter the episode duration to continue.');
    const description = video.metadata?.description?.trim();
    const publish = show.data?.status === 'published';
    const topics = [
      ...new Set(
        trim(data, 'topics')
          .split(',')
          .map((topic) =>
            topic
              .normalize('NFKD')
              .toLowerCase()
              .replace(/\p{M}/gu, '')
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''),
          )
          .filter(Boolean),
      ),
    ];
    if (topics.length > 12 || topics.some((topic) => topic.length > 40))
      throw new Error('Enter up to 12 topics, each within 40 characters.');
    return {
      message: publish ? 'Confirm episode publication' : 'Save episode draft',
      rights: { draft: !publish },
      payload: {
        title: trim(data, 'title'),
        guestName: trim(data, 'guest') || undefined,
        number: Number(data.get('number')),
        season: next.data?.season ?? 1,
        language: languageFrom(video),
        duration,
        synopsis: description?.slice(0, 280) || undefined,
        notes: description?.slice(0, 12000) || undefined,
        videoArtwork: video.artwork?.key,
        mainUrl: source.trim(),
        topics,
        galleryIds: images.map(({ id }) => id),
        ...(images.length > 0 &&
          !video.artwork && { thumbnailId: images[0].id }),
        extras: supportingPayload(videos, video.id),
        participants: people.map(({ profile, role }) => ({
          personalityId: profile.id,
          role,
        })),
        links: links.map(({ url, label }) => ({
          url: url.trim(),
          label: label.trim() || new URL(url).hostname.slice(0, 80),
        })),
        rightsConfirmed: true,
        ...(publish && { release: { playbackChecked: true } }),
      },
    };
  }
  return (
    <Card className="p-4!">
      <form
        className="grid gap-4"
        onSubmit={(event) => form.submit(event, prepare)}
      >
        <VideoURL value={source} change={setSource} />
        <Frames
          video={video}
          name={title}
          setName={setTitle}
          titleLabel="Episode name"
          fallback="Duration in minutes"
          limit={480}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <CompactField
            label="Guest name"
            name="guest"
            maxLength={240}
            value={
              guest ??
              people
                .filter((row) => row.role === 'guest')
                .map(({ profile }) => profile.displayName)
                .join(', ')
                .slice(0, 240)
            }
            onChange={(event) => setGuest(event.target.value)}
          />
          <CompactField
            label="Episode number"
            name="number"
            type="number"
            required
            min="1"
            max="9999"
            value={number ?? next.data?.number ?? ''}
            onChange={(event) => setNumber(event.target.value)}
          />
        </div>
        <CompactField
          label="Topics discussed (comma-separated)"
          name="topics"
          maxLength={500}
        />
        <SupportingVideos
          module="podcasts"
          items={videos}
          update={videoActions}
        />
        <ArtworkField
          category="podcasts"
          title={currentTitle}
          label="Supporting images"
          images={images}
          setImages={setImages}
          max={8}
        />
        <ProfileSelection
          label="Associated Talent Profiles"
          podcast
          rows={people}
          setRows={setPeople}
        />
        <ResourceLinks rows={links} set={setLinks} />
        <CompactError error={form.error} change={form.change} />
        <Button
          className="w-fit"
          type="submit"
          loading={form.change.isPending}
          disabled={
            video.pending ||
            show.isPending ||
            videos.some((item) => item.pending)
          }
        >
          Submit Episode
        </Button>
      </form>
      <Confirmation form={form} />
    </Card>
  );
}

export function CompactLiveForm() {
  const path = '/admin/live';
  const form = useSubmission({
    target: path,
    path,
    message: 'Live event published.',
    keys: ['live'],
  });
  const [source, setSource] = useState('');
  const [availability, setAvailability] = useState('upcoming');
  const [scheduleEdit, setScheduleEdit] = useState(false);
  const [poster, setPoster] = useState([]);
  const video = useAutomaticVideo('live', source);
  const metadata = video.metadata;
  const title = metadata?.title?.trim().slice(0, 140);
  const description = metadata?.description?.trim().slice(0, 6000);
  const scheduled = metadata?.scheduledStartAt;
  const future = Date.parse(scheduled) > Date.now();
  const live = availability === 'live';
  const showFallback = Boolean(video.id && !video.pending);
  function prepare(data) {
    if (!video.id) throw new Error('Enter a valid YouTube Live URL.');
    if (metadata?.actualEndAt || (live && metadata?.broadcast === 'upcoming'))
      throw new Error(
        'YouTube reports that this broadcast is not live. Check its current status.',
      );
    const timeZone = trim(data, 'timeZone') || browserZone();
    const startAt = live
      ? new Date().toISOString()
      : future && !scheduleEdit
        ? scheduled
        : eventUtcTime(data.get('scheduledAt'), timeZone);
    const details =
      description?.length >= 10 ? description : trim(data, 'description');
    const eventTitle = title?.length >= 3 ? title : trim(data, 'title');
    const summary = details.slice(0, 280);
    if (summary.length < 10)
      throw new Error('Enter a description of at least 10 characters.');
    if (!video.artwork && !poster.length)
      throw new Error('Choose authorized event artwork.');
    return {
      message: 'Confirm event publication',
      rights: { live },
      payload: {
        title: eventTitle,
        summary,
        description: details,
        category: 'community',
        language: languageFrom(video),
        videoUrl: source.trim(),
        publication: live
          ? { mode: 'live', broadcasting: true }
          : { mode: 'upcoming' },
        startAt,
        timeZone,
        rightsConfirmed: true,
        remindersEnabled: true,
        chatEnabled: false,
        ...(video.artwork && {
          videoArtwork: video.artwork.key,
          providerArtworkApproved: true,
        }),
        posterId: poster[0]?.id,
      },
    };
  }
  return (
    <Card className="p-4!">
      <form
        className="grid gap-4"
        onSubmit={(event) => form.submit(event, prepare)}
      >
        <VideoURL
          label="YouTube Live URL"
          value={source}
          change={(value) => {
            setSource(value);
            setScheduleEdit(false);
            setPoster([]);
          }}
        />
        <VideoPreview video={video} />
        {description && (
          <p className="line-clamp-3 text-sm text-muted">{description}</p>
        )}
        {showFallback && (!title || title.length < 3) && (
          <CompactField
            label="Event title"
            name="title"
            required
            minLength={3}
            maxLength={140}
          />
        )}
        {showFallback && (!description || description.length < 10) && (
          <CompactField
            label="Event description"
            name="description"
            area
            required
            minLength={10}
            maxLength={6000}
          />
        )}
        {showFallback && !video.artwork && (
          <ArtworkField
            label="Event artwork"
            images={poster}
            setImages={setPoster}
          />
        )}
        <label className="grid gap-1 text-sm">
          Event availability
          <select
            className={control}
            value={availability}
            onChange={(event) => setAvailability(event.target.value)}
          >
            <option value="upcoming">Upcoming</option>
            <option value="live">Live Now</option>
          </select>
        </label>
        {!live && showFallback && future && !scheduleEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <time dateTime={scheduled}>
              {new Date(scheduled).toLocaleString()}
            </time>
            <Button variant="outline" onClick={() => setScheduleEdit(true)}>
              Correct schedule
            </Button>
          </div>
        )}
        {!live && showFallback && (!future || scheduleEdit) && (
          <Schedule
            zone={browserZone()}
            initial={future ? scheduled : undefined}
          />
        )}
        <CompactError error={form.error} change={form.change} />
        <Button
          className="w-fit"
          type="submit"
          loading={form.change.isPending}
          disabled={video.pending}
        >
          Submit Event
        </Button>
      </form>
      <Confirmation form={form} />
    </Card>
  );
}
