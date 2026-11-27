import { CompactMovieForm } from '../admin/CompactCatalogueForms.jsx';
import {
  ContentGrid,
  ContentHeading,
  RecordFilters,
} from '../admin/ContentGrid.jsx';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { languages } from '../../../../shared/films.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { ErrorState, Spinner } from '../../components/ui/states.jsx';
import {
  ConfirmAction,
  DetailLink,
  get,
  readable,
  useChange,
  useRecords,
} from '../admin/common.jsx';
import { ImagePreview } from '../media/Images.jsx';
import { MovieForm, movieGenres } from './MovieForm.jsx';

const path = '/admin/movies';
const keys = [path, '/admin/audit', 'talent', '/admin/overview'];
const options = (values) => values.map((value) => [value, readable(value)]);
export function MoviesAdmin() {
  const records = useRecords(path);
  return (
    <>
      <ContentHeading
        title="Movie Catalogue"
        create={path + '/new'}
        action="Add Movie"
      >
        <RecordFilters
          records={records}
          fields={[
            ['q', 'Search movies'],
            ['status', 'Status', options(['draft', 'published', 'archived'])],
            ['genre', 'Genre', Object.entries(movieGenres)],
            ['language', 'Language', Object.entries(languages)],
            [
              'sort',
              'Sort by',
              options(['release', 'published', 'title', 'rating', 'popular']),
            ],
          ]}
        />
      </ContentHeading>
      <ContentGrid
        records={records}
        empty="No movies match these filters"
        entry={(row) => ({
          title: row.title,
          image: row.backdrop ?? row.poster,
          meta: [row.releaseYear, languages[row.language]]
            .filter(Boolean)
            .join(' · '),
          edit: path + '/' + row.id,
          preview:
            row.status === 'published'
              ? '/movies/' + row.slug
              : path + '/' + row.id + '?preview=1',
        })}
      />
    </>
  );
}
function MoviePreview({ record }) {
  return (
    <Card
      className="grid min-w-0 gap-3 wrap-anywhere"
      aria-label="Administrator movie preview"
    >
      <h2 className="text-xl font-semibold">{record.title}</h2>
      {record.poster && (
        <ImagePreview
          image={record.poster}
          alt={record.poster.alt || record.title}
        />
      )}
      <p className="text-sm text-muted">
        {[
          readable(record.status),
          record.releaseYear,
          record.runtimeMinutes && record.runtimeMinutes + ' min',
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {record.synopsis && <p>{record.synopsis}</p>}
      {record.description && (
        <p className="whitespace-pre-wrap">{record.description}</p>
      )}
      {!!record.credits.length && (
        <ul className="grid gap-1">
          {record.credits.map(({ name, role, character }, i) => (
            <li key={i}>
              {name} · {readable(role)}
              {character && ' · ' + character}
            </li>
          ))}
        </ul>
      )}
      {record.trailerUrl && (
        <a
          className="justify-self-start text-accent underline"
          href={record.trailerUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open official trailer
        </a>
      )}
    </Card>
  );
}
export function NewMovie() {
  return (
    <>
      <SectionHeading as="h1">Add Movie</SectionHeading>
      <CompactMovieForm />
    </>
  );
}

export function ManageMovie() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(null);
  const [params] = useSearchParams();
  const [preview, setPreview] = useState(params.get('preview') === '1');
  const [feedback, setFeedback] = useState('');
  const url = id ? path + '/' + id : path;
  const query = useQuery({
    queryKey: [path, id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => get(url, signal).then(({ data }) => data),
  });
  const save = useChange(keys, (result) => {
    setFeedback('Movie saved.');
    if (!id) navigate(path + '/' + result.data.id, { replace: true });
  });
  const status = useChange(keys, () =>
    setFeedback('Publication status updated.'),
  );
  const record = query.data;
  const request = (data) => {
    setFeedback('');
    save.mutate({ url, method: id ? 'patch' : 'post', data });
  };
  return (
    <>
      <DetailLink to={path}>Back to movie catalogue</DetailLink>
      <SectionHeading as="h1">
        {id ? 'Manage movie' : 'Create movie'}
      </SectionHeading>
      {feedback && (
        <p role="status" className="text-success">
          {feedback}
        </p>
      )}
      {id && query.isPending && <Spinner label="Loading movie" />}
      {query.isError && (
        <ErrorState
          title="Could not load movie"
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      )}
      {record && (
        <>
          <p className="text-muted wrap-anywhere">
            {record.title} · {readable(record.status)} · {record.slug}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              aria-expanded={preview}
              onClick={() => setPreview(!preview)}
            >
              {preview ? 'Close preview' : 'Preview movie'}
            </Button>
            {record.status !== 'archived' &&
              [
                record.status === 'draft' ? 'publish' : 'unpublish',
                'archive',
              ].map((action) => (
                <Button
                  key={action}
                  variant="outline"
                  onClick={() => {
                    status.reset();
                    const label =
                      action[0].toUpperCase() + action.slice(1) + ' movie';
                    setConfirm({
                      title: label + '?',
                      description: record.title,
                      request: {
                        url: url + '/status',
                        method: 'post',
                        data: { action, revision: record.revision },
                      },
                    });
                  }}
                >
                  {action[0].toUpperCase() + action.slice(1)} movie
                </Button>
              ))}
          </div>
          {preview && <MoviePreview record={record} />}
        </>
      )}
      {(!id || (record && record.status !== 'archived')) && (
        <MovieForm
          key={record ? record.id + ':' + record.revision : 'new'}
          record={record}
          save={request}
          pending={save.isPending}
          error={save.error}
        />
      )}
      <ConfirmAction
        action={confirm}
        change={status}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
