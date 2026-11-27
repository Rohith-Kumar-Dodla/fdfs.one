import {
  ContentGrid,
  ContentHeading,
  RecordFilters,
} from '../admin/ContentGrid.jsx';
import { can } from '../../../../shared/admin.js';
import { useAccount } from '../auth/guards.jsx';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import {
  filmLabels,
  filmPath,
  genres,
  languages,
} from '../../../../shared/films.js';
import { eventLocalTime, eventUtcTime } from '../../../../shared/live.js';
import { professions } from '../../../../shared/talent.js';
import { parseYouTube } from '../../../../shared/youtube.js';
import { Button } from '../../components/ui/Button.jsx';
import { Checkbox, TextInput } from '../../components/ui/fields.jsx';
import {
  Badge,
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import {
  ConfirmAction,
  date,
  DetailLink,
  get,
  QueryState,
  Records,
  Select,
  useChange,
  useRecords,
} from '../admin/common.jsx';
import { FilmForm } from './Form.jsx';
import { FilmImage } from './FilmImage.jsx';
import { SupportingVideos, VideoSection } from './Public.jsx';

const adminPath = '/admin/films';
const ownerPath = '/submissions/films';
const keys = [
  adminPath,
  ownerPath,
  'films',
  'talent',
  '/admin/audit',
  '/admin/overview',
  'site-homepage',
];
const statuses = ['draft', 'published', 'archived'];
const columns = (destination) => [
  {
    title: 'Title',
    render: (film) => (
      <DetailLink to={destination(film)}>{film.title}</DetailLink>
    ),
  },
  {
    title: 'Classification',
    render: (film) => filmLabels[film.classification],
  },
  {
    title: 'Status',
    render: (film) => (
      <Badge tone={film.status === 'published' ? 'success' : 'neutral'}>
        {film.status}
      </Badge>
    ),
  },
  { title: 'Release', render: (film) => date(film.releaseAt) },
];
const submissionColumns = [
  {
    title: 'Submission',
    render: (row) => (
      <DetailLink to={'/submissions/' + row.id}>{row.title}</DetailLink>
    ),
  },
  {
    title: 'Status',
    render: (row) => <Badge>{row.status.replaceAll('_', ' ')}</Badge>,
  },
  { title: 'Updated', render: (row) => date(row.updatedAt) },
];

export function ReleaseForm({
  onRelease,
  current,
  publicationSchedule = false,
  label = 'Review publication',
}) {
  const [error, setError] = useState('');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  return (
    <form
      className="grid min-w-0 gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const release = data.get('releaseAt');
        const publication = data.get('publicationAt');
        const zone = data.get('timezone').trim();
        try {
          setError('');
          onRelease({
            playbackChecked: true,
            releaseAt: release ? eventUtcTime(release, zone) : undefined,
            announce: data.has('announce'),
            ...(publication && {
              publicationAt: eventUtcTime(publication, zone),
            }),
          });
        } catch (failure) {
          setError(
            failure instanceof RangeError
              ? 'Enter a valid IANA timezone.'
              : failure.message,
          );
        }
      }}
    >
      <label className="grid min-w-0 gap-1 text-sm">
        Scheduled release (local time, optional)
        <TextInput
          type="datetime-local"
          className="min-w-0"
          name="releaseAt"
          defaultValue={eventLocalTime(
            current?.releaseAt > new Date().toISOString()
              ? current.releaseAt
              : null,
            timeZone,
          )}
        />
      </label>
      {publicationSchedule && (
        <label className="grid min-w-0 gap-1 text-sm">
          Scheduled publication (local time, optional)
          <TextInput
            type="datetime-local"
            className="min-w-0"
            name="publicationAt"
            defaultValue={eventLocalTime(
              current?.publicationAt > new Date().toISOString()
                ? current.publicationAt
                : null,
              timeZone,
            )}
          />
        </label>
      )}
      <label className="grid min-w-0 gap-1 text-sm">
        Timezone (IANA)
        <TextInput
          name="timezone"
          defaultValue={timeZone}
          required
          maxLength={64}
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <Checkbox name="announce" defaultChecked={Boolean(current?.announce)} />{' '}
        Show the announcement before release
      </label>
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <Checkbox name="playbackChecked" required /> I checked the rights
        confirmation and verified that the supplied videos play in an authorized
        embed.
      </label>
      {error && (
        <p className="text-sm text-danger-text" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button type="submit">{label}</Button>
      </div>
    </form>
  );
}

function ReviewVideos({ film }) {
  const preview = (source) => (source ? parseYouTube(source) : undefined);
  return (
    <>
      <VideoSection
        film={{
          title: film.title,
          mainVideo: preview(film.mainUrl),
          trailer: preview(film.trailerUrl),
        }}
      />
      <SupportingVideos
        extras={film.extras
          .map(({ title, url }) => ({ title, video: preview(url) }))
          .filter(({ video }) => video)}
      />
    </>
  );
}

export function FilmProposalReview({ record }) {
  const { film, images } = record.filmProposal;
  return (
    <Card className="grid min-w-0 gap-4 wrap-anywhere">
      <h2 className="text-lg font-semibold">
        {record.filmProposal.targetId
          ? 'Independent film correction'
          : 'Independent film proposal'}
      </h2>
      <p className="text-lg font-semibold">{film.title}</p>
      <p>{film.synopsis}</p>
      {film.description && (
        <p className="whitespace-pre-wrap">{film.description}</p>
      )}
      <p className="text-sm text-muted">
        {film.genres.map((key) => genres[key]).join(', ')} ·{' '}
        {languages[film.language]} · {film.runtimeMinutes} min ·{' '}
        {film.releaseYear}
      </p>
      {film.productionCompany && <p>Production · {film.productionCompany}</p>}
      {film.advisory && <p>Advisory · {film.advisory}</p>}
      {film.subtitles.length > 0 && (
        <p>
          Subtitles · {film.subtitles.map((key) => languages[key]).join(', ')}
        </p>
      )}
      <p>
        Rights confirmation ·{' '}
        {film.rightsConfirmed
          ? 'Confirmed by submitter'
          : 'Awaiting confirmation'}
      </p>
      {film.rightsNotes && (
        <p className="whitespace-pre-wrap">
          Private rights notes · {film.rightsNotes}
        </p>
      )}
      {film.credits.length > 0 && (
        <ul className="grid gap-2">
          {film.credits.map((credit, index) => (
            <li key={index}>
              {[
                credit.displayName,
                professions[credit.role],
                credit.character,
                credit.department,
              ]
                .filter(Boolean)
                .join(' · ')}
            </li>
          ))}
        </ul>
      )}
      {film.awards.length > 0 && (
        <ul className="grid gap-2">
          {film.awards.map(({ title, organization, year, source }, index) => (
            <li key={index}>
              {[title, organization, year].filter(Boolean).join(' · ')}
              {source && (
                <a
                  className="ml-2 inline-flex min-h-11 items-center text-accent underline"
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Supporting source
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {images?.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((image) => (
            <FilmImage
              image={image}
              key={image.id}
              landscape={image.id !== film.posterId}
            />
          ))}
        </div>
      )}
      <ReviewVideos film={film} />
    </Card>
  );
}

export function CreatorFilms() {
  const records = useRecords('/submissions', { category: 'film' });
  const films = useRecords(ownerPath);
  return (
    <Container className="grid min-w-0 gap-6 py-8">
      <SectionHeading
        as="h1"
        description="Submit independent short films and track their review."
      >
        My films
      </SectionHeading>
      <DetailLink to="/creator/films/new">Create film draft</DetailLink>
      <section className="grid min-w-0 gap-3">
        <h2 className="text-xl font-semibold">My film submissions</h2>
        <Select
          label="Moderation status"
          value={records.params.status ?? ''}
          onChange={(value) => records.filter('status', value)}
          options={[
            'draft',
            'submitted',
            'under_review',
            'approved',
            'rejected',
            'published',
            'archived',
          ].map((value) => [value, value.replaceAll('_', ' ')])}
        />
        <Records
          records={records}
          columns={submissionColumns}
          label="My film submissions"
          empty="No film submissions yet"
        />
      </section>
      <section className="grid min-w-0 gap-3">
        <h2 className="text-xl font-semibold">Managed films</h2>
        <Records
          records={films}
          columns={columns((film) =>
            film.status === 'archived'
              ? '/creator/films'
              : '/creator/films/' + film.id + '/correction',
          )}
          label="My managed films"
          empty="No films have been published from your submissions"
        />
      </section>
    </Container>
  );
}

export function CreatorFilmForm({ record, target }) {
  const navigate = useNavigate();
  const change = useChange(['/submissions'], ({ data }) => {
    if (!record) navigate('/submissions/' + data.id);
  });
  const existing = record?.filmProposal?.film ?? target;
  return (
    <FilmForm
      record={target ? { ...target, rightsConfirmed: false } : existing}
      images={record?.filmProposal?.images}
      change={change}
      button={record ? 'Save film proposal changes' : 'Create film draft'}
      save={(film) =>
        change.mutate({
          url: record ? '/submissions/' + record.id : '/submissions',
          method: record ? 'patch' : 'post',
          data: {
            ...(!record && { category: 'film' }),
            title: 'Film · ' + film.title,
            summary: 'Film synopsis · ' + film.synopsis,
            filmProposal: {
              targetId: record?.filmProposal?.targetId ?? target?.id,
              film,
            },
          },
        })
      }
    />
  );
}

export function NewCreatorFilm() {
  const { id } = useParams();
  const target = useQuery({
    queryKey: [ownerPath, id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => get(ownerPath + '/' + id, signal),
  });
  return (
    <Container className="grid min-w-0 gap-6 py-8">
      <DetailLink to="/creator/films">Back to my films</DetailLink>
      <SectionHeading as="h1">
        {id ? 'Propose a film correction' : 'Create independent film draft'}
      </SectionHeading>
      {id ? (
        <QueryState query={target}>
          {(film) => <CreatorFilmForm target={film} />}
        </QueryState>
      ) : (
        <CreatorFilmForm />
      )}
    </Container>
  );
}

export function AdminFilms({ classification }) {
  const { data: account } = useAccount();
  const records = useRecords(
    adminPath,
    classification ? { classification } : {},
  );
  const canCreate = classification && can(account, 'content', classification);
  const fields = [
    ['q', 'Search by title'],
    [
      'status',
      'Publication status',
      statuses.map((status) => [status, status]),
    ],
    ['genre', 'Genre', Object.entries(genres)],
    ['language', 'Language', Object.entries(languages)],
    [
      'sort',
      'Sort order',
      [
        ['newest', 'Newest release'],
        ['title', 'Title A to Z'],
        ['-title', 'Title Z to A'],
        ['year', 'Release year'],
      ],
    ],
    ...(!classification
      ? [
          [
            'classification',
            'Classification',
            Object.entries(filmLabels).filter(([value]) =>
              can(account, 'content', value),
            ),
          ],
        ]
      : []),
  ];
  return (
    <>
      <ContentHeading
        title={filmLabels[classification] ?? 'Films'}
        create={
          canCreate &&
          (classification === 'independent'
            ? '/admin/cinema/new'
            : '/admin/originals/new')
        }
        action={
          classification === 'independent' ? 'Add Cinema' : 'Add Original'
        }
      >
        <RecordFilters records={records} fields={fields} />
      </ContentHeading>
      {classification !== 'original' &&
        can(account, 'content', 'independent') && (
          <DetailLink to="/admin/submissions?category=film">
            Review independent film submissions
          </DetailLink>
        )}
      <ContentGrid
        records={records}
        empty="No films found"
        entry={(film) => ({
          title: film.title,
          image: film.banner ?? film.poster,
          meta: [
            film.releaseYear,
            languages[film.language],
            film.runtimeMinutes && film.runtimeMinutes + ' min',
          ]
            .filter(Boolean)
            .join(' · '),
          status:
            film.status === 'published' && film.availability === 'upcoming'
              ? 'scheduled'
              : film.status,
          edit: adminPath + '/' + film.id,
          preview:
            film.status === 'published' && film.availability === 'released'
              ? filmPath(film)
              : adminPath + '/' + film.id + '#preview',
        })}
      />
    </>
  );
}

export function NewOriginal({ classification = 'original' }) {
  const independent = classification === 'independent';
  const navigate = useNavigate();
  const change = useChange(keys, ({ data }) =>
    navigate(adminPath + '/' + data.id),
  );
  return (
    <>
      <DetailLink to={independent ? '/admin/cinema' : '/admin/originals'}>
        Back to {filmLabels[classification]}
      </DetailLink>
      <SectionHeading as="h1">
        {independent ? 'Add Cinema' : 'Add Original'}
      </SectionHeading>
      <DetailLink to="/admin/media">Open media library</DetailLink>
      <FilmForm
        admin
        creation
        classification={classification}
        button={independent ? 'Submit Cinema' : 'Submit Original'}
        change={change}
        save={(film) =>
          change.mutate({
            url: independent ? '/admin/cinema' : adminPath,
            method: 'post',
            data: { ...film, classification },
          })
        }
      />
    </>
  );
}

function FilmStatus({ film }) {
  const change = useChange(keys);
  const [action, setAction] = useState(null);
  function confirm(action, title, description, release) {
    change.reset();
    setAction({
      title,
      description,
      request: {
        url: adminPath + '/' + film.id + '/status',
        method: 'post',
        data: { action, revision: film.revision, ...(release && { release }) },
      },
    });
  }
  return (
    <Card className="grid min-w-0 gap-4">
      <h2 className="text-lg font-semibold">Publication</h2>
      <div>
        <Badge>{film.status}</Badge>
      </div>
      {film.status === 'draft' && (
        <ReleaseForm
          current={film}
          onRelease={(release) =>
            confirm(
              'publish',
              'Publish film?',
              'Public availability follows the selected release time.',
              release,
            )
          }
        />
      )}
      {film.status === 'published' && (
        <>
          <p>Release · {date(film.releaseAt)}</p>
          <DetailLink to={filmPath(film)}>Open public film page</DetailLink>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {film.status === 'published' && (
          <Button
            variant="outline"
            onClick={() =>
              confirm(
                'unpublish',
                'Unpublish film?',
                'The film will return to draft and leave public pages.',
              )
            }
          >
            Unpublish
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() =>
            confirm(
              'archive',
              'Archive film?',
              'The record and its relationships will be retained and public access will end.',
            )
          }
        >
          Archive
        </Button>
      </div>
      <ConfirmAction
        action={action}
        onClose={() => setAction(null)}
        change={change}
      />
    </Card>
  );
}

export function AdminFilmDetail() {
  const { id } = useParams();
  const url = adminPath + '/' + id;
  const query = useQuery({
    queryKey: [adminPath, id],
    queryFn: ({ signal }) => get(url, signal),
  });
  const change = useChange(keys);
  return (
    <>
      <DetailLink to={adminPath}>Back to films</DetailLink>
      <SectionHeading as="h1">Manage film</SectionHeading>
      <QueryState query={query}>
        {(film) => (
          <>
            <div className="grid min-w-0 gap-2 wrap-anywhere">
              <h2 className="text-xl font-semibold">{film.title}</h2>
              <p className="text-sm text-muted">
                {filmLabels[film.classification]} · {film.slug}
              </p>
              <p>{film.synopsis}</p>
            </div>
            {film.status === 'archived' ? (
              <p className="text-muted">Archived films are read-only.</p>
            ) : (
              <FilmStatus film={film} />
            )}
            {film.status === 'draft' ||
            (film.status === 'published' && !film.creatorId) ? (
              <>
                <div id="preview" tabIndex={-1}>
                  <ReviewVideos key={film.revision} film={film} />
                </div>
                <DetailLink to="/admin/media">Open media library</DetailLink>
                <FilmForm
                  key={film.id + '-' + film.revision}
                  admin
                  record={film}
                  change={change}
                  save={(data) =>
                    change.mutate({
                      url,
                      method: 'patch',
                      data: {
                        ...data,
                        revision: film.revision,
                        ...(film.status === 'published' && {
                          keepPublished: true,
                        }),
                      },
                    })
                  }
                />
              </>
            ) : (
              film.status === 'published' && (
                <p className="text-sm text-muted">
                  Unpublish to edit creator-submitted metadata.
                </p>
              )
            )}
          </>
        )}
      </QueryState>
    </>
  );
}
