import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import {
  permittedRail,
  placementKey,
  placementTypes,
  promotionTypes,
} from '../../../../shared/homepage.js';
import {
  eventLocalTime,
  eventUtcTime,
  formatEventTime,
} from '../../../../shared/live.js';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { ArtworkField, ContentPicker, Field } from '../admin/SiteFields.jsx';
import { Choice, focalOptions } from '../admin/HomepageControls.jsx';
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
import { CampaignBanner } from './Campaign.jsx';

const root = '/admin/promotions';
const states = [
  'draft',
  'scheduled',
  'active',
  'expired',
  'paused',
  'archived',
];
const capital = (value) => value[0].toUpperCase() + value.slice(1);
const statusOptions = states.map((state) => [state, capital(state)]);
const optional = (value) => value?.trim() || undefined;
const timezones = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
];
function useResource(url, params, refetchInterval) {
  return useQuery({
    queryKey: [url, params],
    queryFn: ({ signal }) => get(url, signal, params),
    refetchInterval,
  });
}
const time = (value, row) => value && formatEventTime(value, row.timezone);
export function PromotionsList() {
  const records = useRecords(root, { limit: 10 });
  const counts = records.query.data?.counts;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading as="h1">Promotions</SectionHeading>
        <Link to={root + '/new'} className={buttonClasses()}>
          Create campaign
        </Link>
      </div>
      {counts && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {statusOptions.map(([state, label]) => (
            <Card as="div" key={state}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="text-xl font-bold">{counts[state]}</dd>
            </Card>
          ))}
        </dl>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Field
          label="Search campaign names"
          type="search"
          value={records.params.q ?? ''}
          maxLength={80}
          onChange={(event) => records.filter('q', event.target.value)}
        />
        <Select
          label="Campaign status"
          options={statusOptions}
          value={records.params.state ?? ''}
          onChange={(value) => records.filter('state', value)}
        />
        <Select
          label="Campaign type"
          options={Object.entries(promotionTypes)}
          value={records.params.type ?? ''}
          onChange={(value) => records.filter('type', value)}
        />
      </div>
      <Records
        records={records}
        label="Campaigns"
        empty="No campaigns match these filters"
        columns={[
          {
            title: 'Campaign',
            render: (row) => (
              <DetailLink to={root + '/' + row.id}>{row.name}</DetailLink>
            ),
          },
          { title: 'Type', render: (row) => promotionTypes[row.type] },
          { title: 'Status', render: (row) => capital(row.state) },
          {
            title: 'Schedule',
            render: (row) => (
              <>
                {time(row.startAt, row)} – {time(row.endAt, row)}
                <br />
                {row.timezone}
              </>
            ),
          },
          { title: 'Priority', render: (row) => row.priority },
        ]}
      />
    </>
  );
}

const blankCTA = () => ({ kind: 'external', label: '', url: '' });
const empty = () => ({
  type: 'announcement',
  name: '',
  title: '',
  timezone: 'Asia/Kolkata',
  primary: blankCTA(),
  placements: [{ slot: 'hero' }],
  priority: 0,
  order: 0,
});
const ref = ({ module, id, upcoming }) => ({ module, id, upcoming });
const refKey = ({ module, id }) => module + '/' + id;
function CTAEditor({ label, row, update, targets, pick }) {
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="font-semibold">{label}</legend>
      <Field
        label={label + ' label'}
        maxLength={50}
        value={row.label}
        onChange={(event) => update({ ...row, label: event.target.value })}
      />
      <Choice
        label={label + ' destination'}
        value={row.kind}
        options={[
          ['external', 'HTTPS website'],
          ['internal', 'FDFS content'],
        ]}
        onChange={(kind) =>
          update(
            kind === 'internal'
              ? { kind, label: row.label }
              : { ...blankCTA(), label: row.label },
          )
        }
      />
      {row.kind === 'external' ? (
        <Field
          label={label + ' HTTPS URL'}
          type="url"
          maxLength={2048}
          value={row.url}
          onChange={(event) => update({ ...row, url: event.target.value })}
        />
      ) : (
        <div className="grid gap-2">
          {row.target && (
            <p className="text-sm">
              {targets[refKey(row.target)]?.title ?? row.target.id}
            </p>
          )}
          <ContentPicker
            label={'Choose ' + label.toLowerCase() + ' content'}
            url={root + '/content'}
            allowUpcoming
            onSelect={(item) => {
              pick(item);
              update({ ...row, target: ref(item) });
            }}
          />
        </div>
      )}
    </fieldset>
  );
}
function Placements({ items, update }) {
  const query = useResource(root + '/placements');
  const sections = query.data?.data ?? [];
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="font-semibold">Homepage placements</legend>
      {query.isError && <p role="alert">{query.error.message}</p>}
      {items.map((row, index) => (
        <div className="grid min-w-0 gap-2 sm:grid-cols-3" key={index}>
          <Choice
            label={'Placement ' + (index + 1)}
            value={row.slot}
            options={Object.entries(placementTypes)}
            onChange={(slot) =>
              update(items.map((entry, i) => (i === index ? { slot } : entry)))
            }
          />
          {['rail', 'between'].includes(row.slot) && (
            <Choice
              label="Homepage section"
              value={row.sectionId ?? ''}
              options={[
                ['', 'Choose a section'],
                ...sections
                  .filter(
                    (section) =>
                      row.slot !== 'rail' || permittedRail(section.type),
                  )
                  .map((section) => [section.id, section.heading]),
              ]}
              onChange={(sectionId) =>
                update(
                  items.map((entry, i) =>
                    i === index
                      ? { ...row, sectionId: sectionId || undefined }
                      : entry,
                  ),
                )
              }
            />
          )}
          <Button
            variant="outline"
            className="self-end"
            disabled={items.length === 1}
            onClick={() => update(items.filter((_, i) => i !== index))}
          >
            Remove placement
          </Button>
        </div>
      ))}
      {items.length < 4 && (
        <div>
          <Button
            variant="outline"
            onClick={() => update([...items, { slot: 'footer' }])}
          >
            Add placement
          </Button>
        </div>
      )}
    </fieldset>
  );
}
function previewCTA(value, targets) {
  if (value?.kind === 'internal' && value.target) {
    const target = targets[refKey(value.target)];
    if (target?.path) return { label: value.label, href: target.path };
  }
  if (value?.kind === 'external' && value.label) {
    try {
      const url = new URL(value.url);
      if (url.protocol === 'https:' && !url.username && !url.password)
        return { label: value.label, href: url.href, external: true };
    } catch {
      /* The editor remains usable before a complete URL is entered. */
    }
  }
}
function Reports({ id, placements }) {
  const [days, setDays] = useState('30');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const range =
    days === 'custom' && from && to
      ? { from, to }
      : { days: days === 'custom' ? 30 : days };
  const query = useResource(root + '/' + id + '/metrics', range, 15000);
  const audit = useRecords(root + '/' + id + '/audit', { limit: 8 });
  const rate = (value) => (value == null ? '—' : value.toFixed(1) + '%');
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading>Campaign analytics</SectionHeading>
        <Button
          variant="outline"
          loading={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh campaign analytics
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Choice
          label="Reporting window"
          value={days}
          onChange={setDays}
          options={[
            ['1', 'Today'],
            ['7', 'Last 7 days'],
            ['30', 'Last 30 days'],
            ['90', 'Last 90 days'],
            ['custom', 'Custom dates'],
          ]}
        />
        {days === 'custom' && (
          <>
            <Field
              label="From date"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <Field
              label="Through date"
              type="date"
              min={from}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </>
        )}
      </div>
      {(days !== 'custom' || (from && to)) && (
        <QueryState query={query}>
          {(result) => (
            <Card className="grid gap-2">
              <p className="text-sm text-muted">
                {result.from} – {result.to} ({result.timezone})
              </p>
              <p>
                {result.impressions} impressions · {result.clicks} clicks ·{' '}
                {rate(result.ctr)} CTR
              </p>
              <ul className="grid gap-2">
                {result.placements.map((row) => {
                  const place = placements.find(
                    (item) => placementKey(item) === row.placement,
                  );
                  const title = place
                    ? placementTypes[place.slot] +
                      (place.sectionId ? ' · Homepage section' : '')
                    : row.placement;
                  return (
                    <li className="wrap-anywhere" key={row.placement}>
                      {title} · {row.impressions} impressions · {row.clicks}{' '}
                      clicks · {rate(row.ctr)} CTR
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </QueryState>
      )}
      <SectionHeading>Campaign history</SectionHeading>
      <Records
        records={audit}
        label="Campaign audit history"
        columns={[
          {
            title: 'Change',
            render: (row) => row.action.replace('promotion.', ''),
          },
          { title: 'Time', render: (row) => date(row.createdAt) },
          { title: 'Status', render: (row) => row.summary?.to ?? '—' },
        ]}
      />
    </div>
  );
}

function Editor({ record }) {
  const [draft, setDraft] = useState(() => record ?? empty());
  const [targets, setTargets] = useState(record?.targets ?? {});
  const [art, setArt] = useState({
    desktop: record?.desktop,
    mobile: record?.mobile,
  });
  const [preview, setPreview] = useState(null);
  const [action, setAction] = useState(null);
  const [error, setError] = useState('');
  const [start, setStart] = useState(() =>
    eventLocalTime(draft.startAt, draft.timezone),
  );
  const [end, setEnd] = useState(() =>
    eventLocalTime(draft.endAt, draft.timezone),
  );
  const navigate = useNavigate();
  const url = record ? root + '/' + record.id : root;
  const invalidates = [
    root,
    url,
    url + '/audit',
    url + '/metrics',
    'homepage-discovery',
  ];
  const save = useChange(invalidates, (result) => {
    if (!record) void navigate(root + '/' + result.data.id);
  });
  const transition = useChange(invalidates, () => setAction(null));
  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const set = (key) => (event) => update({ [key]: event.target.value });
  const pick = (item) =>
    setTargets((current) => ({ ...current, [refKey(item)]: item }));
  const archived = record?.state === 'archived';
  const choices =
    record &&
    {
      draft: ['publish', 'archive'],
      paused: ['resume', 'archive'],
      scheduled: ['pause', 'archive'],
      active: ['pause', 'archive'],
      expired: ['pause', 'archive'],
    }[record.state];
  const cta = (value) =>
    value && {
      ...value,
      label: value.label.trim(),
      ...(value.kind === 'external' && { url: value.url.trim() }),
    };
  function submit() {
    setError('');
    try {
      if (!start || !end) throw new Error('Enter the campaign start and end.');
      const startAt =
        record?.timezone === draft.timezone &&
        eventLocalTime(record.startAt, draft.timezone) === start
          ? record.startAt
          : eventUtcTime(start, draft.timezone);
      const endAt =
        record?.timezone === draft.timezone &&
        eventLocalTime(record.endAt, draft.timezone) === end
          ? record.endAt
          : eventUtcTime(end, draft.timezone);
      const {
        name,
        title,
        description,
        type,
        sponsor,
        sponsored,
        alt,
        desktopId,
        mobileId,
        focal,
        primary,
        secondary,
        priority,
        order,
        timezone,
        placements,
      } = draft;
      save.mutate({
        url,
        method: record ? 'patch' : 'post',
        data: {
          name,
          title,
          description: optional(description),
          type,
          sponsor: optional(sponsor),
          sponsored,
          alt: optional(alt),
          desktopId,
          mobileId,
          focal,
          primary: cta(primary),
          secondary: cta(secondary),
          priority,
          order,
          timezone,
          placements,
          startAt,
          endAt,
          ...(record && { revision: record.revision }),
        },
      });
    } catch (error) {
      setError(error.message);
    }
  }
  const previewItem = {
    id: 'preview',
    module: 'promotion',
    title: draft.title || 'Campaign preview',
    summary: draft.description,
    sponsor:
      draft.sponsored || draft.type === 'sponsored'
        ? draft.sponsor || 'Sponsor name'
        : undefined,
    alt: draft.alt,
    image: art.desktop,
    mobile: art.mobile,
    focal: draft.focal,
    primary: previewCTA(draft.primary, targets),
    secondary: previewCTA(draft.secondary, targets),
  };
  return (
    <>
      <DetailLink to={root}>All campaigns</DetailLink>
      <SectionHeading as="h1">
        {record ? record.name : 'Create campaign'}
      </SectionHeading>
      {record && <p role="status">Status {capital(record.state)}</p>}
      <Card as="fieldset" disabled={archived} className="grid min-w-0 gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Campaign name"
            maxLength={100}
            value={draft.name}
            onChange={set('name')}
          />
          <Choice
            label="Campaign type"
            value={draft.type}
            options={Object.entries(promotionTypes)}
            onChange={(type) => update({ type })}
          />
          <Field
            label="Public heading"
            maxLength={100}
            value={draft.title}
            onChange={set('title')}
          />
          <Field
            label="Public description"
            multiline
            maxLength={300}
            value={draft.description ?? ''}
            onChange={set('description')}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.sponsored || draft.type === 'sponsored'}
              disabled={draft.type === 'sponsored'}
              onChange={(event) => update({ sponsored: event.target.checked })}
            />
            Disclose sponsorship
          </label>
          {(draft.sponsored || draft.type === 'sponsored') && (
            <Field
              label="Sponsor name"
              maxLength={90}
              value={draft.sponsor ?? ''}
              onChange={set('sponsor')}
            />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {['desktop', 'mobile'].map((key) => (
            <ArtworkField
              key={key}
              label={capital(key) + ' campaign artwork'}
              upload
              image={
                draft[key + 'Id'] && (art[key] ?? { id: draft[key + 'Id'] })
              }
              onChange={(asset) => {
                update({ [key + 'Id']: asset?.id });
                setArt((current) => ({ ...current, [key]: asset }));
              }}
            />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Artwork alternative text"
            maxLength={200}
            value={draft.alt ?? ''}
            onChange={set('alt')}
          />
          <Choice
            label="Artwork focal point"
            value={draft.focal ?? 'center'}
            options={focalOptions}
            onChange={(focal) => update({ focal })}
          />
        </div>
        <CTAEditor
          label="Primary button"
          row={draft.primary}
          update={(primary) => update({ primary })}
          targets={targets}
          pick={pick}
        />
        {draft.secondary && (
          <CTAEditor
            label="Secondary button"
            row={draft.secondary}
            update={(secondary) => update({ secondary })}
            targets={targets}
            pick={pick}
          />
        )}
        <div>
          <Button
            variant="outline"
            onClick={() =>
              update({ secondary: draft.secondary ? undefined : blankCTA() })
            }
          >
            {draft.secondary
              ? 'Remove secondary button'
              : 'Add secondary button'}
          </Button>
        </div>
        <Placements
          items={draft.placements}
          update={(placements) => update({ placements })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Priority"
            type="number"
            min="0"
            max="100"
            value={draft.priority}
            onChange={(event) =>
              update({ priority: Number(event.target.value) })
            }
          />
          <Field
            label="Display order"
            type="number"
            min="0"
            max="1000"
            value={draft.order}
            onChange={(event) => update({ order: Number(event.target.value) })}
          />
          <Choice
            label="Schedule timezone"
            value={draft.timezone}
            options={[...new Set([...timezones, draft.timezone])].map(
              (value) => [value, value],
            )}
            onChange={(timezone) => update({ timezone })}
          />
          <div className="grid gap-2">
            <Field
              label="Starts at"
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <Field
              label="Ends at"
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        {!archived && (
          <Button loading={save.isPending} onClick={submit}>
            {record ? 'Save changes' : 'Save campaign draft'}
          </Button>
        )}
        <Button variant="outline" onClick={() => setPreview('desktop')}>
          Desktop preview
        </Button>
        <Button variant="outline" onClick={() => setPreview('mobile')}>
          Mobile preview
        </Button>
        {choices?.map((item) => (
          <Button
            key={item}
            variant="outline"
            onClick={() => {
              transition.reset();
              setAction({
                title: capital(item) + ' campaign?',
                description:
                  item === 'archive'
                    ? 'Archiving permanently retires this campaign.'
                    : 'This action applies to the saved campaign.',
                request: {
                  url: url + '/status',
                  method: 'post',
                  data: { revision: record.revision, action: item },
                },
              });
            }}
          >
            {capital(item)} campaign
          </Button>
        ))}
      </div>
      {(error || save.isError) && (
        <p role="alert" className="text-danger-text">
          {error || save.error.message}
        </p>
      )}
      <Dialog
        open={Boolean(preview)}
        title={
          preview === 'mobile'
            ? 'Mobile campaign preview'
            : 'Desktop campaign preview'
        }
        onClose={() => setPreview(null)}
        className="max-w-5xl"
      >
        <div className={preview === 'mobile' ? 'mx-auto max-w-[375px]' : ''}>
          <CampaignBanner item={previewItem} preview previewSize={preview} />
        </div>
      </Dialog>
      <ConfirmAction
        action={action}
        change={transition}
        onClose={() => setAction(null)}
      />
      {record && <Reports id={record.id} placements={record.placements} />}
    </>
  );
}
function LoadedCampaign({ id }) {
  const query = useResource(root + '/' + id);
  return (
    <QueryState query={query}>
      {(record) => <Editor key={id + ':' + record.revision} record={record} />}
    </QueryState>
  );
}
export function ManagePromotion() {
  const { id } = useParams();
  return id ? <LoadedCampaign id={id} /> : <Editor />;
}
