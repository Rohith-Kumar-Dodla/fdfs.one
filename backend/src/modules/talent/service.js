import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { movieAppearances } from '../reviews/movies.js';
import { filmography } from '../films/read.js';
import { appearances } from '../podcasts/read.js';
import { sendList } from '../../utils/list.js';
import { recordAudit } from '../admin/audit.js';
import { User } from '../auth/models.js';
import {
  attachReference,
  imageView,
  MediaAsset,
  releaseReference,
} from '../media/assets.js';
import { Achievement, normalizedName, Personality } from './models.js';
import { profileContent } from './schemas.js';

const imageFields = [
  ['profileImage', 'profileImageId'],
  ['coverImage', 'coverImageId'],
];
const cardFields =
  'publicId slug displayName introduction professions profileImage';
const publicFields =
  cardFields + ' alternativeName biography location website links coverImage';
const mediaFields =
  'publicId purpose url width height bytes references createdAt alt';
const populate = (query, fields) => {
  for (const field of fields) query.populate(field, mediaFields);
  return query;
};
const notFound = () =>
  new AppError(404, 'TALENT_NOT_FOUND', 'Talent profile not found.');
const conflict = () =>
  new AppError(
    409,
    'TALENT_CHANGED',
    'This profile changed. Open it again before making changes.',
  );

export function talentWrite(work) {
  return mongoose.connection.transaction(work).catch((error) => {
    if (error.name === 'VersionError') throw conflict();
    if (error.code === 11000) {
      if (error.keyPattern?.associatedUser)
        throw new AppError(
          409,
          'TALENT_ACCOUNT_IN_USE',
          'That account already has a talent association.',
        );
      if (error.keyPattern?.slug)
        throw new AppError(
          409,
          'TALENT_SLUG_IN_USE',
          'That public slug is already in use.',
        );
    }
    throw error;
  });
}

function projectImage(image, admin) {
  if (!image?.url) return null;
  const { id, url, width, height, variants, alt } = imageView(image);
  return {
    url,
    width,
    height,
    variants,
    ...(alt && { alt }),
    ...(admin && { id }),
  };
}

function projectProfile(record, detail = false, admin = false) {
  const {
    publicId,
    slug,
    displayName,
    introduction,
    professions,
    profileImage,
  } = record;
  const card = {
    id: publicId,
    slug,
    displayName,
    introduction,
    professions,
    profileImage: projectImage(profileImage, admin),
  };
  if (!detail) return card;
  const { alternativeName, biography, location, website, links, coverImage } =
    record;
  return {
    ...card,
    alternativeName,
    biography,
    location,
    website,
    links,
    coverImage: projectImage(coverImage, admin),
  };
}

export function listTalent(res, query, admin = false) {
  const filter = {};
  if (!admin || query.status)
    filter.status = admin ? query.status : 'published';
  if (query.profession) filter.professions = query.profession;
  const name = query.q && normalizedName(query.q);
  if (name) {
    // Range on the normalized search index supports case-insensitive name prefixes.
    filter.searchNames = {
      $elemMatch: {
        $gte: name,
        $lt: name + '\uffff',
        $regex: '^' + RegExp.escape(name),
      },
    };
  }
  const sorts = {
    name: { sortName: 1, _id: 1 },
    '-name': { sortName: -1, _id: -1 },
    newest: admin ? { updatedAt: -1, _id: -1 } : { publishedAt: -1, _id: -1 },
  };
  return sendList(
    res,
    Personality,
    filter,
    query,
    (record) => ({
      ...projectProfile(record, false, admin),
      ...(admin && { status: record.status }),
    }),
    admin ? cardFields + ' status' : cardFields,
    sorts[query.sort],
    (list) => populate(list, ['profileImage']),
  );
}

function achievementView({ title, organization, year, description, source }) {
  return { title, organization, year, description, source };
}

export async function getPublicTalent(slug) {
  // Read only the currently published profile and its related achievement records.
  const [record] = await Personality.aggregate([
    { $match: { slug, status: 'published' } },
    {
      $project: Object.fromEntries(
        publicFields.split(' ').map((key) => [key, 1]),
      ),
    },
    {
      $lookup: {
        from: Achievement.collection.name,
        localField: '_id',
        foreignField: 'personality',
        pipeline: [
          { $sort: { position: 1 } },
          {
            $project: {
              _id: 0,
              title: 1,
              organization: 1,
              year: 1,
              description: 1,
              source: 1,
            },
          },
        ],
        as: 'achievements',
      },
    },
  ]);
  if (!record) throw notFound();
  const [, films, episodes, movies] = await Promise.all([
    Personality.populate(
      record,
      imageFields.map(([path]) => ({ path, select: mediaFields })),
    ),
    filmography(record._id),
    appearances(record._id),
    movieAppearances(record._id),
  ]);
  return {
    ...projectProfile(record, true),
    achievements: record.achievements,
    filmography: films,
    movieAppearances: movies,
    podcastAppearances: episodes,
  };
}

export async function getAdminTalent(id) {
  const record = await populate(Personality.findOne({ publicId: id }), [
    'profileImage',
    'coverImage',
  ])
    .populate('associatedUser', 'publicId')
    .lean();
  if (!record) throw notFound();
  const achievements = await Achievement.find({ personality: record._id })
    .sort({ position: 1 })
    .lean();
  return {
    ...projectProfile(record, true, true),
    achievements: achievements.map(achievementView),
    status: record.status,
    associatedUserId: record.associatedUser?.publicId ?? null,
    revision: record.__v,
    publishedAt: record.publishedAt,
  };
}

function generatedSlug(name, id) {
  const stem = normalizedName(name)
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  return (stem || 'talent') + '-' + id.slice(0, 8);
}

async function requireImage(publicId, session, owner) {
  const asset = await MediaAsset.findOne({
    publicId,
    status: 'active',
    purpose: owner ? 'talent' : { $in: ['library', 'talent'] },
    ...(owner && { owner }),
  }).session(session);
  if (!asset)
    throw new AppError(
      400,
      'TALENT_IMAGE_INVALID',
      'Select an available authorized image.',
    );
  return asset;
}

async function setContent(record, input, session, preserveImages = false) {
  const { achievements, profileImageId, coverImageId, ...fields } =
    profileContent.parse(input);
  const names = [fields.displayName, fields.alternativeName]
    .filter(Boolean)
    .map(normalizedName);
  const sortName = names[0] || fields.displayName.toLowerCase();
  const searchNames = [
    ...new Set(
      names.flatMap((name) =>
        name.split(' ').map((_, index, words) => words.slice(index).join(' ')),
      ),
    ),
  ];
  record.set({
    alternativeName: undefined,
    biography: undefined,
    location: undefined,
    website: undefined,
    ...fields,
    sortName,
    searchNames,
  });
  for (const [field, id] of [
    ['profileImage', profileImageId],
    ['coverImage', coverImageId],
  ]) {
    if (!id && preserveImages) continue;
    const previous = record[field];
    const next = id ? await requireImage(id, session) : null;
    if (String(previous ?? '') === String(next?._id ?? '')) continue;
    const reference = {
      kind: field === 'profileImage' ? 'talent-profile' : 'talent-cover',
      targetId: record.publicId,
    };
    if (
      next &&
      !(await attachReference(next._id, reference, session)).matchedCount
    ) {
      throw new AppError(
        409,
        'TALENT_IMAGE_CHANGED',
        'The image is no longer available.',
      );
    }
    if (previous) await releaseReference(previous, reference, session);
    record[field] = next?._id;
  }
  await record.save({ session });
  await Achievement.deleteMany({ personality: record._id }, { session });
  if (achievements.length)
    await Achievement.insertMany(
      achievements.map((entry, position) => ({
        ...entry,
        personality: record._id,
        position,
      })),
      { session },
    );
}

function profileAudit(session, context, action, record, summary) {
  return recordAudit(
    session,
    context,
    'talent.' + action,
    'personality',
    record.publicId,
    summary,
  );
}

async function currentProfile(id, revision, session) {
  const record = await Personality.findOne({ publicId: id }).session(session);
  if (!record) throw notFound();
  if (record.__v !== revision) throw conflict();
  if (record.status === 'archived')
    throw new AppError(
      409,
      'TALENT_ARCHIVED',
      'Archived profiles are read-only.',
    );
  return record;
}

export async function createTalent(input, context) {
  const { slug, ...content } = input;
  const id = await talentWrite(async (session) => {
    const record = new Personality({
      createdBy: context.actorId,
      updatedBy: context.actorId,
    });
    record.slug = slug ?? generatedSlug(content.displayName, record.publicId);
    await setContent(record, content, session);
    await profileAudit(session, context, 'create', record, {
      field: 'publication-status',
      to: 'draft',
    });
    return record.publicId;
  });
  return getAdminTalent(id);
}

export async function updateTalent(id, { revision, ...content }, context) {
  await talentWrite(async (session) => {
    const record = await currentProfile(id, revision, session);
    record.updatedBy = context.actorId;
    record.increment();
    await setContent(record, content, session);
    await profileAudit(session, context, 'edit', record, {
      field: 'profile',
      to: 'updated',
    });
  });
  return getAdminTalent(id);
}

const statusChanges = {
  publish: { from: ['draft'], to: 'published' },
  unpublish: { from: ['published'], to: 'draft' },
  archive: { from: ['draft', 'published'], to: 'archived' },
};

export async function changeTalentStatus(id, { action, revision }, context) {
  await talentWrite(async (session) => {
    const record = await currentProfile(id, revision, session);
    const { from, to } = statusChanges[action];
    const previous = record.status;
    if (!from.includes(previous))
      throw new AppError(
        409,
        'TALENT_INVALID_STATUS',
        'This publication action is unavailable.',
      );
    record.status = to;
    record.updatedBy = context.actorId;
    if (to === 'published') record.publishedAt = new Date();
    if (to === 'archived') record.archivedAt = new Date();
    await record.save({ session });
    await profileAudit(session, context, action, record, {
      field: 'publication-status',
      from: previous,
      to,
    });
  });
  return getAdminTalent(id);
}

export async function associateTalent(id, { userId, revision }, context) {
  await talentWrite(async (session) => {
    const record = await currentProfile(id, revision, session);
    const user =
      userId &&
      (await User.findOne({
        publicId: userId,
        status: 'active',
        emailVerifiedAt: { $type: 'date' },
      }).session(session));
    if (userId && !user)
      throw new AppError(
        400,
        'TALENT_ACCOUNT_INELIGIBLE',
        'Select an active, verified account.',
      );
    if (String(record.associatedUser ?? '') === String(user?._id ?? '')) return;
    const before = record.associatedUser ? 'associated' : 'unassociated';
    record.associatedUser = user?._id;
    record.updatedBy = context.actorId;
    await record.save({ session });
    await profileAudit(session, context, 'associate', record, {
      field: 'account-association',
      from: before,
      to: user ? 'associated' : 'unassociated',
    });
  });
  return getAdminTalent(id);
}

export function proposalConflict(error) {
  if (error.code === 11000 && error.keyPattern?.proposalKey) {
    throw new AppError(
      409,
      'TALENT_PROPOSAL_EXISTS',
      'You already have an open proposal for these details.',
    );
  }
  throw error;
}

export async function prepareTalentProposal(
  owner,
  proposal,
  session,
  previous,
) {
  const { targetId, profile } = proposal;
  const target =
    targetId &&
    (await Personality.findOne({ publicId: targetId, status: 'published' })
      .select('__v')
      .session(session));
  if (targetId && !target) throw notFound();
  if (previous && targetId !== previous.targetId)
    throw new AppError(
      400,
      'TALENT_TARGET_IMMUTABLE',
      'Create a separate proposal for a different profile.',
    );
  const assetIds = [profile.profileImageId, profile.coverImageId].filter(
    Boolean,
  );
  for (const assetId of new Set(assetIds))
    await requireImage(assetId, session, owner);
  const identity = targetId ?? JSON.stringify(profile);
  const proposalKey = createHash('sha256')
    .update(owner + ':' + identity)
    .digest('hex');
  return {
    proposal: {
      ...proposal,
      targetRevision: previous?.targetRevision ?? target?.__v,
    },
    proposalKey,
  };
}

export async function setProposalReferences(record, next, session) {
  const reference = { kind: 'talent-proposal', targetId: record.publicId };
  const ids = (proposal) =>
    new Set(
      [proposal?.profile.profileImageId, proposal?.profile.coverImageId].filter(
        Boolean,
      ),
    );
  const previous = ids(record.proposal);
  const current = ids(next);
  for (const id of current.difference(previous)) {
    const asset = await requireImage(id, session, record.owner);
    if (!(await attachReference(asset._id, reference, session)).matchedCount) {
      throw new AppError(
        409,
        'TALENT_IMAGE_CHANGED',
        'The proposal image is no longer available.',
      );
    }
  }
  for (const id of previous.difference(current)) {
    const asset = await MediaAsset.findOne({ publicId: id })
      .select('_id')
      .session(session);
    if (asset) await releaseReference(asset._id, reference, session);
  }
}

export async function getProposalImages(record) {
  const { profileImageId, coverImageId } = record.proposal.profile;
  const assets = await MediaAsset.find({
    publicId: { $in: [profileImageId, coverImageId].filter(Boolean) },
    owner: record.owner,
    purpose: 'talent',
    status: 'active',
  })
    .select(mediaFields)
    .lean();
  return {
    profileImage: projectImage(
      assets.find((entry) => entry.publicId === profileImageId),
      true,
    ),
    coverImage: projectImage(
      assets.find((entry) => entry.publicId === coverImageId),
      true,
    ),
  };
}

export async function publishTalent({
  submission,
  actorId,
  requestId,
  session,
}) {
  const proposal = submission.proposal;
  if (!proposal)
    throw new AppError(
      409,
      'PUBLICATION_UNAVAILABLE',
      'This submission needs structured talent details before publication.',
    );
  const { targetId, targetRevision, profile } = proposal;
  for (const id of new Set(
    [profile.profileImageId, profile.coverImageId].filter(Boolean),
  )) {
    await requireImage(id, session, submission.owner);
  }
  const record = targetId
    ? await Personality.findOne({
        publicId: targetId,
        status: 'published',
      }).session(session)
    : new Personality({ createdBy: actorId });
  if (targetId && (!record || record.__v !== targetRevision)) throw conflict();
  if (!targetId)
    record.slug = generatedSlug(profile.displayName, record.publicId);
  record.updatedBy = actorId;
  record.status = 'published';
  if (!targetId) record.publishedAt = new Date();
  else record.increment();
  await setContent(record, profile, session, Boolean(targetId));
  await setProposalReferences(submission, null, session);
  await profileAudit(
    session,
    { actorId, requestId },
    targetId ? 'correction' : 'publish',
    record,
    {
      field: 'publication-status',
      to: 'published',
      ...(targetId && { from: 'published' }),
    },
  );
  return { id: record.publicId, slug: record.slug };
}
