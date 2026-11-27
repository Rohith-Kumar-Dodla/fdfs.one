import { youtubeArtwork } from '../../../../shared/youtube-artwork.js';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { sendList, searchPattern } from '../../utils/list.js';
import { recordAudit } from '../admin/audit.js';
import { User } from '../auth/models.js';
import {
  MediaAsset,
  imageView,
  attachReference,
  releaseReference,
} from '../media/assets.js';
import { videoSource } from '../media/video.js';
import { Personality } from '../talent/models.js';
import { LiveEvent } from './models.js';
import { replanReminders } from './reminders.js';

const missing = () => new AppError(404, 'LIVE_NOT_FOUND', 'Event not found.');
const conflict = () =>
  new AppError(
    409,
    'LIVE_CONFLICT',
    'This action is unavailable for the current event. Refresh and try again.',
  );
const isEditable = (event) =>
  event.status !== 'archived' &&
  ['scheduled', 'postponed'].includes(event.broadcast);
export const visibility = (now = new Date()) => ({
  status: 'published',
  moderation: 'approved',
  $or: [{ publicationAt: null }, { publicationAt: { $lte: now } }],
});
const artwork = ['poster', 'banner', 'replayThumbnail'];
const listFields =
  'publicId slug title summary category topic language venue startAt endAt timeZone actualStartAt actualEndAt broadcast chatEnabled slowSeconds remindersEnabled organizer poster banner replayThumbnail replay.provider';
const detailFields = listFields.replace(
  'replay.provider',
  'description talent video replay providerArtworkApproved',
);
const imageFields =
  'publicId purpose url width height bytes references createdAt alt';

function populate(query, managed = false, detail = false) {
  query.populate('organizer', managed ? 'fullName publicId' : 'fullName');
  if (detail)
    query.populate({
      path: 'talent',
      select: 'publicId slug displayName',
      match: { status: 'published' },
    });
  return query.populate(
    artwork.map((path) => ({
      path,
      select: imageFields,
      match: { status: 'active' },
    })),
  );
}

function videoView(video) {
  return {
    provider: video.provider,
    providerVideoId: video.providerVideoId,
    playbackType: video.playbackType,
    sourceUrl: video.sourceUrl,
    availability: video.availability,
  };
}

function view(row, managed = false, detail = false) {
  const {
    publicId,
    slug,
    title,
    summary,
    category,
    topic,
    language,
    venue,
    startAt,
    endAt,
    timeZone,
    actualStartAt,
    actualEndAt,
    broadcast,
    chatEnabled,
    slowSeconds,
    remindersEnabled,
  } = row;
  return {
    id: publicId,
    slug,
    title,
    summary,
    category,
    topic,
    language,
    venue,
    startAt,
    endAt,
    timeZone,
    actualStartAt,
    actualEndAt,
    broadcast,
    chatEnabled,
    slowSeconds,
    remindersEnabled,
    organizer: row.organizer?.fullName,
    hasReplay: broadcast === 'ended' && Boolean(row.replay),
    ...Object.fromEntries(
      artwork
        .filter((key) => row[key]?.url)
        .map((key) => {
          const image = imageView(row[key]);
          if (managed) return [key, image];
          const { id, url, width, height, variants, alt } = image;
          return [
            key,
            { id, url, width, height, variants, ...(alt && { alt }) },
          ];
        }),
    ),
    ...(!row.poster &&
      (broadcast === 'live' || row.providerArtworkApproved) &&
      youtubeArtwork(row.video) && { poster: youtubeArtwork(row.video) }),
    ...(detail && {
      description: row.description,
      serverNow: new Date(),
      talent: row.talent.map(({ publicId, slug, displayName }) => ({
        id: publicId,
        slug,
        displayName,
      })),
      ...((managed || broadcast === 'live') &&
        row.video && { video: videoView(row.video) }),
      ...(broadcast === 'ended' &&
        row.replay && { replay: videoView(row.replay) }),
    }),
    ...(managed && {
      status: row.status,
      moderation: row.moderation,
      organizerId: row.organizer?.publicId,
      revision: row.__v,
      publicationAt: row.publicationAt,
      plannedReplayUrl: row.plannedReplayUrl,
      rightsConfirmed: row.rightsConfirmed,
      rightsNotes: row.rightsNotes,
      videoArtwork: row.video?.artwork,
    }),
  };
}

export async function publicEvent(slug) {
  const event = await LiveEvent.findOne({ slug, ...visibility() });
  if (!event) throw missing();
  return event;
}

export async function liveDetails(selector, managed = false) {
  const query = LiveEvent.findOne(selector);
  if (!managed) query.select(detailFields);
  const row = await populate(query, managed, true).lean();
  if (!row) throw missing();
  return view(row, managed, true);
}

export async function listEvents(res, query, scope) {
  const now = new Date();
  const filter = scope ? { ...scope } : visibility(now);
  const {
    category,
    q,
    from,
    to,
    availability,
    sort,
    organizer,
    status,
    moderation,
    broadcast,
  } = query;
  if (organizer && !filter.organizer)
    filter.organizer =
      (await User.findOne({ publicId: organizer }).select('_id'))?._id ?? null;
  if (category) filter.category = category;
  if (q) filter.title = searchPattern(q);
  if (status) filter.status = status;
  if (moderation) filter.moderation = moderation;
  if (broadcast) filter.broadcast = broadcast;
  if (availability === 'live') filter.broadcast = 'live';
  if (availability === 'upcoming') filter.broadcast = 'scheduled';
  if (availability === 'replay')
    Object.assign(filter, { broadcast: 'ended', replay: { $exists: true } });
  if (from || to || (!scope && availability === 'upcoming'))
    filter.startAt = {
      ...(!scope && availability === 'upcoming' && { $gt: now }),
      ...(from && { $gte: new Date(from) }),
      ...(to && { $lt: new Date(Date.parse(to) + 86400000) }),
    };
  const direction = sort === 'soonest' ? 1 : -1;
  return sendList(
    res,
    LiveEvent,
    filter,
    query,
    (row) => view(row, Boolean(scope)),
    (scope ? listFields + ' status moderation __v' : listFields) +
      ' providerArtworkApproved video.providerVideoId video.artwork',
    { startAt: direction, _id: direction },
    (find) => populate(find, Boolean(scope)),
  );
}

async function image(id, session, owner, existing = []) {
  if (!id) return undefined;
  const result = await MediaAsset.findOne({
    publicId: id,
    status: 'active',
    purpose: { $in: ['live', 'library'] },
    ...(owner && {
      $or: [
        { owner, purpose: 'live' },
        { _id: { $in: existing.filter(Boolean) } },
      ],
    }),
  })
    .session(session)
    .select('_id');
  if (!result)
    throw new AppError(
      400,
      'INVALID_LIVE_IMAGE',
      'Select an available event image.',
    );
  return result._id;
}

async function setImages(event, changes, session) {
  for (const [key, next] of Object.entries(changes)) {
    const previous = event[key];
    if (String(next) === String(previous)) continue;
    const reference = { kind: 'live-' + key, targetId: event.publicId };
    if (next && !(await attachReference(next, reference, session)).matchedCount)
      throw conflict();
    if (previous) await releaseReference(previous, reference, session);
    event[key] = next;
  }
}

export function requireOrganizer(user) {
  if (!user.roles.includes('organizer'))
    throw new AppError(
      403,
      'ORGANIZER_REQUIRED',
      'An approved organizer account is required.',
    );
}

export function requireReady(event) {
  if (
    !event.rightsConfirmed ||
    !(event.video || event.videoUrl) ||
    !(
      event.poster ||
      event.posterId ||
      (event.providerArtworkApproved && youtubeArtwork(event.video))
    )
  )
    throw new AppError(
      409,
      'LIVE_NOT_READY',
      'Add an event poster, a YouTube URL and confirm streaming rights.',
    );
}

function provider(sourceUrl, playbackType, artwork) {
  return videoSource.parse({
    provider: 'youtube',
    sourceUrl,
    playbackType,
    artwork,
  });
}

async function applyContent(event, input, actorId, session, owner) {
  const { posterId, bannerId, talentIds, videoUrl, videoArtwork, ...content } =
    input;
  const talent = await Personality.find({
    publicId: { $in: talentIds },
    status: 'published',
  })
    .select('_id')
    .session(session);
  if (talent.length !== talentIds.length)
    throw new AppError(
      400,
      'INVALID_LIVE_TALENT',
      'Select published Talent Profiles.',
    );
  const scheduleChanged = event.startAt?.toISOString() !== content.startAt;
  const existing = [event.poster, event.banner];
  await setImages(
    event,
    {
      poster: await image(posterId, session, owner, existing),
      banner: await image(bannerId, session, owner, existing),
    },
    session,
  );
  event.set({
    topic: undefined,
    venue: undefined,
    endAt: undefined,
    rightsNotes: undefined,
    ...content,
    talent: talent.map(({ _id }) => _id),
    video: videoUrl
      ? provider(videoUrl, 'scheduled_live', videoArtwork)
      : undefined,
    rightsConfirmedAt: content.rightsConfirmed ? new Date() : undefined,
    updatedBy: actorId,
  });
  if (scheduleChanged && !event.isNew) event.scheduleVersion++;
}

function slugFrom(title) {
  const base = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 70)
    .replace(/^-|-$/g, '');
  return (base || 'event') + '-' + randomUUID().slice(0, 8);
}

async function organizerById(id, session) {
  const organizer = await User.findOne({
    publicId: id,
    roles: 'organizer',
    status: 'active',
    emailVerifiedAt: { $type: 'date' },
  }).session(session);
  if (!organizer)
    throw new AppError(
      400,
      'INVALID_ORGANIZER',
      'Select an active, verified organizer.',
    );
  return organizer;
}

export function createEvent(
  input,
  actor,
  context,
  reminderLead,
  { providerArtworkApproved = false } = {},
) {
  const {
    organizerId,
    slug,
    chatEnabled,
    remindersEnabled,
    plannedReplayUrl,
    publication,
    ...content
  } = input;
  return write(async (session) => {
    const organizer = organizerId
      ? await organizerById(organizerId, session)
      : actor;
    const event = new LiveEvent({
      slug: slug ?? slugFrom(content.title),
      organizer: organizer._id,
      providerArtworkApproved,
      createdBy: context.actorId,
      plannedReplayUrl: plannedReplayUrl
        ? provider(plannedReplayUrl, 'replay').sourceUrl
        : undefined,
      chatEnabled,
      remindersEnabled,
    });
    await applyContent(event, content, context.actorId, session);
    if (publication?.mode === 'upcoming' && event.startAt <= new Date())
      throw new AppError(
        400,
        'LIVE_SCHEDULE_REQUIRED',
        'Choose a future start for the upcoming event.',
      );
    await event.save({ session });
    await audit(session, context, 'create', event, 'draft');
    if (publication) {
      await transition(event, { action: 'publish' }, context, session);
      await audit(session, context, 'publish', event, 'published/scheduled');
      if (publication.mode === 'live' && publication.broadcasting) {
        await transition(
          event,
          { action: 'start', broadcasting: true },
          context,
          session,
        );
        await audit(session, context, 'start', event, 'published/live');
      }
      await event.save({ session });
      await replanReminders(event, reminderLead, session);
    }
    return event;
  });
}

function write(operation) {
  return mongoose.connection.transaction(operation).catch((error) => {
    if (error.code === 11000 || error.name === 'VersionError') throw conflict();
    throw error;
  });
}

export async function findManaged(id, scope, session) {
  const event = await LiveEvent.findOne({ publicId: id, ...scope }).session(
    session ?? null,
  );
  if (!event) throw missing();
  return event;
}

function audit(session, context, action, event, to) {
  return recordAudit(
    session,
    context,
    'live.' + action,
    'live-event',
    event.publicId,
    { field: 'live', to },
  );
}

export function changeEvent(id, scope, input, context, lead, operation) {
  return write(async (session) => {
    const event = await findManaged(id, scope, session);
    if (event.__v !== input.revision || event.status === 'archived')
      throw conflict();
    const changes = { ...input };
    delete changes.revision;
    if (operation === 'edit') {
      if (!isEditable(event)) throw conflict();
      await applyContent(event, changes, context.actorId, session);
      if (event.status === 'published') requireReady(event);
    } else if (operation === 'options') {
      if (
        scope.organizer &&
        (event.status !== 'published' || changes.remindersEnabled !== undefined)
      )
        throw conflict();
      event.set(changes);
    } else {
      await transition(event, changes, context, session);
    }
    event.updatedBy = context.actorId;
    event.increment();
    await event.save({ session });
    await replanReminders(event, lead, session);
    await audit(
      session,
      context,
      operation === 'status' ? changes.action : operation,
      event,
      event.status + '/' + event.broadcast,
    );
    return event;
  });
}

async function transition(event, input, context, session) {
  const { action } = input;
  const now = new Date();
  switch (action) {
    case 'publish':
      if (
        event.status !== 'draft' ||
        (event.moderation === 'pending' && event.broadcast !== 'scheduled')
      )
        throw conflict();
      requireReady(event);
      if (input.publicationAt && new Date(input.publicationAt) > event.startAt)
        throw new AppError(
          400,
          'LIVE_PUBLICATION_DATE',
          'Publication must occur by the scheduled event start.',
        );
      event.set({
        publicationAt:
          input.publicationAt && new Date(input.publicationAt) > now
            ? input.publicationAt
            : undefined,
        status: 'published',
        moderation: 'approved',
        approvedAt: now,
        approvedBy: context.actorId,
      });
      break;
    case 'unpublish':
    case 'archive':
      if (
        event.broadcast === 'live' ||
        (action === 'unpublish' && event.status !== 'published')
      )
        throw conflict();
      event.status = action === 'archive' ? 'archived' : 'draft';
      break;
    case 'start':
      if (
        event.status !== 'published' ||
        event.moderation !== 'approved' ||
        event.broadcast !== 'scheduled' ||
        event.publicationAt > now
      )
        throw conflict();
      requireReady(event);
      event.set({
        broadcast: 'live',
        actualStartAt: now,
        'video.playbackType': 'live',
      });
      break;
    case 'end':
      if (event.broadcast !== 'live') throw conflict();
      event.set({ broadcast: 'ended', actualEndAt: now });
      break;
    case 'postpone':
    case 'cancel':
      if (
        !isEditable(event) ||
        (action === 'postpone' && event.broadcast !== 'scheduled')
      )
        throw conflict();
      event.broadcast = action === 'cancel' ? 'cancelled' : 'postponed';
      break;
    case 'reschedule':
      if (!isEditable(event) || new Date(input.startAt) <= now)
        throw conflict();
      if (event.startAt.toISOString() !== input.startAt)
        event.scheduleVersion++;
      event.set({
        startAt: input.startAt,
        endAt: input.endAt,
        timeZone: input.timeZone,
        broadcast: 'scheduled',
      });
      break;
    case 'replay':
    case 'remove_replay':
      if (event.broadcast !== 'ended') throw conflict();
      event.set({
        plannedReplayUrl: undefined,
        replay: input.replayUrl
          ? provider(input.replayUrl, 'replay')
          : undefined,
        replayApprovedAt: input.replayUrl ? now : undefined,
        replayApprovedBy: input.replayUrl ? context.actorId : undefined,
      });
      await setImages(
        event,
        { replayThumbnail: await image(input.thumbnailId, session) },
        session,
      );
      break;
    default:
      throw conflict();
  }
}

export async function prepareEventProposal(owner, proposal, session, previous) {
  if (previous && previous.targetId !== proposal.targetId) throw conflict();
  let existing = [];
  if (proposal.targetId) {
    const organizer = await organizerById(owner, session);
    const event = await findManaged(
      proposal.targetId,
      { organizer: organizer._id },
      session,
    );
    if (!isEditable(event)) throw conflict();
    existing = [event.poster, event.banner];
    proposal = { ...proposal, targetRevision: event.__v };
  }
  for (const id of [proposal.event.posterId, proposal.event.bannerId])
    await image(id, session, owner, existing);
  return { eventProposal: proposal };
}

export async function setEventProposalReferences(record, next, session) {
  const reference = { kind: 'live-submission', targetId: record.publicId };
  const ids = (proposal) => [
    ...new Set(
      [proposal?.event.posterId, proposal?.event.bannerId].filter(Boolean),
    ),
  ];
  const previous = ids(record.eventProposal);
  const upcoming = ids(next);
  for (const id of upcoming.filter((id) => !previous.includes(id))) {
    // The proposal has already checked ownership and current event references in this transaction.
    const asset = await MediaAsset.findOne({ publicId: id, status: 'active' })
      .select('_id')
      .session(session);
    if (
      !asset ||
      !(await attachReference(asset._id, reference, session)).matchedCount
    )
      throw conflict();
  }
  for (const id of previous.filter((id) => !upcoming.includes(id))) {
    const asset = await MediaAsset.findOne({ publicId: id })
      .select('_id')
      .session(session);
    if (asset) await releaseReference(asset._id, reference, session);
  }
}

export async function eventProposalDetails(proposal) {
  const { posterId, bannerId, talentIds } = proposal.event;
  const [images, talent] = await Promise.all([
    MediaAsset.find({
      publicId: { $in: [posterId, bannerId].filter(Boolean) },
      status: 'active',
    })
      .select(imageFields)
      .lean(),
    Personality.find({ publicId: { $in: talentIds }, status: 'published' })
      .select('publicId slug displayName')
      .lean(),
  ]);
  const byId = new Map(
    images.map((asset) => [asset.publicId, imageView(asset)]),
  );
  return {
    eventImages: { poster: byId.get(posterId), banner: byId.get(bannerId) },
    eventTalent: talent.map(({ publicId, slug, displayName }) => ({
      id: publicId,
      slug,
      displayName,
    })),
  };
}

export function publishEventSubmission(lead) {
  return async ({ submission, actorId, requestId, session }) => {
    const proposal = submission.eventProposal;
    if (!proposal) throw conflict();
    requireReady(proposal.event);
    const organizer = await organizerById(submission.owner, session);
    const event = proposal.targetId
      ? await findManaged(
          proposal.targetId,
          { organizer: organizer._id },
          session,
        )
      : new LiveEvent({
          slug: slugFrom(proposal.event.title),
          organizer: organizer._id,
          submission: submission._id,
          createdBy: submission.owner,
        });
    if (
      proposal.targetId &&
      (!isEditable(event) || event.__v !== proposal.targetRevision)
    )
      throw conflict();
    await applyContent(
      event,
      proposal.event,
      actorId,
      session,
      submission.owner,
    );
    event.set({
      status: 'published',
      publicationAt: undefined,
      broadcast: 'scheduled',
      moderation: 'approved',
      approvedAt: new Date(),
      approvedBy: actorId,
    });
    await event.save({ session });
    await replanReminders(event, lead, session);
    await setEventProposalReferences(submission, null, session);
    await audit(session, { actorId, requestId }, 'publish', event, 'published');
    return { id: event.publicId, slug: event.slug };
  };
}
