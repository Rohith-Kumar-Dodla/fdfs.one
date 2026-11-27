import mongoose from 'mongoose';
import { podcastBrand } from '../../../../shared/podcasts.js';
import { AppError } from '../../utils/app-error.js';
import { recordAudit } from '../admin/audit.js';
import {
  attachReference,
  MediaAsset,
  releaseReference,
} from '../media/assets.js';
import { videoSource } from '../media/video.js';
import { normalizedName, Personality } from '../talent/models.js';
import { EpisodeParticipant, PodcastEpisode, PodcastShow } from './models.js';
import { findShow, getEpisode, getShow, missingEpisode } from './read.js';

const changed = () =>
  new AppError(
    409,
    'PODCAST_CHANGED',
    'The record changed. Reload before trying again.',
  );
const transition = () =>
  new AppError(
    409,
    'PODCAST_TRANSITION_INVALID',
    'This publication action is unavailable.',
  );
const mediaError = () =>
  new AppError(
    400,
    'PODCAST_MEDIA_INVALID',
    'Select an available media library image.',
  );
function write(work) {
  return mongoose.connection.transaction(work).catch((error) => {
    if (error.name === 'VersionError') throw changed();
    if (error.code === 11000)
      throw new AppError(
        409,
        'PODCAST_DUPLICATE',
        'This show slug or episode season and number is already in use.',
      );
    throw error;
  });
}
export function podcastAudit(session, context, action, type, id, summary) {
  return recordAudit(session, context, 'podcast.' + action, type, id, summary);
}
async function setImages(record, map, kind, session) {
  const reference = { kind, targetId: record.publicId };
  const ids = [...new Set(Object.values(map).flat().filter(Boolean))];
  const assets = await MediaAsset.find({
    publicId: { $in: ids },
    status: 'active',
    purpose: 'library',
  })
    .select('publicId')
    .session(session);
  if (assets.length !== ids.length) throw mediaError();
  const byId = new Map(assets.map((asset) => [asset.publicId, asset._id]));
  const previous = new Set(
    Object.keys(map).flatMap((key) =>
      [record[key]].flat().filter(Boolean).map(String),
    ),
  );
  const next = new Set(assets.map((asset) => String(asset._id)));
  for (const id of next.difference(previous)) {
    if (!(await attachReference(id, reference, session)).matchedCount)
      throw mediaError();
  }
  for (const id of previous.difference(next))
    await releaseReference(id, reference, session);
  for (const [key, id] of Object.entries(map))
    record[key] = Array.isArray(id)
      ? id.map((item) => byId.get(item))
      : byId.get(id);
}
async function choosePeople(ids, existing, session) {
  const unique = [...new Set(ids)];
  const people = await Personality.find({ publicId: { $in: unique } })
    .select('publicId status')
    .session(session);
  const prior = new Set(existing.map(String));
  if (
    people.length !== unique.length ||
    people.some((p) => p.status !== 'published' && !prior.has(String(p._id)))
  ) {
    throw new AppError(
      400,
      'PODCAST_PARTICIPANT_INVALID',
      'Select available Talent Profiles.',
    );
  }
  return new Map(people.map((p) => [p.publicId, p._id]));
}

export async function saveShow(
  { revision, coverId, bannerId, hostIds, ...content },
  context,
) {
  await write(async (session) => {
    const existing = await findShow(false).session(session);
    if (existing ? existing.__v !== revision : revision !== undefined)
      throw changed();
    if (existing?.status === 'archived') throw transition();
    if (existing?.status === 'published' && !content.rightsConfirmed)
      throw new AppError(
        400,
        'PODCAST_SHOW_RIGHTS_REQUIRED',
        'Confirm rights to use the show information and artwork.',
      );
    const show =
      existing ??
      new PodcastShow({ ...podcastBrand, createdBy: context.actorId });
    const people = await choosePeople(hostIds, show.hosts, session);
    await setImages(
      show,
      { cover: coverId, banner: bannerId },
      'podcast-show',
      session,
    );
    show.set({
      ...content,
      updatedBy: context.actorId,
      hosts: hostIds.map((id) => people.get(id)),
    });
    show.increment();
    await show.save({ session });
    await podcastAudit(
      session,
      context,
      existing ? 'show_edit' : 'show_create',
      'podcast-show',
      show.publicId,
      { field: 'podcast', to: show.status },
    );
  });
  return getShow(false);
}

function changeStatus(record, action) {
  if (action === 'publish' && record.status === 'draft')
    record.status = 'published';
  else if (action === 'unpublish' && record.status === 'published')
    record.status = 'draft';
  else if (action === 'archive' && record.status !== 'archived')
    record.status = 'archived';
  else throw transition();
}

export async function changeShow({ action, revision }, context) {
  await write(async (session) => {
    const show = await findShow(false).session(session);
    if (!show || show.__v !== revision) throw changed();
    const before = show.status;
    if (action === 'publish' && !show.rightsConfirmed)
      throw new AppError(
        400,
        'PODCAST_SHOW_RIGHTS_REQUIRED',
        'Confirm rights to use the show information and artwork.',
      );
    changeStatus(show, action);
    show.updatedBy = context.actorId;
    await show.save({ session });
    await podcastAudit(
      session,
      context,
      'show_' + action,
      'podcast-show',
      show.publicId,
      { field: 'publication-status', from: before, to: show.status },
    );
  });
  return getShow(false);
}

const video = (sourceUrl, artwork) =>
  sourceUrl &&
  videoSource.parse({
    provider: 'youtube',
    playbackType: 'on_demand',
    sourceUrl,
    artwork,
  });
async function setEpisode(record, input, context, session) {
  const {
    thumbnailId,
    bannerId,
    galleryIds,
    extras,
    participants,
    mainUrl,
    videoArtwork,
    teaserUrl,
    releaseAt,
    notes,
    advisory,
    rightsNotes,
    ...fields
  } = input;
  const existing = record.isNew
    ? []
    : await EpisodeParticipant.distinct('personality', {
        episode: record._id,
      }).session(session);
  const people = await choosePeople(
    participants.map(({ personalityId }) => personalityId),
    existing,
    session,
  );
  await setImages(
    record,
    { thumbnail: thumbnailId, banner: bannerId, gallery: galleryIds },
    'podcast-episode',
    session,
  );
  const published = record.status === 'published';
  const title = normalizedName(fields.title) || fields.title;
  const words = title.split(' ');
  record.set({
    ...fields,
    notes,
    advisory,
    rightsNotes,
    titlePrefixes: words.map((_, index) => words.slice(index).join(' ')),
    mainVideo: video(mainUrl, videoArtwork),
    teaser: video(teaserUrl),
    extras: extras.map(({ title, url }) => ({ title, video: video(url) })),
    releaseAt: published
      ? record.releaseAt
      : releaseAt
        ? new Date(releaseAt)
        : undefined,
    rightsConfirmedAt: published
      ? record.rightsConfirmedAt
      : fields.rightsConfirmed
        ? new Date()
        : undefined,
    updatedBy: context.actorId,
  });
  record.increment();
  await record.save({ session });
  await EpisodeParticipant.deleteMany({ episode: record._id }, { session });
  if (participants.length)
    await EpisodeParticipant.insertMany(
      participants.map(({ personalityId, role, introduction }, position) => ({
        episode: record._id,
        personality: people.get(personalityId),
        role,
        introduction,
        position,
      })),
      { session },
    );
}
async function readManaged(id, revision, session) {
  const record = await PodcastEpisode.findOne({ publicId: id }).session(
    session,
  );
  if (!record) throw missingEpisode();
  if (record.__v !== revision) throw changed();
  return record;
}

async function publishEpisode(record, release, context, session) {
  if (!(await findShow(true).select('_id').session(session)))
    throw new AppError(
      409,
      'PODCAST_SHOW_UNPUBLISHED',
      'Publish the show before publishing an episode.',
    );
  if (
    !record.rightsConfirmed ||
    !record.mainVideo?.providerVideoId ||
    !release.playbackChecked
  ) {
    throw new AppError(
      400,
      'PODCAST_PLAYBACK_REQUIRED',
      'Confirm distribution rights and verify an embeddable main video.',
    );
  }
  const now = new Date();
  const releaseAt = release.releaseAt
    ? new Date(release.releaseAt)
    : (record.releaseAt ?? now);
  const publicationAt = release.publicationAt
    ? new Date(release.publicationAt)
    : release.announce
      ? now
      : releaseAt;
  if (!release.announce && publicationAt < releaseAt)
    throw new AppError(
      400,
      'PODCAST_ANNOUNCEMENT_REQUIRED',
      'Authorize an announcement to publish before full playback starts.',
    );
  record.set({
    releaseAt,
    publicationAt,
    announce: Boolean(release.announce),
    authorizedAt: now,
    authorizedBy: context.actorId,
  });
}

export async function createEpisode({ slug, release, ...content }, context) {
  const id = await write(async (session) => {
    const show = await findShow(false).select('_id status').session(session);
    if (!show || show.status === 'archived')
      throw new AppError(
        409,
        'PODCAST_SHOW_REQUIRED',
        'Configure the show before adding episodes.',
      );
    const record = new PodcastEpisode({
      show: show._id,
      createdBy: context.actorId,
    });
    const stem = normalizedName(content.title)
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 70)
      .replace(/^-+|-+$/g, '');
    record.slug =
      slug ?? (stem || 'episode') + '-' + record.publicId.slice(0, 8);
    await setEpisode(record, content, context, session);
    await podcastAudit(
      session,
      context,
      'episode_create',
      'podcast-episode',
      record.publicId,
      { field: 'publication-status', to: 'draft' },
    );
    if (release) {
      changeStatus(record, 'publish');
      await publishEpisode(record, release, context, session);
      await record.save({ session });
      await podcastAudit(
        session,
        context,
        'episode_publish',
        'podcast-episode',
        record.publicId,
        {
          field: 'publication-status',
          from: 'draft',
          to: 'published',
        },
      );
    }
    return record.publicId;
  });
  return getEpisode(id, true);
}

export async function editEpisode(
  id,
  { revision, keepPublished, ...content },
  context,
) {
  await write(async (session) => {
    const record = await readManaged(id, revision, session);
    if (
      record.status !== 'draft' &&
      !(record.status === 'published' && keepPublished)
    )
      throw transition();
    if (
      record.status === 'published' &&
      (content.rightsConfirmed !== record.rightsConfirmed ||
        content.rightsNotes !== record.rightsNotes ||
        video(content.mainUrl)?.providerVideoId !==
          record.mainVideo?.providerVideoId ||
        video(content.teaserUrl)?.providerVideoId !==
          record.teaser?.providerVideoId ||
        content.extras.length !== record.extras.length ||
        content.extras.some(
          (extra, index) =>
            video(extra.url).providerVideoId !==
            record.extras[index].video.providerVideoId,
        ))
    )
      throw new AppError(
        409,
        'PODCAST_UNPUBLISH_REQUIRED',
        'Unpublish before changing episode video sources or distribution rights.',
      );
    await setEpisode(record, content, context, session);
    await podcastAudit(
      session,
      context,
      'episode_edit',
      'podcast-episode',
      id,
      { field: 'podcast', to: 'updated' },
    );
  });
  return getEpisode(id, true);
}

export async function changeEpisode(
  id,
  { action, revision, release },
  context,
) {
  await write(async (session) => {
    const record = await readManaged(id, revision, session);
    const before = record.status;
    changeStatus(record, action);
    if (action === 'publish') {
      await publishEpisode(record, release, context, session);
    }
    record.updatedBy = context.actorId;
    await record.save({ session });
    await podcastAudit(
      session,
      context,
      'episode_' + action,
      'podcast-episode',
      id,
      { field: 'publication-status', from: before, to: record.status },
    );
  });
  return getEpisode(id, true);
}
