import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { languages } from '../../../../shared/films.js';
import { podcastBrand } from '../../../../shared/podcasts.js';
import { parseYouTube } from '../../../../shared/youtube.js';
import { Button } from '../../components/ui/Button.jsx';
import { TextInput } from '../../components/ui/fields.jsx';
import { Badge, Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { ErrorState, Spinner } from '../../components/ui/states.jsx';
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
import { ReleaseForm } from '../films/Manage.jsx';
import { EpisodeForm, ShowForm } from './Form.jsx';
import { EpisodePlayer } from './Player.jsx';

const root = '/admin/podcasts';
const episodes = root + '/episodes';
const showPath = root + '/show';
const keys = [
  showPath,
  episodes,
  'podcasts',
  'talent',
  'podcast-comments',
  '/admin/audit',
];
const statusOptions = ['draft', 'published', 'archived'].map((status) => [
  status,
  status,
]);
const columns = [
  {
    title: 'Episode',
    render: (record) => (
      <DetailLink to={episodes + '/' + record.id}>{record.title}</DetailLink>
    ),
  },
  {
    title: 'Number',
    render: (record) => 'S' + record.season + ' · E' + record.number,
  },
  { title: 'Language', render: (record) => languages[record.language] },
  { title: 'Release', render: (record) => date(record.releaseAt) },
  {
    title: 'Status',
    render: (record) => (
      <Badge tone={record.status === 'published' ? 'success' : 'neutral'}>
        {record.status}
      </Badge>
    ),
  },
];

function Nav() {
  return (
    <nav aria-label="Podcast administration" className="flex flex-wrap gap-x-4">
      <DetailLink to={root}>Episodes</DetailLink>
      <DetailLink to={showPath}>Configure show</DetailLink>
      <DetailLink to={root + '/comments'}>Comments</DetailLink>
      <DetailLink to={root + '/reports'}>Reports</DetailLink>
    </nav>
  );
}

export function AdminPodcasts() {
  const records = useRecords(episodes);
  return (
    <>
      <SectionHeading as="h1">Podcasts</SectionHeading>
      <Nav />
      <DetailLink to={episodes + '/new'}>Create episode</DetailLink>
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
        <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm">
          Search by title
          <TextInput type="search" name="q" maxLength={80} />
        </label>
        <Button type="submit">Search</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Publication status"
          options={statusOptions}
          value={records.params.status ?? ''}
          onChange={(value) => records.filter('status', value)}
        />
        <Select
          label="Language"
          options={Object.entries(languages)}
          value={records.params.language ?? ''}
          onChange={(value) => records.filter('language', value)}
        />
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          records.filter(
            'season',
            new FormData(event.currentTarget).get('season'),
          );
        }}
      >
        <label className="grid min-w-0 flex-1 basis-32 gap-1 text-sm">
          Season
          <TextInput type="number" min={1} max={999} name="season" />
        </label>
        <Button variant="outline" type="submit">
          Apply season
        </Button>
      </form>
      <Records
        records={records}
        columns={columns}
        label="Podcast episodes"
        empty="No podcast episodes found"
      />
    </>
  );
}

function StatusActions({ record, url, episode = false }) {
  const [selected, setSelected] = useState(null);
  const change = useChange(keys);
  const type = episode ? 'episode' : 'show';
  function confirm(action, release) {
    change.reset();
    const verb = action[0].toUpperCase() + action.slice(1);
    setSelected({
      title: verb + ' ' + type + '?',
      description: record.title ?? record.name,
      request: {
        url: url + '/status',
        method: 'post',
        data: {
          action,
          revision: record.revision,
          ...(release && { release }),
        },
      },
    });
  }
  return (
    <Card className="grid min-w-0 gap-3">
      <h2 className="text-xl font-semibold">Publication</h2>
      <div>
        <Badge>{record.status}</Badge>
      </div>
      {record.status === 'draft' &&
        (episode ? (
          <ReleaseForm
            current={record}
            publicationSchedule
            onRelease={(release) => confirm('publish', release)}
          />
        ) : (
          <div>
            <Button onClick={() => confirm('publish')}>Publish show</Button>
          </div>
        ))}
      {record.status === 'published' && episode && (
        <p className="wrap-anywhere text-sm text-muted">
          Publication {date(record.publicationAt)} · Full playback{' '}
          {date(record.releaseAt)}
        </p>
      )}
      {record.status !== 'archived' && (
        <div className="flex flex-wrap gap-2">
          {record.status === 'published' && (
            <Button variant="outline" onClick={() => confirm('unpublish')}>
              Unpublish
            </Button>
          )}
          <Button variant="outline" onClick={() => confirm('archive')}>
            Archive
          </Button>
        </div>
      )}
      <ConfirmAction
        action={selected}
        onClose={() => setSelected(null)}
        change={change}
      />
    </Card>
  );
}

export function AdminShow() {
  const result = useQuery({
    queryKey: [showPath],
    queryFn: ({ signal }) => get(showPath, signal),
  });
  const change = useChange(keys);
  const show = result.data?.data;
  return (
    <>
      <SectionHeading as="h1">Configure {podcastBrand.name}</SectionHeading>
      <Nav />
      {result.isPending && <Spinner label="Loading podcast show" />}
      {result.isError && (
        <ErrorState
          title="Could not load the show"
          description={result.error.message}
          onRetry={() => void result.refetch()}
        />
      )}
      {result.isSuccess && (
        <>
          {show && <StatusActions record={show} url={showPath} />}
          {show?.status !== 'archived' && (
            <ShowForm
              key={show?.revision ?? 'new'}
              show={show}
              change={change}
              save={(data) =>
                change.mutate({ method: 'put', url: showPath, data })
              }
            />
          )}
        </>
      )}
    </>
  );
}

export function NewEpisode() {
  const navigate = useNavigate();
  const change = useChange(keys, ({ data }) =>
    navigate(episodes + '/' + data.id),
  );
  return (
    <>
      <DetailLink to={root}>Back to episodes</DetailLink>
      <SectionHeading as="h1">Create podcast episode</SectionHeading>
      <DetailLink to="/admin/media">Open media library</DetailLink>
      <EpisodeForm
        save={(data) => change.mutate({ url: episodes, method: 'post', data })}
        change={change}
      />
    </>
  );
}

export function ManageEpisode() {
  const { id } = useParams();
  const url = episodes + '/' + id;
  const query = useQuery({
    queryKey: [episodes, id],
    queryFn: ({ signal }) => get(url, signal),
  });
  const change = useChange(keys);
  return (
    <>
      <DetailLink to={root}>Back to episodes</DetailLink>
      <SectionHeading as="h1">Manage podcast episode</SectionHeading>
      <QueryState query={query}>
        {(episode) => (
          <>
            <h2 className="text-xl font-semibold wrap-anywhere">
              {episode.title}
            </h2>
            <StatusActions record={episode} url={url} episode />
            {episode.status === 'draft' && (
              <>
                <EpisodePlayer
                  key={'review-' + episode.revision}
                  episode={{
                    ...episode,
                    mainVideo: episode.mainUrl
                      ? parseYouTube(episode.mainUrl)
                      : undefined,
                    teaser: episode.teaserUrl
                      ? parseYouTube(episode.teaserUrl)
                      : undefined,
                  }}
                />
                <DetailLink to="/admin/media">Open media library</DetailLink>
                <EpisodeForm
                  key={episode.revision}
                  episode={episode}
                  change={change}
                  save={(data) => change.mutate({ url, method: 'patch', data })}
                />
              </>
            )}
            {episode.status === 'published' && (
              <DetailLink to={'/podcasts/' + episode.slug}>
                Open public episode page
              </DetailLink>
            )}
            <DetailLink to={root + '/comments?episodeId=' + episode.id}>
              Moderate episode comments
            </DetailLink>
          </>
        )}
      </QueryState>
    </>
  );
}
