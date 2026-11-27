import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  homepageSections,
  discoveryModules,
  placementKey,
  placementTypes,
  promotionTypes,
  permittedRail,
} from '../../../../shared/homepage.js';
import { AppError } from '../../utils/app-error.js';
import {
  publicId,
  idParams,
  listInput,
  searchPattern,
} from '../../utils/list.js';
import { recordAudit } from '../admin/audit.js';
import { attachReference, releaseReference } from '../media/assets.js';
import {
  discoveryAssets,
  discoveryImage,
  featureForReference,
  resolveFeatures,
} from './discovery.js';
import { readConfig } from './service.js';

const { Schema } = mongoose;
const schema = new Schema(
  {
    publicId: {
      type: String,
      default: randomUUID,
      unique: true,
      immutable: true,
    },
    name: String,
    title: String,
    description: String,
    type: { type: String, enum: Object.keys(promotionTypes) },
    sponsor: String,
    sponsored: Boolean,
    alt: String,
    desktopId: String,
    mobileId: String,
    focal: String,
    primary: Schema.Types.Mixed,
    secondary: Schema.Types.Mixed,
    placements: [Schema.Types.Mixed],
    priority: Number,
    order: Number,
    startAt: Date,
    endAt: Date,
    timezone: String,
    createdBy: String,
    updatedBy: String,
    status: {
      type: String,
      enum: ['draft', 'published', 'paused', 'archived'],
      default: 'draft',
    },
  },
  { timestamps: true, optimisticConcurrency: true, bufferCommands: false },
);
schema.index({ status: 1, startAt: 1, endAt: 1, priority: -1, order: 1 });
schema.index({ status: 1, updatedAt: -1, _id: -1 });
export const Promotion = mongoose.model('Promotion', schema);
const text = (max) => z.string().trim().min(1).max(max);
const https = z
  .url({ protocol: /^https$/ })
  .max(2048)
  .refine((value) => {
    const link = new URL(value);
    return (
      !link.username &&
      !link.password &&
      link.hostname.includes('.') &&
      !/[\s\\]/.test(value)
    );
  });
export const targetReference = z.strictObject({
  module: z.enum(discoveryModules),
  id: publicId,
  upcoming: z.boolean().optional(),
});
const cta = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('internal'),
    label: text(50),
    target: targetReference,
  }),
  z.strictObject({ kind: z.literal('external'), label: text(50), url: https }),
]);
const placement = z
  .strictObject({
    slot: z.enum(Object.keys(placementTypes)),
    sectionId: publicId.optional(),
  })
  .refine(
    ({ slot, sectionId }) =>
      Boolean(sectionId) === ['between', 'rail'].includes(slot),
    'Choose a section for this placement.',
  );
const timezone = z
  .string()
  .max(60)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return !/^[+-]/.test(value);
    } catch {
      return false;
    }
  });
const fields = {
  name: text(100),
  title: text(100),
  description: text(300).optional(),
  type: z.enum(Object.keys(promotionTypes)),
  sponsor: text(90).optional(),
  sponsored: z.boolean().default(false),
  alt: text(200).optional(),
  desktopId: publicId.optional(),
  mobileId: publicId.optional(),
  focal: z.enum(['center', 'top', 'bottom', 'left', 'right']).default('center'),
  primary: cta,
  secondary: cta.optional(),
  priority: z.number().int().min(0).max(100).default(0),
  order: z.number().int().min(0).max(1000).default(0),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  timezone: timezone.default('Asia/Kolkata'),
  placements: z
    .array(placement)
    .min(1)
    .max(4)
    .refine(
      (items) => new Set(items.map(placementKey)).size === items.length,
      'Remove duplicate placements.',
    ),
};
const input = (extra = {}) =>
  z.strictObject({ ...fields, ...extra }).superRefine((row, ctx) => {
    if (Date.parse(row.endAt) <= Date.parse(row.startAt))
      ctx.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'The end must follow the start.',
      });
    if ((row.sponsored || row.type === 'sponsored') && !row.sponsor)
      ctx.addIssue({
        code: 'custom',
        path: ['sponsor'],
        message: 'Identify the sponsor.',
      });
    if (row.mobileId && !row.desktopId)
      ctx.addIssue({
        code: 'custom',
        path: ['desktopId'],
        message: 'Choose desktop artwork first.',
      });
    if (row.desktopId && !row.alt)
      ctx.addIssue({
        code: 'custom',
        path: ['alt'],
        message: 'Describe the artwork.',
      });
    if (row.type === 'content' && row.primary.kind !== 'internal')
      ctx.addIssue({
        code: 'custom',
        path: ['primary'],
        message: 'Choose a content target.',
      });
    if (
      row.type === 'event' &&
      (row.primary.kind !== 'internal' || row.primary.target.module !== 'live')
    )
      ctx.addIssue({
        code: 'custom',
        path: ['primary'],
        message: 'Choose a Live event.',
      });
  });
const revision = z.number().int().nonnegative();
export const promotionCreate = z.object({ body: input() });
export const promotionEdit = z.object({
  params: idParams,
  body: input({ revision }),
});
export const promotionAction = z.object({
  params: idParams,
  body: z.strictObject({
    revision,
    action: z.enum(['publish', 'pause', 'resume', 'archive']),
  }),
});
const states = [
  'draft',
  'scheduled',
  'active',
  'expired',
  'paused',
  'archived',
];
export const promotionList = listInput({
  q: text(80).optional(),
  state: z.enum(states).optional(),
  type: fields.type.optional(),
});
const missing = () =>
  new AppError(404, 'PROMOTION_NOT_FOUND', 'Campaign not found.');
const invalid = (message) => new AppError(400, 'PROMOTION_INVALID', message);
const stale = () =>
  new AppError(
    409,
    'PROMOTION_CHANGED',
    'The campaign changed. Reload it before saving.',
  );
export function promotionState(row, now = new Date()) {
  if (row.status !== 'published') return row.status;
  return row.endAt <= now
    ? 'expired'
    : row.startAt > now
      ? 'scheduled'
      : 'active';
}
const stateFilter = (state, now) =>
  ({
    scheduled: { status: 'published', startAt: { $gt: now } },
    active: {
      status: 'published',
      startAt: { $lte: now },
      endAt: { $gt: now },
    },
    expired: { status: 'published', endAt: { $lte: now } },
  })[state] ?? { status: state };
const artworkIds = (row) => [row.desktopId, row.mobileId].filter(Boolean);
const targetRefs = (row) =>
  [row.primary, row.secondary]
    .filter((item) => item?.kind === 'internal')
    .map((item) => item.target);
const audit = (session, context, action, row, before) =>
  recordAudit(
    session,
    context,
    'promotion.' + action,
    'promotion',
    row.publicId,
    { field: 'promotion', from: before, to: row.status },
  );
const actionResult = {
  publish: 'published',
  pause: 'paused',
  resume: 'published',
  archive: 'archived',
};
const transition = {
  draft: ['publish', 'archive'],
  published: ['pause', 'archive'],
  paused: ['resume', 'archive'],
  archived: [],
};
export async function getPromotion(id) {
  const row = await Promotion.findOne({ publicId: id }).lean();
  if (!row) throw missing();
  const art = await discoveryAssets(artworkIds(row));
  const names = await resolveFeatures(targetRefs(row), { allowUpcoming: true });
  return {
    ...managed(row),
    desktop: discoveryImage(art.get(row.desktopId)),
    mobile: discoveryImage(art.get(row.mobileId)),
    targets: Object.fromEntries(names),
  };
}
function managed({ publicId, __v, _id, ...row }) {
  return { ...row, id: publicId, revision: __v, state: promotionState(row) };
}
export async function listPromotions(res, query) {
  const now = new Date();
  const filter = {
    ...(query.state && stateFilter(query.state, now)),
    ...(query.type && { type: query.type }),
  };
  if (query.q) filter.name = searchPattern(query.q);
  const counts = Object.fromEntries(
    await Promise.all(
      states.map(async (state) => [
        state,
        await Promotion.countDocuments(stateFilter(state, now)),
      ]),
    ),
  );
  res.set('Cache-Control', 'no-store');
  const { page, limit } = query;
  const [rows, total] = await Promise.all([
    Promotion.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Promotion.countDocuments(filter),
  ]);
  return res.json({
    success: true,
    message: 'OK',
    data: rows.map(managed),
    counts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
async function validateConfig(row, session, checkTargets) {
  const { value, published } = await readConfig('homepage', session);
  const candidates = new Map(
    [...homepageSections(published), ...value.sections].map((x) => [x.id, x]),
  );
  for (const place of row.placements) {
    const section = candidates.get(place.sectionId);
    if (
      place.sectionId &&
      (!section || (place.slot === 'rail' && !permittedRail(section.type)))
    )
      throw invalid('Choose an eligible homepage section.');
  }
  if (checkTargets) {
    const refs = targetRefs(row);
    const found = await resolveFeatures(refs, { allowUpcoming: true, session });
    if (refs.some((ref) => !featureForReference(found, ref)))
      throw invalid('Choose a currently available content target.');
  }
}
export async function writePromotion(id, input, context) {
  try {
    const publicId = await mongoose.connection.transaction(async (session) => {
      const row = id
        ? await Promotion.findOne({ publicId: id }).session(session)
        : new Promotion({ createdBy: context.actorId });
      if (!row) throw missing();
      if (row.status === 'archived' || (id && row.__v !== input.revision))
        throw stale();
      const before = row.status;
      const previous = new Set(artworkIds(row));
      const fields = { ...input };
      const action = fields.action;
      delete fields.action;
      delete fields.revision;
      if (action) {
        if (!transition[before].includes(action)) throw stale();
        if (['publish', 'resume'].includes(action) && row.endAt <= new Date())
          throw invalid('Choose a future end time.');
        row.status = actionResult[action];
      } else {
        row.set({
          description: undefined,
          sponsor: undefined,
          alt: undefined,
          desktopId: undefined,
          mobileId: undefined,
          secondary: undefined,
          ...fields,
        });
      }
      if (!action || row.status === 'published')
        await validateConfig(row, session, row.status === 'published');
      const next = new Set(artworkIds(row));
      const media = await discoveryAssets([...previous, ...next], session);
      const reference = { kind: 'promotion', targetId: row.publicId };
      for (const image of next) {
        if (!media.has(image)) throw invalid('Choose active library artwork.');
        if (
          !previous.has(image) &&
          !(await attachReference(media.get(image)._id, reference, session))
            .matchedCount
        )
          throw invalid('Choose active library artwork.');
      }
      for (const image of previous)
        if (!next.has(image) && media.has(image))
          await releaseReference(media.get(image)._id, reference, session);
      row.updatedBy = context.actorId;
      if (id) row.increment();
      await row.save({ session });
      await audit(
        session,
        context,
        action ?? (id ? 'edit' : 'create'),
        row,
        before,
      );
      return row.publicId;
    });
    return getPromotion(publicId);
  } catch (error) {
    if (error.name === 'VersionError') throw stale();
    throw error;
  }
}
const publicLink = (cta, targets) => {
  if (!cta) return undefined;
  if (cta.kind === 'external')
    return { label: cta.label, href: cta.url, external: true };
  const item = featureForReference(targets, cta.target);
  return item ? { label: cta.label, href: item.path } : undefined;
};
export async function promotionProjection(rows, now, hiddenModules = []) {
  const targets = await resolveFeatures(rows.flatMap(targetRefs), {
    allowUpcoming: true,
    now,
    hiddenModules,
  });
  for (const [key, value] of targets) {
    const root =
      value.module === 'movies' || value.module === 'reviews'
        ? '/reviews'
        : '/' + value.path.split('/')[1];
    if (hiddenModules.includes(root)) targets.delete(key);
  }
  const images = await discoveryAssets(rows.flatMap(artworkIds));
  return rows.flatMap((row) => {
    const primary = publicLink(row.primary, targets);
    if (!primary) return [];
    return [
      {
        id: row.publicId,
        title: row.title,
        summary: row.description,
        module: 'promotion',
        sponsor:
          row.sponsored || row.type === 'sponsored' ? row.sponsor : undefined,
        image: discoveryImage(images.get(row.desktopId)),
        mobile: discoveryImage(images.get(row.mobileId)),
        focal: row.focal,
        alt: row.alt,
        primary,
        secondary: publicLink(row.secondary, targets),
        placements: row.placements,
        startAt: row.startAt,
        endAt: row.endAt,
      },
    ];
  });
}
export async function activePromotions(now = new Date(), hiddenModules = []) {
  const order = { priority: -1, order: 1, _id: 1 };
  const [active, upcoming] = await Promise.all([
    Promotion.find(stateFilter('active', now)).sort(order).limit(40).lean(),
    Promotion.findOne(stateFilter('scheduled', now))
      .sort({ startAt: 1 })
      .select('startAt')
      .lean(),
  ]);
  const items = await promotionProjection(active, now, hiddenModules);
  return {
    items,
    nextAt: [upcoming?.startAt, ...active.map((row) => row.endAt)]
      .filter(Boolean)
      .sort((a, b) => a - b)[0],
  };
}
export async function promotionEligible(
  id,
  key,
  now = new Date(),
  hiddenModules = [],
) {
  const row = await Promotion.findOne({
    ...stateFilter('active', now),
    publicId: id,
  }).lean();
  if (!row?.placements.some((place) => placementKey(place) === key))
    return false;
  if ((await promotionProjection([row], now, hiddenModules)).length !== 1)
    return false;
  const { published } = await readConfig('homepage');
  const sections = homepageSections(published);
  const placement = row.placements.find((place) => placementKey(place) === key);
  return (
    !placement.sectionId ||
    sections.some(
      (section) =>
        section.id === placement.sectionId &&
        section.visible &&
        (placement.slot !== 'rail' || permittedRail(section.type)) &&
        (!section.startAt || new Date(section.startAt) <= now) &&
        (!section.endAt || new Date(section.endAt) > now),
    )
  );
}
