import { CompactEpisodeForm } from '../admin/CompactVideoForms.jsx';
import {
  ContentGrid,
  ContentHeading,
  RecordFilters,
} from '../admin/ContentGrid.jsx';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { languages } from '../../../../shared/films.js';
import { podcastBrand } from '../../../../shared/podcasts.js';
import { parseYouTube } from '../../../../shared/youtube.js';
import { Button } from '../../components/ui/Button.jsx';
import { Badge, Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { ErrorState, Spinner } from '../../components/ui/states.jsx';
import {
  ConfirmAction,
  date,
  DetailLink,
  get,
  QueryState,
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
  '/admin/overview',
  'site-homepage',
];
const statusOptions = ['draft', 'published', 'archived'].map((status) => [
  status,
  status,
]);
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
      <ContentHeading
        title="404 Reality Not Found"
        create={episodes + '/new'}
        action="Create Episode"
      >
        <RecordFilters
          records={records}
          fields={[
            ['q', 'Search by title'],
            ['status', 'Publication status', statusOptions],
            ['language', 'Language', Object.entries(languages)],
            ['season', 'Season', undefined, 'number', 1, 999],
          ]}
        />
      </ContentHeading>
      <Nav />
      <ContentGrid
        records={records}
        empty="No podcast episodes found"
        entry={(episode) => ({
          title: episode.title,
          image: episode.thumbnail,
          meta:
            'S' +
            episode.season +
            ' · E' +
            episode.number +
            ' · ' +
            languages[episode.language],
          status:
            episode.status === 'published' &&
            episode.availability === 'upcoming'
              ? 'scheduled'
              : episode.status,
          edit: episodes + '/' + episode.id,
          preview:
            episode.status === 'published' &&
            episode.availability === 'released'
              ? '/podcasts/' + episode.slug
              : episodes + '/' + episode.id + '#preview',
        })}
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
  return (
    <>
      <SectionHeading as="h1">Create Episode</SectionHeading>
      <CompactEpisodeForm />
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
            {episode.status !== 'archived' && (
              <>
                <div id="preview" tabIndex={-1}>
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
                </div>
                <DetailLink to="/admin/media">Open media library</DetailLink>
                <EpisodeForm
                  key={episode.revision}
                  episode={episode}
                  change={change}
                  save={(data) =>
                    change.mutate({
                      url,
                      method: 'patch',
                      data: {
                        ...data,
                        ...(episode.status === 'published' && {
                          keepPublished: true,
                        }),
                      },
                    })
                  }
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
