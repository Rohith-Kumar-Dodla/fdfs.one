import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBeforeUnload, useBlocker } from 'react-router';
import { supportCategories } from '../../../../shared/operations.js';
import {
  discoveryModules,
  layouts,
  sectionKinds,
  sources,
} from '../../../../shared/homepage.js';
import { HomepageDisplay } from '../../pages/Home.jsx';
import { useSiteSettings } from '../site/public.jsx';
import {
  Choice,
  HomepageControls,
  OrderButtons,
  reordered,
} from './HomepageControls.jsx';
import {
  legalSections,
  modulePaths,
  siteDefaults,
} from '../../../../shared/site.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import {
  control,
  ConfirmAction,
  get,
  QueryState,
  useChange,
} from './common.jsx';
import {
  ArtworkField,
  ContentPicker,
  Field,
  PromotionDates,
} from './SiteFields.jsx';

const settingsUrl = '/admin/site/settings';
const homepageUrl = '/admin/site/homepage';
const moduleNames = Object.fromEntries(
  Object.entries(sources).map(([key, source]) => [key, source.label]),
);
const art = {
  logo: 'Logo',
  favicon: 'Favicon',
  brand: 'Brand artwork',
  socialImage: 'Social sharing artwork',
};

function useConfig(url) {
  return useQuery({
    queryKey: [url],
    queryFn: ({ signal }) => get(url, signal),
  });
}

function LeaveWarning({ dirty }) {
  const blocker = useBlocker(dirty);
  useBeforeUnload((event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
  return (
    <Dialog
      open={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      title="Discard unsaved changes?"
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => blocker.reset?.()}>
          Keep editing
        </Button>
        <Button onClick={() => blocker.proceed?.()}>Discard changes</Button>
      </div>
    </Dialog>
  );
}

function LinksEditor({ title, items, onChange }) {
  function update(index, field, value) {
    onChange(
      items.map((item, row) =>
        index === row ? { ...item, [field]: value } : item,
      ),
    );
  }
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="font-semibold">{title}</legend>
      {items.map(({ label, url }, index) => (
        <div
          key={index}
          className="grid min-w-0 items-end gap-2 sm:grid-cols-[1fr_2fr_auto]"
        >
          <Field
            label="Link label"
            value={label}
            maxLength={50}
            required
            onChange={(event) => update(index, 'label', event.target.value)}
          />
          <Field
            label="HTTPS address"
            type="url"
            value={url}
            maxLength={2048}
            required
            onChange={(event) => update(index, 'url', event.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => onChange(items.filter((_, row) => row !== index))}
          >
            Remove link
          </Button>
        </div>
      ))}
      {items.length < 10 && (
        <div>
          <Button
            variant="outline"
            onClick={() => onChange([...items, { label: '', url: '' }])}
          >
            Add link
          </Button>
        </div>
      )}
    </fieldset>
  );
}

function Feedback({ change }) {
  return change.isError ? (
    <p role="alert" className="text-sm text-danger-text">
      {change.error.message}
    </p>
  ) : null;
}

function SettingsEditor({ record }) {
  const { revision, value } = record;
  const [links, setLinks] = useState(value.links);
  const [socials, setSocials] = useState(value.socials);
  const [images, setImages] = useState(() =>
    Object.fromEntries(
      Object.keys(art).map((key) => [
        key,
        value[key + 'Id'] && { id: value[key + 'Id'] },
      ]),
    ),
  );
  const [dirty, setDirty] = useState(false);
  const change = useChange(
    [
      settingsUrl,
      'site-settings',
      'site-homepage',
      'support-config',
      '/admin/audit',
    ],
    () => setDirty(false),
  );
  const save = (event) => {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const names = [
      'name',
      'description',
      'contact',
      'supportEmail',
      'footer',
      'seoTitle',
      'seoDescription',
    ];
    const read = (key) => input.get(key)?.trim() || undefined;
    change.mutate({
      url: settingsUrl,
      method: 'put',
      data: {
        revision,
        settings: {
          ...Object.fromEntries(names.map((name) => [name, read(name)])),
          ...Object.fromEntries(
            Object.keys(art).map((key) => [key + 'Id', images[key]?.id]),
          ),
          links,
          socials,
          hiddenModules: input.getAll('hiddenModules'),
          legal: Object.fromEntries(
            Object.keys(legalSections).map((key) => [key, read(key)]),
          ),
          maintenance: input.has('maintenance'),
          registrationOpen: input.has('registrationOpen'),
          communityOpen: input.has('communityOpen'),
          supportOpen: input.has('supportOpen'),
          analyticsOpen: input.has('analyticsOpen'),
          supportCategories: input.getAll('supportCategories'),
        },
      },
    });
  };
  return (
    <>
      <LeaveWarning dirty={dirty} />
      <Card className="grid min-w-0 gap-3">
        <h2 className="text-lg font-semibold">Branding</h2>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {Object.entries(art).map(([key, label]) => (
            <ArtworkField
              key={key}
              label={label}
              image={images[key]}
              onChange={(image) => {
                setImages((current) => ({ ...current, [key]: image }));
                setDirty(true);
              }}
            />
          ))}
        </div>
      </Card>
      <form
        className="grid min-w-0 gap-4"
        onChange={() => setDirty(true)}
        onSubmit={save}
      >
        <Card className="grid gap-3 sm:grid-cols-2">
          <h2 className="text-lg font-semibold sm:col-span-2">
            General and search
          </h2>
          <Field
            name="name"
            label="Website display name"
            required
            maxLength={60}
            defaultValue={value.name}
          />
          <Field
            name="description"
            label="Short description"
            required
            maxLength={280}
            defaultValue={value.description}
          />
          <Field
            name="contact"
            label="Public contact information"
            maxLength={280}
            defaultValue={value.contact}
          />
          <Field
            name="supportEmail"
            label="Support email"
            type="email"
            maxLength={254}
            defaultValue={value.supportEmail}
          />
          <Field
            name="seoTitle"
            label="Default page title"
            maxLength={90}
            defaultValue={value.seoTitle}
          />
          <Field
            name="seoDescription"
            label="Default page description"
            maxLength={300}
            defaultValue={value.seoDescription}
          />
        </Card>
        <Card className="grid gap-3">
          <h2 className="text-lg font-semibold">Navigation and footer</h2>
          <fieldset className="grid sm:grid-cols-2">
            <legend className="text-sm text-muted">
              Hide modules from navigation and the homepage directory
            </legend>
            {modulePaths.map((path) => (
              <label key={path} className="flex min-h-11 items-center gap-2">
                <input
                  name="hiddenModules"
                  type="checkbox"
                  value={path}
                  defaultChecked={value.hiddenModules.includes(path)}
                />
                {moduleNames[path.slice(1)] ??
                  path[1].toUpperCase() + path.slice(2)}
              </label>
            ))}
          </fieldset>
          <Field
            name="footer"
            label="Footer information"
            multiline
            maxLength={400}
            defaultValue={value.footer}
          />
          <LinksEditor
            title="Footer links"
            items={links}
            onChange={(items) => {
              setLinks(items);
              setDirty(true);
            }}
          />
          <LinksEditor
            title="Official social links"
            items={socials}
            onChange={(items) => {
              setSocials(items);
              setDirty(true);
            }}
          />
        </Card>
        <Card className="grid gap-3">
          <h2 className="text-lg font-semibold">Legal content</h2>
          <p className="text-sm text-muted">
            Enter approved text. Blank entries stay unconfigured.
          </p>
          {Object.entries(legalSections).map(([key, label]) => (
            <Field
              key={key}
              name={key}
              label={label}
              multiline
              rows={4}
              maxLength={12000}
              defaultValue={value.legal[key]}
            />
          ))}
        </Card>
        <Card className="grid gap-3">
          <h2 className="text-lg font-semibold">Availability</h2>
          {[
            ['registrationOpen', 'Allow new registrations'],
            ['communityOpen', 'Allow new comments and live chat'],
            ['supportOpen', 'Allow new support tickets'],
            ['analyticsOpen', 'Collect consented historical analytics'],
            ['maintenance', 'Show maintenance page to public visitors'],
          ].map(([key, label]) => (
            <label className="flex min-h-11 items-center gap-2" key={key}>
              <input
                name={key}
                type="checkbox"
                defaultChecked={value[key] ?? siteDefaults[key]}
              />
              {label}
            </label>
          ))}
          <fieldset className="grid gap-1 sm:grid-cols-2">
            <legend className="font-medium">
              Support categories for new tickets
            </legend>
            {Object.entries(supportCategories).map(([key, label]) => (
              <label className="flex min-h-11 items-center gap-2" key={key}>
                <input
                  type="checkbox"
                  name="supportCategories"
                  value={key}
                  defaultChecked={(
                    value.supportCategories ?? Object.keys(supportCategories)
                  ).includes(key)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-muted">
            Administrator sign-in and access stay available during maintenance.
          </p>
        </Card>
        <div>
          <Button type="submit" loading={change.isPending}>
            Save website settings
          </Button>
        </div>
        <Feedback change={change} />
      </form>
    </>
  );
}

export function SettingsAdmin() {
  const query = useConfig(settingsUrl);
  return (
    <>
      <SectionHeading as="h1">Website Settings</SectionHeading>
      {query.data?.data.revision > 0 && (
        <p className="text-sm text-muted">
          Current revision {query.data.data.revision}
        </p>
      )}
      <QueryState query={query}>
        {(record) => <SettingsEditor key={record.revision} record={record} />}
      </QueryState>
    </>
  );
}

function HeroEditor({ hero, edit, remove, titles }) {
  const [image, setImage] = useState();
  return (
    <Card className="grid min-w-0 gap-3">
      <h2 className="text-lg font-semibold">Homepage hero</h2>
      {!hero ? (
        <div>
          <Button variant="outline" onClick={() => edit({ title: '' })}>
            Add hero
          </Button>
        </div>
      ) : (
        <>
          <Field
            label="Hero heading"
            maxLength={100}
            value={hero.title}
            onChange={(event) => edit({ title: event.target.value })}
          />
          <Field
            label="Hero description"
            multiline
            maxLength={280}
            value={hero.description ?? ''}
            onChange={(event) =>
              edit({ description: event.target.value || undefined })
            }
          />
          <ArtworkField
            label="Hero artwork"
            image={hero.imageId ? (image ?? { id: hero.imageId }) : undefined}
            onChange={(asset) => {
              setImage(asset);
              edit({ imageId: asset?.id });
            }}
          />
          <PromotionDates value={hero} update={edit} />
          {hero.featured ? (
            <div className="grid gap-2">
              <p className="wrap-anywhere">
                Featured · {titles[hero.featured.id] ?? hero.featured.id}
              </p>
              <div>
                <Button
                  variant="outline"
                  onClick={() => edit({ featured: undefined })}
                >
                  Remove featured item
                </Button>
              </div>
            </div>
          ) : (
            <ContentPicker onSelect={(item) => edit({ featured: item })} />
          )}
          <div>
            <Button variant="outline" onClick={remove}>
              Remove hero
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

const sectionLabels = {
  explore: 'Explore the modules',
  featured: 'Featured items',
  latest: 'Latest from a module',
  live: 'Live now',
  upcoming: 'Upcoming events and releases',
  releases: 'New releases',
  genres: 'Browse by genre',
  popular: 'Popular movies',
  trending: 'Trending reviews',
  promotion: 'Campaign placement',
};
function SectionEditor({ row, move, edit, index, total, titles, remove }) {
  return (
    <Card className="grid min-w-0 gap-3">
      <h3 className="font-semibold">Section {index + 1}</h3>
      <Field
        label="Section heading"
        maxLength={100}
        value={row.heading}
        onChange={(event) => edit({ heading: event.target.value })}
      />
      <Field
        label="Section description"
        maxLength={280}
        value={row.description ?? ''}
        onChange={(event) =>
          edit({ description: event.target.value || undefined })
        }
      />
      <label className="grid gap-1 text-sm">
        Section type
        <select
          className={control}
          value={row.type}
          onChange={(event) => {
            const type = event.target.value;
            edit({
              type,
              items: [],
              module: type === 'latest' ? 'independent' : undefined,
              limit: 8,
            });
          }}
        >
          {sectionKinds.map((type) => (
            <option key={type} value={type}>
              {sectionLabels[type]}
            </option>
          ))}
        </select>
      </label>
      {!['explore', 'promotion'].includes(row.type) && (
        <Choice
          label="Section layout"
          value={row.layout ?? 'auto'}
          options={layouts.map((layout) => [layout, layout])}
          onChange={(layout) => edit({ layout })}
        />
      )}
      {!['explore', 'promotion', 'latest', 'featured'].includes(row.type) && (
        <Field
          label="Item limit"
          type="number"
          min="1"
          max="12"
          value={row.limit ?? 8}
          onChange={(event) => edit({ limit: Number(event.target.value) })}
        />
      )}
      {row.type === 'latest' ? (
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Content module
            <select
              className={control}
              value={row.module}
              onChange={(event) => edit({ module: event.target.value })}
            >
              {discoveryModules.map((module) => (
                <option key={module} value={module}>
                  {moduleNames[module]}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Item limit"
            type="number"
            min="1"
            max="12"
            value={row.limit}
            onChange={(event) => edit({ limit: Number(event.target.value) })}
          />
        </div>
      ) : row.type === 'featured' ? (
        <>
          {row.items.map((item, index) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 wrap-anywhere"
              key={item.id}
            >
              <span>{titles[item.id] ?? item.id}</span>
              <OrderButtons
                index={index}
                total={row.items.length}
                move={(target) =>
                  edit({ items: reordered(row.items, index, target) })
                }
                remove={() =>
                  edit({
                    items: row.items.filter((other) => other.id !== item.id),
                  })
                }
              />
            </div>
          ))}
          {row.items.length < 12 && (
            <ContentPicker
              allowUpcoming
              onSelect={(item) => {
                if (!row.items.some(({ id }) => id === item.id))
                  edit({ items: [...row.items, item] });
              }}
            />
          )}
        </>
      ) : null}
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={row.visible}
          onChange={(event) => edit({ visible: event.target.checked })}
        />
        Visible section
      </label>
      <PromotionDates value={row} update={edit} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={index === 0}
          onClick={() => move(index, index - 1)}
        >
          Move up
        </Button>
        <Button
          variant="outline"
          disabled={index === total - 1}
          onClick={() => move(index, index + 1)}
        >
          Move down
        </Button>
        <Button variant="outline" onClick={remove}>
          Remove section
        </Button>
      </div>
    </Card>
  );
}

function HomepageEditor({ record }) {
  const { value, revision } = record;
  const [draft, setDraft] = useState(value);
  const [action, setAction] = useState(null);
  const [preview, setPreview] = useState(false);
  const [mobile, setMobile] = useState(false);
  const settings = useSiteSettings();
  const [localTitles, setTitles] = useState({});
  const query = useQuery({
    queryKey: [homepageUrl, 'assembly'],
    queryFn: ({ signal }) => get(homepageUrl + '/assembly', signal),
    enabled: Boolean(revision),
  });
  const change = useChange([
    homepageUrl,
    'site-homepage',
    'homepage-discovery',
    '/admin/audit',
  ]);
  const presentation = query.data?.data;
  const known = [
    ...(presentation?.slides ?? []),
    ...(presentation?.sections.flatMap((row) => row.items ?? []) ?? []),
  ].filter(Boolean);
  const titles = {
    ...Object.fromEntries(known.map((item) => [item.id, item.title])),
    ...localTitles,
  };
  const placements = [
    ...(presentation?.slides ?? [])
      .filter((item) => item.placement)
      .map((item) => ({ item, label: 'Hero carousel' })),
    ...(presentation?.sections ?? []).flatMap((section) => [
      ...(section.sponsored ?? []).map((item) => ({
        item,
        label: section.heading + ' rail',
      })),
      ...(section.between ?? []).map((item) => ({
        item,
        label: 'After ' + section.heading,
      })),
    ]),
    ...(presentation?.footer ?? []).map((item) => ({
      item,
      label: 'Before the footer',
    })),
  ];
  const dirty = draft !== value;
  function normalize(item) {
    if (!item) return undefined;
    const { module, id, title, upcoming } = item;
    if (title) setTitles((current) => ({ ...current, [id]: title }));
    return { module, id, upcoming };
  }
  const updateSection = (id, update) =>
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((row) =>
        row.id === id ? { ...row, ...update } : row,
      ),
    }));
  function move(index, target) {
    const sections = [...draft.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    setDraft({ ...draft, sections });
  }
  return (
    <>
      <LeaveWarning dirty={dirty} />
      {placements.length > 0 && (
        <Card className="grid gap-2">
          <h2 className="font-semibold">
            Active campaign placements in the saved preview
          </h2>
          <ul>
            {placements.map(({ item, label }) => (
              <li key={item.id + item.placement}>
                {label} ? {item.title}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <HomepageControls
        draft={draft}
        update={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        normalize={normalize}
        titles={titles}
      />
      <HeroEditor
        hero={draft.hero}
        titles={titles}
        edit={(update) => {
          const next = {
            ...update,
            ...(Object.hasOwn(update, 'featured') && {
              featured: normalize(update.featured),
            }),
          };
          setDraft((current) => ({
            ...current,
            hero: { ...current.hero, ...next },
          }));
        }}
        remove={() => setDraft({ ...draft, hero: undefined })}
      />
      <h2 className="text-lg font-semibold">Section order</h2>
      {draft.sections.map((row, index) => (
        <SectionEditor
          key={row.id}
          row={row}
          move={move}
          index={index}
          total={draft.sections.length}
          titles={titles}
          edit={(update) =>
            updateSection(row.id, {
              ...update,
              ...(update.items && { items: update.items.map(normalize) }),
            })
          }
          remove={() =>
            setDraft({
              ...draft,
              sections: draft.sections.filter(({ id }) => id !== row.id),
            })
          }
        />
      ))}
      {draft.sections.length < 16 && (
        <div>
          <Button
            variant="outline"
            onClick={() =>
              setDraft({
                ...draft,
                sections: [
                  ...draft.sections,
                  {
                    id: crypto.randomUUID(),
                    type: 'featured',
                    heading: '',
                    visible: true,
                    items: [],
                  },
                ],
              })
            }
          >
            Add section
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          loading={change.isPending}
          onClick={() =>
            change.mutate({
              url: homepageUrl,
              method: 'put',
              data: { homepage: draft, revision },
            })
          }
        >
          Save homepage draft
        </Button>
        <Button
          variant="outline"
          disabled={!revision || dirty}
          onClick={() => setPreview(true)}
        >
          Preview saved draft
        </Button>
        <Button
          variant="outline"
          disabled={!revision || dirty}
          onClick={() => {
            change.reset();
            setAction({
              title: 'Publish homepage configuration?',
              description:
                'The hero, section order, and content selections will update on the public homepage.',
              request: {
                url: homepageUrl + '/publish',
                method: 'post',
                data: { revision },
              },
            });
          }}
        >
          Publish homepage configuration
        </Button>
      </div>
      <Feedback change={change} />
      <ConfirmAction
        action={action}
        change={change}
        onClose={() => setAction(null)}
      />
      <Dialog
        open={preview}
        onClose={() => setPreview(false)}
        title="Homepage draft preview"
        className="max-w-6xl"
      >
        {preview && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button
                variant={mobile ? 'outline' : 'primary'}
                onClick={() => setMobile(false)}
                aria-pressed={!mobile}
              >
                Desktop preview
              </Button>
              <Button
                variant={mobile ? 'primary' : 'outline'}
                onClick={() => setMobile(true)}
                aria-pressed={mobile}
              >
                Mobile preview
              </Button>
            </div>
            <QueryState query={query}>
              {(data) => (
                <div className={mobile ? 'mx-auto max-w-[375px]' : ''}>
                  <HomepageDisplay
                    value={data}
                    settings={settings}
                    preview
                    previewSize={mobile ? 'mobile' : 'desktop'}
                  />
                </div>
              )}
            </QueryState>
          </>
        )}
      </Dialog>
    </>
  );
}

export function HomepageAdmin() {
  const query = useConfig(homepageUrl);
  return (
    <>
      <SectionHeading as="h1">Homepage Management</SectionHeading>
      <p className="text-sm text-muted">
        Manage the public carousel, select featured titles, and arrange homepage
        sections.
      </p>
      <QueryState query={query}>
        {(record) => (
          <>
            <p className="text-sm text-muted">
              {record.published
                ? 'Published configuration available'
                : 'No published configuration'}
            </p>
            <HomepageEditor key={record.revision} record={record} />
          </>
        )}
      </QueryState>
    </>
  );
}
