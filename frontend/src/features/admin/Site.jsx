import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useBeforeUnload, useBlocker } from 'react-router';
import { contentModules } from '../../../../shared/admin.js';
import { legalSections, modulePaths } from '../../../../shared/site.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { ImagePreview } from '../media/Images.jsx';
import {
  control,
  ConfirmAction,
  get,
  QueryState,
  useChange,
  useRecords,
} from './common.jsx';
import { MediaPicker } from './MediaPicker.jsx';

const settingsUrl = '/admin/site/settings';
const homepageUrl = '/admin/site/homepage';
const moduleNames = {
  independent: 'Cinema',
  original: 'Originals',
  podcasts: '404 Reality Not Found',
  live: 'Live Events',
  talent: 'Talent Profiles',
};
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

function Field({ label, multiline, ...props }) {
  const Input = multiline ? 'textarea' : 'input';
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      {label}
      <Input className={control} {...props} />
    </label>
  );
}

function ArtworkField({ label, image, onChange }) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <h3 className="text-sm font-semibold">{label}</h3>
      {image?.url && <ImagePreview image={image} alt={image.alt || label} />}
      <MediaPicker
        label={'Choose ' + label.toLowerCase()}
        onSelect={onChange}
      />
      {image && (
        <div>
          <Button variant="outline" onClick={() => onChange(undefined)}>
            Remove {label.toLowerCase()}
          </Button>
        </div>
      )}
    </div>
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
    [settingsUrl, 'site-settings', 'site-homepage', '/admin/audit'],
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
            ['maintenance', 'Show maintenance page to public visitors'],
          ].map(([key, label]) => (
            <label className="flex min-h-11 items-center gap-2" key={key}>
              <input name={key} type="checkbox" defaultChecked={value[key]} />
              {label}
            </label>
          ))}
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

function ContentSearch({ onSelect }) {
  const records = useRecords('/admin/site/content', {
    module: 'independent',
    limit: 6,
  });
  return (
    <div className="grid min-w-0 gap-3">
      <label className="grid gap-1 text-sm">
        Content module
        <select
          className={control}
          value={records.params.module}
          onChange={(event) => records.filter('module', event.target.value)}
        >
          {Object.entries(moduleNames).map(([module, label]) => (
            <option value={module} key={module}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <form
        className="grid min-w-0 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          records.filter(
            'q',
            new FormData(event.currentTarget).get('q').trim(),
          );
        }}
      >
        <Field
          name="q"
          label="Search published content"
          type="search"
          maxLength={80}
        />
        <div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </div>
      </form>
      <QueryState query={records.query} empty="No matching published content">
        {(items) => (
          <ul className="grid gap-2">
            {items.map((item) => (
              <li className="min-w-0 wrap-anywhere" key={item.id}>
                <Button variant="outline" onClick={() => onSelect(item)}>
                  {item.title}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      {records.query.data && (
        <Pagination
          page={records.params.page}
          totalPages={records.query.data.pagination.totalPages}
          onPageChange={records.changePage}
        />
      )}
    </div>
  );
}

function ContentPicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Choose published content
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Choose published content"
      >
        {open && (
          <ContentSearch
            onSelect={(item) => {
              onSelect(item);
              setOpen(false);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function wallTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function PromotionDates({ value, update }) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      {[
        ['startAt', 'Promotion starts'],
        ['endAt', 'Promotion ends'],
      ].map(([key, label]) => (
        <Field
          key={key}
          label={label}
          type="datetime-local"
          value={wallTime(value[key])}
          onChange={(event) =>
            update({
              [key]: event.target.value
                ? new Date(event.target.value).toISOString()
                : undefined,
            })
          }
        />
      ))}
    </div>
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
              limit: type === 'latest' ? 4 : undefined,
            });
          }}
        >
          <option value="featured">Featured items</option>
          <option value="latest">Latest from a module</option>
        </select>
      </label>
      {row.type === 'latest' ? (
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Content module
            <select
              className={control}
              value={row.module}
              onChange={(event) => edit({ module: event.target.value })}
            >
              {contentModules.map((module) => (
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
      ) : (
        <>
          {row.items.map((item) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 wrap-anywhere"
              key={item.id}
            >
              <span>{titles[item.id] ?? item.id}</span>
              <Button
                variant="outline"
                onClick={() =>
                  edit({ items: row.items.filter(({ id }) => id !== item.id) })
                }
              >
                Remove item
              </Button>
            </div>
          ))}
          {row.items.length < 12 && (
            <ContentPicker
              onSelect={(item) => {
                if (!row.items.some(({ id }) => id === item.id))
                  edit({ items: [...row.items, item] });
              }}
            />
          )}
        </>
      )}
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
  const [localTitles, setTitles] = useState({});
  const query = useQuery({
    queryKey: [homepageUrl, 'preview'],
    queryFn: ({ signal }) => get(homepageUrl + '/preview', signal),
    enabled: Boolean(revision),
  });
  const change = useChange([homepageUrl, 'site-homepage', '/admin/audit']);
  const presentation = query.data?.data;
  const known = [
    presentation?.hero?.featured,
    ...(presentation?.sections.flatMap((row) => row.items) ?? []),
  ].filter(Boolean);
  const titles = {
    ...Object.fromEntries(known.map((item) => [item.id, item.title])),
    ...localTitles,
  };
  const dirty = draft !== value;
  function normalize(item) {
    if (!item) return undefined;
    const { module, id, title } = item;
    if (title) setTitles((current) => ({ ...current, [id]: title }));
    return { module, id };
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
      {draft.sections.length < 12 && (
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
                'The hero updates on the public homepage. Section configuration is saved for Phase 6.1.',
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
      >
        {preview && (
          <QueryState query={query}>
            {(data) => (
              <div className="grid gap-4 wrap-anywhere">
                {data.hero && (
                  <div className="grid gap-2">
                    <h3 className="text-xl font-semibold">{data.hero.title}</h3>
                    <p>{data.hero.description}</p>
                    {data.hero.image && (
                      <ImagePreview
                        image={data.hero.image}
                        alt={data.hero.image.alt || 'Hero artwork'}
                      />
                    )}
                    {data.hero.featured && (
                      <Link
                        className="text-accent underline"
                        to={data.hero.featured.path}
                      >
                        {data.hero.featured.title}
                      </Link>
                    )}
                  </div>
                )}
                {data.sections.map((row) => (
                  <Card key={row.id} className="grid gap-2">
                    <h3 className="font-semibold">{row.heading}</h3>
                    <p className="text-sm text-muted">
                      {row.visible ? 'Visible' : 'Hidden'}
                    </p>
                    <p>{row.description}</p>
                    {row.type === 'latest' ? (
                      <p>
                        Latest {row.limit} from {moduleNames[row.module]}
                      </p>
                    ) : (
                      <ul>
                        {row.items.map((item) => (
                          <li key={item.id}>{item.title}</li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
                {!data.hero && !data.sections.length && (
                  <p>No hero or sections configured.</p>
                )}
              </div>
            )}
          </QueryState>
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
        The published hero appears on the current homepage. Section order and
        selection will be used by the Phase 6.1 homepage.
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
