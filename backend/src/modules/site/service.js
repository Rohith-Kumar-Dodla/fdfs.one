import mongoose from 'mongoose';
import { siteDefaults } from '../../../../shared/site.js';
import { filmPaths } from '../../../../shared/films.js';
import { searchPattern, sendList } from '../../utils/list.js';
import { AppError } from '../../utils/app-error.js';
import { recordAudit } from '../admin/audit.js';
import { Film } from '../films/models.js';
import { visibility } from '../live/events.js';
import { LiveEvent } from '../live/models.js';
import {
  MediaAsset,
  attachReference,
  releaseReference,
  imageView,
} from '../media/assets.js';
import { PodcastEpisode } from '../podcasts/models.js';
import { discover, resolveFeatures } from './discovery.js';
import { defaultHomepage } from '../../../../shared/homepage.js';
import { findShow } from '../podcasts/read.js';
import { Personality } from '../talent/models.js';

const schema = new mongoose.Schema(
  {
    _id: { type: String, enum: ['settings', 'homepage'] },
    revision: { type: Number, default: 0 },
    value: mongoose.Schema.Types.Mixed,
    published: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true, bufferCommands: false },
);
export const SiteConfig = mongoose.model('SiteConfig', schema);
const branding = ['logo', 'favicon', 'brand', 'socialImage'];
const invalid = (message) =>
  new AppError(400, 'INVALID_SITE_REFERENCE', message);
const stale = () =>
  new AppError(
    409,
    'SITE_CHANGED',
    'Configuration changed. Reload before saving.',
  );
const lookupKey = ({ module, id }) => module + '/' + id;
const mediaIds = (key, value) =>
  (key === 'settings'
    ? branding.map((item) => value?.[item + 'Id'])
    : [
        value?.hero?.imageId,
        ...(value?.heroSlides ?? []).flatMap((slide) => [
          slide.imageId,
          slide.mobileId,
        ]),
        ...(value?.genres ?? []).map((row) => row.imageId),
      ]
  ).filter(Boolean);
const references = (value) =>
  [
    value.hero?.featured,
    ...(value.heroSlides ?? []).flatMap((row) =>
      row.target ? [row.target] : [],
    ),
    ...Object.values(value.featuredPicks ?? {}).flat(),
    ...value.sections.flatMap((row) => row.items),
  ].filter(Boolean);
const active = ({ startAt, endAt }, now) =>
  (!startAt || new Date(startAt) <= now) && (!endAt || new Date(endAt) > now);

async function featureSource(module, now, session) {
  const filter = { status: 'published' };
  const released = { releaseAt: { $lte: now } };
  const model = {
    independent: Film,
    original: Film,
    podcasts: PodcastEpisode,
    live: LiveEvent,
    talent: Personality,
  }[module];
  if (module === 'podcasts') {
    const show = await findShow(true).session(session ?? null);
    Object.assign(filter, released, {
      show: show?._id ?? null,
      publicationAt: { $lte: now },
    });
  }
  if (Object.hasOwn(filmPaths, module))
    Object.assign(filter, released, { classification: module });
  if (module === 'live')
    Object.assign(filter, visibility(now), { broadcast: { $ne: 'cancelled' } });
  return { model, filter };
}

function featureView(row, module) {
  return {
    id: row.publicId,
    module,
    title: row.title ?? row.displayName,
    slug: row.slug,
    path: (filmPaths[module] ?? '/' + module) + '/' + row.slug,
  };
}

export async function listFeatures(res, query) {
  const { module, q } = query;
  if (['movies', 'reviews'].includes(module) || query.upcoming === true) {
    const { items, count } = await discover(module, {
      mode: query.upcoming ? 'upcoming' : 'released',
      q,
      limit: query.limit,
      page: query.page,
      withCount: true,
    });
    return res.json({
      success: true,
      message: 'OK',
      data: items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: count,
        totalPages: Math.ceil(count / query.limit),
      },
    });
  }
  const { model, filter } = await featureSource(module, new Date());
  if (q)
    filter[module === 'talent' ? 'displayName' : 'title'] = searchPattern(q);
  return sendList(
    res,
    model,
    filter,
    query,
    (row) => featureView(row, module),
    'publicId title displayName slug',
  );
}

async function features(items, now, session) {
  const modern = items.filter(
    (item) => ['movies', 'reviews'].includes(item.module) || item.upcoming,
  );
  const extended = await resolveFeatures(modern, {
    now,
    session,
    allowUpcoming: true,
  });
  const grouped = Map.groupBy(
    items.filter((item) => !modern.includes(item)),
    ({ module }) => module,
  );
  const lookup = async ([module, refs]) => {
    const { model, filter } = await featureSource(module, now, session);
    filter.publicId = { $in: refs.map(({ id }) => id) };
    const rows = await model
      .find(filter)
      .select('publicId title displayName slug')
      .session(session ?? null)
      .lean();
    return rows.map((row) => [
      lookupKey({ module, id: row.publicId }),
      featureView(row, module),
    ]);
  };
  if (!session)
    return new Map([
      ...extended,
      ...(await Promise.all(Array.from(grouped, lookup))).flat(),
    ]);
  const results = [...extended];
  for (const group of grouped) results.push(...(await lookup(group)));
  return new Map(results);
}

async function assets(ids, session) {
  if (!ids.length) return [];
  return MediaAsset.find({
    publicId: { $in: ids },
    status: 'active',
    purpose: 'library',
  })
    .select('publicId purpose url width height bytes references createdAt alt')
    .session(session ?? null)
    .lean();
}

async function updateReferences(key, previous, next, kind, session) {
  const before = new Set(mediaIds(key, previous));
  const after = new Set(mediaIds(key, next));
  const found = await assets([...new Set([...before, ...after])], session);
  const byId = new Map(found.map((item) => [item.publicId, item._id]));
  const ref = { kind, targetId: key };
  for (const id of after) {
    if (!byId.has(id)) throw invalid('Choose an active library image.');
    if (
      !before.has(id) &&
      !(await attachReference(byId.get(id), ref, session)).matchedCount
    )
      throw invalid('Choose an active library image.');
  }
  for (const id of before)
    if (!after.has(id) && byId.has(id))
      await releaseReference(byId.get(id), ref, session);
}

export async function readConfig(key, session) {
  const row = await SiteConfig.findById(key)
    .session(session ?? null)
    .lean();
  return {
    revision: row?.revision ?? 0,
    value: row?.value ?? (key === 'settings' ? siteDefaults : defaultHomepage),
    published: row?.published,
  };
}

export function saveConfig(key, revision, value, context, publish = false) {
  return mongoose.connection
    .transaction(async (session) => {
      const previous = await SiteConfig.findById(key).session(session);
      if ((previous?.revision ?? 0) !== revision || (publish && !previous))
        throw stale();
      const next = publish ? previous.value : { ...value };
      if (key === 'settings') {
        for (const field of [
          'analyticsOpen',
          'personalization',
          'supportOpen',
          'supportCategories',
        ]) {
          if (
            next[field] === undefined &&
            previous?.value?.[field] !== undefined
          )
            next[field] = previous.value[field];
        }
      }
      if (key === 'homepage') {
        const previousRefs = new Set(
          references(previous?.value ?? defaultHomepage).map(
            (ref) => lookupKey(ref) + ':' + Boolean(ref.upcoming),
          ),
        );
        const refs = references(next).filter(
          (ref) =>
            !previousRefs.has(lookupKey(ref) + ':' + Boolean(ref.upcoming)),
        );
        const valid = await features(refs, new Date(), session);
        if (refs.some((ref) => !valid.has(lookupKey(ref))))
          throw invalid('Choose published, publicly visible content.');
      }
      const field = publish ? 'published' : 'value';
      const kind =
        key === 'settings'
          ? 'website-settings'
          : publish
            ? 'homepage-published'
            : 'homepage-draft';
      await updateReferences(key, previous?.[field], next, kind, session);
      const row = await SiteConfig.findOneAndUpdate(
        { _id: key, revision },
        {
          $set: { [field]: next },
          $inc: { revision: 1 },
        },
        { session, upsert: !previous, returnDocument: 'after' },
      );
      if (!row) throw stale();
      await recordAudit(
        session,
        context,
        key === 'settings'
          ? 'site.settings'
          : publish
            ? 'site.homepage_publish'
            : 'site.homepage_save',
        'site',
        key,
        { field: 'site', to: String(row.revision) },
      );
      if (
        key === 'settings' &&
        (previous?.value?.analyticsOpen !== false) !==
          (next.analyticsOpen !== false)
      ) {
        await recordAudit(session, context, 'site.analytics', 'site', key, {
          field: 'site',
          to: next.analyticsOpen === false ? 'disabled' : 'enabled',
        });
      }
      return {
        revision: row.revision,
        value: row.value,
        published: row.published,
      };
    })
    .catch((error) => {
      if (error.code === 11000) throw stale();
      throw error;
    });
}

export async function siteFlags() {
  if (mongoose.connection.readyState !== 1) return siteDefaults;
  const row = await SiteConfig.findById('settings')
    .select('value.registrationOpen value.maintenance value.communityOpen')
    .lean();
  return {
    registrationOpen: true,
    maintenance: false,
    communityOpen: true,
    ...row?.value,
  };
}

function publicImage(row) {
  if (!row) return undefined;
  const { url, width, height, alt, variants } = imageView(row);
  return { url, width, height, alt, variants };
}

export async function publicSettings() {
  const { value } = await readConfig('settings');
  const images = new Map(
    (await assets(mediaIds('settings', value))).map((row) => [
      row.publicId,
      row,
    ]),
  );
  const {
    name,
    description,
    contact,
    supportEmail,
    hiddenModules,
    footer,
    links,
    socials,
    seoTitle,
    seoDescription,
    legal,
    registrationOpen,
    maintenance,
    communityOpen,
    supportOpen,
    analyticsOpen,
    personalization,
  } = value;
  return {
    name,
    description,
    contact,
    supportEmail,
    hiddenModules,
    footer,
    links,
    socials,
    seoTitle,
    seoDescription,
    legal,
    registrationOpen,
    maintenance,
    communityOpen,
    supportOpen: supportOpen ?? siteDefaults.supportOpen,
    analyticsOpen: analyticsOpen ?? siteDefaults.analyticsOpen,
    ...(personalization && { personalization }),
    ...Object.fromEntries(
      branding.map((item) => [
        item,
        publicImage(images.get(value[item + 'Id'])),
      ]),
    ),
  };
}

export async function homepageView(value, preview = false) {
  const now = new Date();
  const hero =
    value.hero && (preview || active(value.hero, now)) ? value.hero : undefined;
  const visible = value.sections.filter(
    (row) => preview || (row.visible && active(row, now)),
  );
  const [items, images] = await Promise.all([
    features(
      [hero?.featured, ...visible.flatMap((row) => row.items)].filter(Boolean),
      now,
    ),
    assets(mediaIds('homepage', { hero })),
  ]);
  return {
    hero: hero && {
      title: hero.title,
      description: hero.description,
      featured: hero.featured && items.get(lookupKey(hero.featured)),
      image: publicImage(images[0]),
    },
    ...(preview && {
      sections: visible.map(({ items: chosen, ...row }) => ({
        ...row,
        items: chosen.map((item) => items.get(lookupKey(item))).filter(Boolean),
      })),
    }),
  };
}
