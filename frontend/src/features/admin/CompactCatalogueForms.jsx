import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useOutletContext } from 'react-router';
import { can } from '../../../../shared/admin.js';
import { professions } from '../../../../shared/talent.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import { get, control, useChange } from './common.jsx';
import {
  ArtworkField,
  CompactError,
  CompactField,
  RightsDialog,
  useContentNotice,
} from './CompactFields.jsx';
import { useDebouncedValue } from '../media/AutomaticVideo.jsx';

const mediaKeys = [
  '/admin/media-collections',
  '/admin/media',
  'homepage-discovery',
];
const sources = {
  movies: [['movies', '/admin/movies', 'Movies']],
  'short-films': [
    ['independent', '/admin/films', 'Cinema'],
    ['original', '/admin/films', 'Originals'],
  ],
  'podcast-guests': [['podcasts', '/admin/podcasts/episodes', 'Episodes']],
};
const titles = {
  movies: 'Associated movies',
  'short-films': 'Associated short films',
  'podcast-guests': 'Associated podcast episodes',
};

function AssociatedContent({ category, rows, update }) {
  const account = useOutletContext();
  const allowed = sources[category].filter(([module]) =>
    can(account, 'content', module),
  );
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const term = useDebouncedValue(search.trim());
  const source = allowed[0];
  const path = source?.[1];
  const query = useQuery({
    queryKey: ['compact-associated', path, term],
    enabled: Boolean(path && term.length >= 2 && term === search.trim()),
    queryFn: ({ signal }) =>
      get(path, signal, {
        q: term,
        limit: 8,
      }),
  });
  async function select(item) {
    setLoading(true);
    setError('');
    try {
      const { data } = await get(path + '/' + item.id);
      update((current) =>
        current.some((row) => row.target === item.id)
          ? current
          : [
              ...current,
              {
                module: item.classification ?? source[0],
                target: item.id,
                revision: data.revision,
                title: item.title,
              },
            ],
      );
      setSearch('');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }
  if (!source) return null;
  return (
    <fieldset className="grid gap-2">
      <legend className="font-semibold">{titles[category]}</legend>
      <CompactField
        label="Find existing content"
        type="search"
        value={search}
        maxLength={80}
        onChange={(event) => setSearch(event.target.value)}
      />
      <CompactError error={error || (term && query.error?.message)} />
      {term === search.trim() && query.data?.data?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {query.data.data
            .filter(
              (item) =>
                item.status !== 'archived' &&
                !rows.some((row) => row.target === item.id),
            )
            .map((item) => (
              <Button
                variant="outline"
                key={item.id}
                disabled={loading || rows.length >= 30}
                onClick={() => void select(item)}
              >
                {item.title}
              </Button>
            ))}
        </div>
      )}
      {rows.map((row) => (
        <div className="flex flex-wrap items-center gap-2" key={row.target}>
          <span>{row.title}</span>
          <Button
            variant="ghost"
            onClick={() =>
              update((current) =>
                current.filter((item) => item.target !== row.target),
              )
            }
          >
            Remove
          </Button>
        </div>
      ))}
    </fieldset>
  );
}

export function CompactTalentForm({ category }) {
  const navigate = useNavigate();
  const [portrait, setPortrait] = useState([]);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(null);
  const change = useChange(
    ['/admin/talent', 'talent', ...mediaKeys],
    useContentNotice(
      navigate,
      '/admin/talent?category=' + category,
      'Profile published.',
    ),
  );
  return (
    <Card className="p-4!">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (change.isPending) return;
          const data = new FormData(event.currentTarget);
          setDraft({
            displayName: data.get('name').trim(),
            introduction: data.get('description').trim(),
            biography: data.get('biography').trim() || undefined,
            professions: [data.get('profession')],
            profileImageId: portrait[0]?.id,
            categories: [category],
            publish: true,
            associations: rows.map(({ module, target, revision }) => ({
              module,
              target,
              revision,
            })),
          });
        }}
      >
        <ArtworkField
          label="Profile image"
          images={portrait}
          setImages={setPortrait}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <CompactField label="Name" name="name" required maxLength={100} />
          <label className="grid gap-1 text-sm">
            Profession
            <select
              name="profession"
              className={control}
              required
              defaultValue=""
            >
              <option value="">Select profession</option>
              {Object.entries(professions).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CompactField
          label="Description"
          name="description"
          area
          required
          maxLength={240}
        />
        <CompactField
          label="Biography"
          name="biography"
          area
          maxLength={5000}
        />
        <AssociatedContent category={category} rows={rows} update={setRows} />
        <CompactError change={change} />
        <Button className="w-fit" type="submit" loading={change.isPending}>
          Submit Profile
        </Button>
      </form>
      <RightsDialog
        action={draft && 'Confirm profile publication'}
        draft
        close={() => setDraft(null)}
        proceed={() => {
          setDraft(null);
          change.mutate({ url: '/admin/talent', method: 'post', data: draft });
        }}
      />
    </Card>
  );
}

export function CompactMovieForm() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [images, setImages] = useState([]);
  const [draft, setDraft] = useState(null);
  const change = useChange(
    ['/admin/movies', 'reviews', ...mediaKeys],
    useContentNotice(navigate, '/admin/movies', 'Movie published.'),
  );
  function save(payload) {
    change.mutate({ url: '/admin/movies', method: 'post', data: payload });
  }
  return (
    <Card className="p-4!">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (change.isPending) return;
          const payload = {
            title: title.trim(),
            posterId: images[0]?.id,
            backdropId: images[1]?.id,
            galleryIds: images.slice(2).map(({ id }) => id),
            artworkAuthorized: images.length > 0,
            publish: true,
          };
          if (images.length) setDraft(payload);
          else save(payload);
        }}
      >
        <CompactField
          label="Movie name"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={140}
          required
        />
        <ArtworkField
          label="Images"
          title={title}
          category="movies"
          images={images}
          setImages={setImages}
          max={14}
        />
        <CompactError change={change} />
        <Button className="w-fit" type="submit" loading={change.isPending}>
          Submit Movie
        </Button>
      </form>
      <RightsDialog
        action={draft && 'Confirm movie artwork'}
        draft
        close={() => setDraft(null)}
        proceed={() => {
          setDraft(null);
          save(draft);
        }}
      />
    </Card>
  );
}
