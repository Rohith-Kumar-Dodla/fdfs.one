import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { genres, languages, filmPath } from '../../../../shared/films.js';
import { eventCategories, formatEventTime } from '../../../../shared/live.js';
import { podcastBrand, timestamp } from '../../../../shared/podcasts.js';
import { professions } from '../../../../shared/talent.js';
import { talentCategories } from '../../../../shared/public-home.js';
import { apiClient } from '../../api/client.js';
import { SectionHeading } from '../../components/ui/surfaces.jsx';
import {
  CatalogueCard,
  CatalogueHeading,
  CatalogueResults,
  FilterDrawer,
  PublicCatalogue,
  useCatalogueParams,
  posters,
} from './Catalogue.jsx';
import { ReviewStrip } from './ReviewComposer.jsx';

const search = (label, key = 'q') => ({ key, label });
const select = (key, label, options) => ({ key, label, options });
const choices = Object.entries;
const availability = [
  ['released', 'Released'],
  ['upcoming', 'Upcoming'],
];
const filmFilters = [
  search('Search by title'),
  select('genre', 'Genre', choices(genres)),
  select('language', 'Language', choices(languages)),
  { key: 'year', label: 'Release year', type: 'number', min: 1888, max: 2100 },
  select('availability', 'Release availability', availability),
  select('minimumRating', 'Minimum rating', [
    ['2', '2 stars'],
    ['3', '3 stars'],
    ['4', '4 stars'],
    ['4.5', '4.5 stars'],
  ]),
  select('sort', 'Sort by', [
    ['newest', 'Release date'],
    ['title', 'Title A–Z'],
    ['-title', 'Title Z–A'],
    ['year', 'Release year'],
  ]),
];
const podcastFilters = [
  search('Search episodes'),
  select('language', 'Language', choices(languages)),
  search('Topic', 'topic'),
  { key: 'season', label: 'Season', type: 'number', min: 1, max: 1000 },
  select('availability', 'Release availability', availability),
  select('sort', 'Sort by', [
    ['newest', 'Newest'],
    ['oldest', 'Oldest'],
    ['number', 'Episode number'],
  ]),
];
const eventFilters = [
  search('Search events'),
  select('category', 'Category', choices(eventCategories)),
  { key: 'from', label: 'From date (UTC)', type: 'date' },
  { key: 'to', label: 'Through date (UTC)', type: 'date' },
  select('sort', 'Sort by', [
    ['soonest', 'Soonest'],
    ['latest', 'Latest'],
  ]),
];
const talentFilters = [
  search('Search by name'),
  select('category', 'Personality category', choices(talentCategories)),
  select('profession', 'Profession', choices(professions)),
  select('sort', 'Sort by', [
    ['name', 'Name A–Z'],
    ['-name', 'Name Z–A'],
    ['newest', 'Recently published'],
  ]),
];

function useListing(path, params, refresh) {
  return useQuery({
    queryKey: ['public-catalogue', path, params],
    meta: { public: true },
    queryFn: ({ signal }) => apiClient.get(path, { params, signal }),
    refetchInterval: refresh,
  });
}
function Catalogue({
  fields,
  title,
  description,
  path,
  extra = {},
  empty,
  portrait = false,
  children,
  after,
}) {
  const { values, update, page } = useCatalogueParams(fields);
  const query = useListing(path, { ...values, ...extra, page, limit: 20 });
  return (
    <PublicCatalogue>
      <CatalogueHeading
        title={title}
        description={description}
        actions={
          <FilterDrawer fields={fields} values={values} apply={update} />
        }
      />
      <CatalogueResults
        page={page}
        onPage={(page) => update({ page })}
        filtered={Object.keys(values).length > 0}
        query={query}
        empty={empty}
        landscape={!portrait}
      >
        {children}
      </CatalogueResults>
      {query.isSuccess && after}
    </PublicCatalogue>
  );
}
export function FilmDirectory({ classification }) {
  const independent = classification === 'independent';
  return (
    <Catalogue
      fields={filmFilters}
      title={independent ? 'FDFS Cinema' : 'FDFS Originals'}
      description={
        independent
          ? 'Independent short films from filmmakers with a point of view.'
          : 'Short films developed and produced in-house by FDFS.'
      }
      path="/films"
      extra={{ classification, ratings: 'true' }}
      empty="No films published yet"
      after={
        <ReviewStrip
          type={independent ? 'cinema' : 'original'}
          heading={independent ? 'Cinema reviews' : 'Originals reviews'}
        />
      }
    >
      {(row) => (
        <CatalogueCard
          key={row.id}
          title={row.title}
          path={filmPath(row)}
          landscape
          image={row.banner ?? row.poster}
          metadata={[
            (row.genres ?? [])
              .map((item) => genres[item])
              .filter(Boolean)
              .join(', '),
            row.runtimeMinutes && row.runtimeMinutes + ' min',
            row.releaseYear,
          ]}
          rating={row.rating}
          status={row.availability === 'upcoming' ? 'Upcoming' : undefined}
          save={{ ...row, module: classification }}
        />
      )}
    </Catalogue>
  );
}
function PodcastNotes() {
  const query = useListing('/podcasts');
  const show = query.data?.data;
  if (!show?.description && !show?.hosts?.length && !show?.links?.length)
    return null;
  return (
    <section className="grid min-w-0 max-w-2xl gap-3">
      <h2 className="text-xl font-bold">About the podcast</h2>
      {show.description && (
        <p className="whitespace-pre-wrap text-sm text-muted wrap-anywhere">
          {show.description}
        </p>
      )}
      <div className="flex flex-wrap gap-x-5">
        {show.hosts?.map((person) => (
          <Link
            key={person.id}
            to={'/talent/' + person.slug}
            className="inline-flex min-h-11 items-center text-accent underline"
          >
            {person.displayName}
          </Link>
        ))}
        {show.links?.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-accent underline"
          >
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
}
export function PodcastLanding() {
  return (
    <Catalogue
      fields={podcastFilters}
      title={podcastBrand.name}
      description="Conversations with the people and ideas behind the stories."
      path="/podcasts/episodes"
      empty="No podcast episodes have been published yet."
      after={<PodcastNotes />}
    >
      {(row) => (
        <CatalogueCard
          key={row.id}
          title={row.title}
          path={'/podcasts/' + row.slug}
          landscape
          image={row.thumbnail}
          metadata={[
            row.number != null && 'Episode ' + row.number,
            row.duration > 0 && timestamp(row.duration),
            (row.guests ?? []).join(', '),
          ]}
          status={row.availability === 'upcoming' ? 'Upcoming' : undefined}
          save={{ ...row, module: 'podcasts' }}
        />
      )}
    </Catalogue>
  );
}
export function TalentDirectory() {
  const { values, update, page } = useCatalogueParams(talentFilters);
  const query = useListing('/talent', { ...values, page, limit: 24 });
  return (
    <PublicCatalogue>
      <CatalogueHeading
        title="FDFS Talent"
        description="Meet the people behind mainstream movies, short films and 404 Reality Not Found."
        actions={
          <FilterDrawer fields={talentFilters} values={values} apply={update} />
        }
      >
        <div
          className="flex min-w-0 flex-wrap gap-2"
          aria-label="Talent categories"
        >
          {[['', 'All'], ...choices(talentCategories)].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                'min-h-11 rounded-control px-3 text-sm font-semibold ' +
                ((values.category ?? '') === value
                  ? 'bg-accent text-ink'
                  : 'bg-surface text-foreground hover:text-accent')
              }
              aria-pressed={(values.category ?? '') === value}
              onClick={() => update({ category: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </CatalogueHeading>
      <CatalogueResults
        query={query}
        grid={posters}
        page={page}
        onPage={(page) => update({ page })}
        empty="No Talent Profiles have been published yet."
        filtered={Object.keys(values).length > 0}
      >
        {(row) => (
          <CatalogueCard
            key={row.id}
            title={row.displayName}
            path={'/talent/' + row.slug}
            image={row.profileImage}
            metadata={[
              (row.professions ?? [])
                .map((value) => professions[value])
                .filter(Boolean)
                .join(', '),
            ]}
          />
        )}
      </CatalogueResults>
    </PublicCatalogue>
  );
}
function EventGrid({ heading, keyName, values, params, update, empty }) {
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(params.get(keyName + 'Page'), 10) || 1),
  );
  const query = useListing(
    '/live',
    {
      ...values,
      availability: keyName,
      page,
      limit: 8,
      sort: values.sort ?? (keyName === 'replay' ? 'latest' : 'soonest'),
    },
    60000,
  );
  return (
    <section className="grid min-w-0 gap-4" aria-label={heading}>
      <SectionHeading>{heading}</SectionHeading>
      <CatalogueResults
        query={query}
        page={page}
        onPage={(value) =>
          update({ [keyName + 'Page']: value > 1 ? value : undefined })
        }
        empty={empty}
        filtered={Object.keys(values).length > 0}
        landscape
      >
        {(row) => {
          const to = '/live/' + row.slug;
          const live = keyName === 'live' && row.broadcast === 'live';
          return (
            <div key={row.id} className="grid min-w-0 content-start gap-1">
              <CatalogueCard
                title={row.title}
                path={to}
                landscape
                image={row.replayThumbnail ?? row.banner ?? row.poster}
                status={live ? 'LIVE' : undefined}
                live={live}
                description={row.summary}
                metadata={[
                  eventCategories[row.category],
                  keyName === 'upcoming' &&
                    row.startAt &&
                    formatEventTime(row.startAt, row.timeZone),
                  row.organizer,
                ]}
                action={{
                  to,
                  label: live
                    ? 'Watch Live'
                    : keyName === 'replay'
                      ? 'Watch Replay'
                      : 'View Event',
                }}
                save={{ ...row, module: 'live' }}
              />
              {keyName === 'upcoming' && row.remindersEnabled && (
                <Link
                  to={to + '#live-reminder'}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline"
                >
                  Set Reminder
                </Link>
              )}
            </div>
          );
        }}
      </CatalogueResults>
    </section>
  );
}
export function LiveDirectory() {
  const { values, params, update } = useCatalogueParams(eventFilters);
  const replay = params.get('view') === 'replays';
  const apply = (values) =>
    update(values, ['livePage', 'upcomingPage', 'replayPage']);
  return (
    <PublicCatalogue>
      <CatalogueHeading
        title="FDFS Live"
        description="Watch live broadcasts and see what is coming up."
        actions={
          <FilterDrawer fields={eventFilters} values={values} apply={apply} />
        }
      >
        <div>
          <Link
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline"
            to={replay ? '/live' : '/live?view=replays'}
          >
            {replay ? 'Back to Live' : 'Replays'}
          </Link>
        </div>
      </CatalogueHeading>
      {replay ? (
        <EventGrid
          keyName="replay"
          heading="Replays"
          empty="No replays have been published yet."
          values={values}
          params={params}
          update={update}
        />
      ) : (
        <>
          <EventGrid
            keyName="live"
            heading="Live Now"
            empty="No events are live right now."
            values={values}
            params={params}
            update={update}
          />
          <EventGrid
            keyName="upcoming"
            heading="Upcoming Events"
            empty="No upcoming events are scheduled."
            values={values}
            params={params}
            update={update}
          />
        </>
      )}
    </PublicCatalogue>
  );
}
