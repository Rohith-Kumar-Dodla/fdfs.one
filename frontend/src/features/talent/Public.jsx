import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { professions } from '../../../../shared/talent.js';
import { apiClient } from '../../api/client.js';
import { buttonClasses } from '../../components/ui/Button.jsx';
import { FormField, Select, TextInput } from '../../components/ui/fields.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import {
  Badge,
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../components/ui/states.jsx';

export const talentListKey = ['talent'];
export const professionOptions = Object.entries(professions);

export function TalentImage({ image, cover = false }) {
  const [broken, setBroken] = useState(null);
  const dimensions = cover
    ? 'aspect-[3/1] min-h-28 w-full'
    : 'aspect-square w-24 sm:w-32';
  if (!image?.url || image.url === broken)
    return cover ? null : (
      <div
        className={
          dimensions +
          ' grid shrink-0 place-items-center rounded-panel border border-line bg-nav text-muted'
        }
      >
        <UserRound aria-hidden="true" className="size-9" />
      </div>
    );
  return (
    <img
      src={image.url}
      alt=""
      width={image.width}
      height={image.height}
      onError={() => setBroken(image.url)}
      srcSet={image.variants
        ?.map(({ url, width }) => url + ' ' + width + 'w')
        .join(', ')}
      sizes={
        cover
          ? '(min-width: 768px) 768px, 100vw'
          : '(min-width: 640px) 128px, 96px'
      }
      className={dimensions + ' shrink-0 rounded-panel bg-nav object-cover'}
    />
  );
}

function Roles({ values }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Professions">
      {values.map((value) => (
        <li key={value}>
          <Badge>{professions[value] ?? value}</Badge>
        </li>
      ))}
    </ul>
  );
}

function ExternalLink({ url, children }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center wrap-anywhere text-accent underline"
    >
      {children}
    </a>
  );
}

export function ProfileContent({ profile }) {
  return (
    <div className="grid min-w-0 gap-5 wrap-anywhere">
      {profile.alternativeName && (
        <p className="text-muted">Also known as {profile.alternativeName}</p>
      )}
      <Roles values={profile.professions} />
      {profile.location && (
        <p className="text-sm text-muted">{profile.location}</p>
      )}
      {profile.biography && (
        <section className="grid gap-2">
          <h2 className="text-xl font-semibold">Biography</h2>
          <p className="whitespace-pre-wrap">{profile.biography}</p>
        </section>
      )}
      {profile.achievements.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-semibold">
            Achievements and recognitions
          </h2>
          <ul className="grid gap-3">
            {profile.achievements.map((entry, index) => (
              <li key={index} className="border-l-2 border-line pl-4">
                <h3 className="font-semibold">{entry.title}</h3>
                {(entry.organization || entry.year) && (
                  <p className="text-sm text-muted">
                    {[entry.organization, entry.year]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {entry.description && (
                  <p className="whitespace-pre-wrap">{entry.description}</p>
                )}
                {entry.source && (
                  <ExternalLink url={entry.source}>
                    Source for {entry.title}
                  </ExternalLink>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(profile.website || profile.links.length > 0) && (
        <section className="grid gap-2">
          <h2 className="text-xl font-semibold">Professional links</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {profile.website && (
              <li>
                <ExternalLink url={profile.website}>
                  Professional website
                </ExternalLink>
              </li>
            )}
            {profile.links.map(({ label, url }, index) => (
              <li key={index}>
                <ExternalLink url={url}>{label}</ExternalLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TalentCard({ profile }) {
  return (
    <Card
      as="article"
      className="grid h-full min-w-0 content-start gap-3 wrap-anywhere"
    >
      <TalentImage image={profile.profileImage} />
      <h2 className="text-lg font-semibold">
        <Link
          className="inline-flex min-h-11 items-center text-accent underline"
          to={'/talent/' + profile.slug}
        >
          {profile.displayName}
        </Link>
      </h2>
      <Roles values={profile.professions} />
      <p className="text-sm text-muted">{profile.introduction}</p>
    </Card>
  );
}

function TalentSearch({ value, change }) {
  const [input, setInput] = useState({ base: value, text: value });
  const text = input.base === value ? input.text : value;
  useEffect(() => {
    const next = text.trim();
    if (next === value) return;
    const timer = setTimeout(() => change('q', next, { replace: true }), 350);
    return () => clearTimeout(timer);
  }, [text, value, change]);
  return (
    <FormField id="talent-search" label="Search by name">
      {(props) => (
        <TextInput
          {...props}
          type="search"
          maxLength={80}
          value={text}
          onChange={(event) =>
            setInput({ base: value, text: event.target.value })
          }
        />
      )}
    </FormField>
  );
}

export function TalentDirectory() {
  const [search, setSearch] = useSearchParams();
  const q = (search.get('q') ?? '').trim().slice(0, 80);
  const choice = search.get('profession');
  const profession = Object.hasOwn(professions, choice) ? choice : '';
  const sort = ['name', '-name', 'newest'].includes(search.get('sort'))
    ? search.get('sort')
    : 'name';
  const requestedPage = Number(search.get('page'));
  const page =
    Number.isInteger(requestedPage) &&
    requestedPage > 0 &&
    requestedPage <= 10000
      ? requestedPage
      : 1;
  function change(key, value, options) {
    const next = new URLSearchParams(search);
    if (
      value &&
      !(key === 'page' && value === '1') &&
      !(key === 'sort' && value === 'name')
    )
      next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearch(next, options);
  }
  const directory = useQuery({
    queryKey: [...talentListKey, { q, profession, sort, page }],
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient.get('/talent', {
        params: {
          q: q || undefined,
          profession: profession || undefined,
          sort,
          page,
          limit: 12,
        },
        signal,
      }),
  });
  return (
    <Container className="grid min-w-0 gap-6 py-8 sm:py-12">
      <SectionHeading
        as="h1"
        description="Discover the filmmakers, cast, crew and voices behind the stories."
      >
        Talent
      </SectionHeading>
      <Link
        className={buttonClasses('outline', 'justify-self-start')}
        to="/submissions/new?category=talent"
      >
        Suggest a talent profile
      </Link>
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <TalentSearch value={q} change={change} />
        <FormField id="talent-profession" label="Profession">
          {(props) => (
            <Select
              {...props}
              value={profession}
              onChange={(event) => change('profession', event.target.value)}
            >
              <option value="">All professions</option>
              {professionOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField id="talent-sort" label="Sort by">
          {(props) => (
            <Select
              {...props}
              value={sort}
              onChange={(event) => change('sort', event.target.value)}
            >
              <option value="name">Name A–Z</option>
              <option value="-name">Name Z–A</option>
              <option value="newest">Recently published</option>
            </Select>
          )}
        </FormField>
      </div>
      {directory.isPending && (
        <div role="status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <span className="sr-only">Loading talent profiles</span>
          {[0, 1, 2].map((item) => (
            <Skeleton className="min-h-48" key={item} />
          ))}
        </div>
      )}
      {directory.isError && (
        <ErrorState
          title="Could not load talent profiles"
          description={directory.error.message}
          onRetry={() => void directory.refetch()}
        />
      )}
      {directory.data && (
        <>
          {directory.data.data.length ? (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {directory.data.data.map((profile) => (
                <TalentCard key={profile.id} profile={profile} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                q || profession || page > 1
                  ? 'No profiles match this search'
                  : 'No talent profiles published yet'
              }
              description={
                q || profession
                  ? 'Try a different name or profession.'
                  : undefined
              }
            />
          )}
          <Pagination
            page={page}
            totalPages={directory.data.pagination.totalPages}
            onPageChange={(next) => change('page', String(next))}
          />
          {page > 1 && directory.data.data.length === 0 && (
            <Link
              className={buttonClasses('outline', 'justify-self-start')}
              to="/talent"
            >
              Back to the directory
            </Link>
          )}
        </>
      )}
    </Container>
  );
}

export function usePublicTalent(slug) {
  return useQuery({
    queryKey: [...talentListKey, 'profile', slug],
    meta: { public: true },
    enabled: Boolean(slug),
    queryFn: ({ signal }) =>
      apiClient
        .get('/talent/' + encodeURIComponent(slug), { signal })
        .then((result) => result.data),
  });
}

function useTalentMetadata(profile) {
  useEffect(() => {
    if (!profile) return;
    const oldTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const oldDescription = meta?.getAttribute('content');
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = new URL(
      '/talent/' + profile.slug,
      window.location.origin,
    ).href;
    document.head.append(canonical);
    document.title = profile.displayName + ' | FDFS Talent Profiles';
    meta?.setAttribute('content', profile.introduction);
    return () => {
      document.title = oldTitle;
      if (oldDescription !== null && oldDescription !== undefined)
        meta.setAttribute('content', oldDescription);
      canonical.remove();
    };
  }, [profile]);
}

export function TalentProfile() {
  const { slug } = useParams();
  const query = usePublicTalent(slug);
  const profile = query.data;
  useTalentMetadata(profile);
  return (
    <Container className="grid max-w-4xl! grid-cols-1 gap-6 py-8 sm:py-12">
      <Link
        className="inline-flex min-h-11 items-center justify-self-start text-accent underline"
        to="/talent"
      >
        Back to the directory
      </Link>
      {query.isPending && (
        <div role="status">
          <span className="sr-only">Loading talent profile</span>
          <Skeleton className="min-h-56" />
        </div>
      )}
      {query.isError &&
        (query.error.status === 404 || query.error.status === 400 ? (
          <SectionHeading as="h1">Talent profile unavailable</SectionHeading>
        ) : (
          <ErrorState
            title="Could not load the profile"
            description={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ))}
      {profile && (
        <>
          <TalentImage image={profile.coverImage} cover />
          <header className="flex min-w-0 flex-col items-start gap-4 wrap-anywhere sm:flex-row sm:items-center">
            <TalentImage image={profile.profileImage} />
            <SectionHeading as="h1" description={profile.introduction}>
              {profile.displayName}
            </SectionHeading>
          </header>
          <ProfileContent profile={profile} />
          <section className="grid gap-2">
            <h2 className="text-xl font-semibold">Filmography</h2>
            <p className="text-muted">No published film credits are listed.</p>
          </section>
          <section className="grid gap-2">
            <h2 className="text-xl font-semibold">Podcast appearances</h2>
            <p className="text-muted">
              No published podcast appearances are listed.
            </p>
          </section>
          <Link
            className={buttonClasses('outline', 'justify-self-start')}
            to={
              '/submissions/new?' +
              new URLSearchParams({
                category: 'talent',
                target: profile.id,
                slug: profile.slug,
              })
            }
          >
            Suggest a correction
          </Link>
        </>
      )}
    </Container>
  );
}
