import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { recordAudit } from '../admin/audit.js';
import { User } from '../auth/models.js';
import {
  attachReference,
  MediaAsset,
  releaseReference,
} from '../media/assets.js';
import { videoSource } from '../media/video.js';
import { normalizedName, Personality } from '../talent/models.js';
import { Film, FilmCredit } from './models.js';
import { getManagedFilm, missingFilm } from './read.js';
import { characterKey, filmContent } from './schemas.js';

const filmChanged = () =>
  new AppError(
    409,
    'FILM_CHANGED',
    'The film changed. Reload before applying this action.',
  );
const invalidImage = () =>
  new AppError(
    400,
    'FILM_IMAGE_INVALID',
    'Select available images that you are authorized to use.',
  );
const invalidPerson = () =>
  new AppError(
    400,
    'FILM_CREDIT_INVALID',
    'Select available Talent Profiles for the credits.',
  );
const staff = (actor) => ({
  actorId: actor.actorId,
  requestId: actor.requestId,
});
const playback = (sourceUrl) =>
  sourceUrl
    ? videoSource.parse({
        provider: 'youtube',
        sourceUrl,
        playbackType: 'on_demand',
      })
    : undefined;
const requestedImages = (content) =>
  new Set(
    content
      ? [
          content.posterId,
          content.bannerId,
          ...content.galleryIds,
          ...content.extras.map((extra) => extra.thumbnailId),
        ].filter(Boolean)
      : [],
  );
const storedImages = (film) =>
  [
    film.poster,
    film.banner,
    ...film.gallery,
    ...film.extras.map((extra) => extra.thumbnail),
  ].filter(Boolean);

export function filmWrite(work) {
  return mongoose.connection.transaction(work).catch((error) => {
    if (error.name === 'VersionError') throw filmChanged();
    if (error.code === 11000 && error.keyPattern?.slug)
      throw new AppError(
        409,
        'FILM_SLUG_IN_USE',
        'This public slug is already in use.',
      );
    throw error;
  });
}

function audit(session, context, action, film, summary) {
  return recordAudit(
    session,
    staff(context),
    'film.' + action,
    'film',
    film.publicId,
    summary,
  );
}

function filmSlug(title, id) {
  const part = normalizedName(title)
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 68)
    .replace(/^-+|-+$/g, '');
  return (part || 'film') + '-' + id.slice(0, 8);
}

async function chooseImages(content, session, owner, current) {
  const ids = requestedImages(content);
  if (!ids.size) return new Map();
  const assets = await MediaAsset.find({
    publicId: { $in: [...ids] },
    status: 'active',
    purpose: { $in: ['library', 'film'] },
  })
    .select('publicId owner purpose')
    .session(session)
    .lean();
  const existing = new Set(current ? storedImages(current).map(String) : []);
  if (
    assets.length !== ids.size ||
    (owner &&
      assets.some(
        (asset) =>
          !existing.has(String(asset._id)) &&
          (asset.owner !== owner || asset.purpose !== 'film'),
      ))
  )
    throw invalidImage();
  return new Map(assets.map(({ publicId, _id }) => [publicId, _id]));
}

async function chooseCredits(credits, session, film) {
  const ids = [...new Set(credits.map(({ personalityId }) => personalityId))];
  if (!ids.length) return new Map();
  const people = await Personality.find({ publicId: { $in: ids } })
    .select('publicId status')
    .session(session)
    .lean();
  const existing = new Set(
    film?.isNew === false
      ? (
          await FilmCredit.distinct('personality', { film: film._id }).session(
            session,
          )
        ).map(String)
      : [],
  );
  if (
    people.length !== ids.length ||
    people.some(
      (person) =>
        person.status !== 'published' && !existing.has(String(person._id)),
    )
  )
    throw invalidPerson();
  return new Map(people.map(({ publicId, _id }) => [publicId, _id]));
}

async function attach(assetId, reference, session) {
  if (!(await attachReference(assetId, reference, session)).matchedCount)
    throw invalidImage();
}

async function setContent(
  film,
  input,
  context,
  session,
  { owner, attestedAt } = {},
) {
  const content = filmContent.parse(input);
  const {
    posterId,
    bannerId,
    galleryIds,
    mainUrl,
    trailerUrl,
    extras,
    credits,
    description,
    productionCompany,
    advisory,
    rightsNotes,
    ...details
  } = content;
  const assets = await chooseImages(content, session, owner, film);
  const people = await chooseCredits(credits, session, film);
  const previous = new Set(storedImages(film).map(String));
  const next = new Set([...assets.values()].map(String));
  const reference = { kind: 'film', targetId: film.publicId };
  for (const id of next.difference(previous))
    await attach(id, reference, session);
  for (const id of previous.difference(next))
    await releaseReference(id, reference, session);

  const titleKey = normalizedName(details.title) || details.title.toLowerCase();
  const words = titleKey.split(' ');
  film.set({
    ...details,
    description,
    productionCompany,
    advisory,
    rightsNotes,
    titleKey,
    titlePrefixes: words.map((_, index) => words.slice(index).join(' ')),
    poster: assets.get(posterId),
    banner: assets.get(bannerId),
    gallery: galleryIds.map((id) => assets.get(id)),
    mainVideo: playback(mainUrl),
    trailer: playback(trailerUrl),
    extras: extras.map(({ title, url, thumbnailId }) => ({
      title,
      video: playback(url),
      thumbnail: assets.get(thumbnailId),
    })),
    rightsConfirmedAt: details.rightsConfirmed
      ? (attestedAt ?? new Date())
      : undefined,
    rightsConfirmedBy: details.rightsConfirmed
      ? (owner ?? context.actorId)
      : undefined,
    updatedBy: context.actorId,
  });
  film.increment();
  await film.save({ session });
  await FilmCredit.deleteMany({ film: film._id }, { session });
  if (credits.length)
    await FilmCredit.insertMany(
      credits.map(
        ({ personalityId, role, character, department }, position) => ({
          film: film._id,
          personality: people.get(personalityId),
          role,
          character,
          department,
          position,
          characterKey: characterKey(character),
        }),
      ),
      { session },
    );
}

export function requireFilmReady(content) {
  if (!content.rightsConfirmed)
    throw new AppError(
      400,
      'FILM_RIGHTS_REQUIRED',
      'Confirm permission to publish and embed the supplied content.',
    );
  if (!(content.mainUrl || content.mainVideo))
    throw new AppError(
      400,
      'FILM_VIDEO_REQUIRED',
      'A valid main film video is required.',
    );
  if (!content.description)
    throw new AppError(
      400,
      'FILM_DESCRIPTION_REQUIRED',
      'A detailed description is required before review or publication.',
    );
}

function authorizeRelease(film, release, context, preserve = false) {
  if (!release?.playbackChecked)
    throw new AppError(
      400,
      'FILM_PLAYBACK_REVIEW_REQUIRED',
      'Confirm playback and embedding permissions before publishing.',
    );
  requireFilmReady(film);
  if (film.classification === 'original' && !film.productionCompany) {
    throw new AppError(
      400,
      'FILM_PRODUCTION_REQUIRED',
      'Record the authorized production company for this Original.',
    );
  }
  film.status = 'published';
  film.releaseAt = release.releaseAt
    ? new Date(release.releaseAt)
    : (preserve && film.releaseAt) || new Date();
  film.announce = release.announce ?? (preserve && film.announce);
  film.authorizedAt = new Date();
  film.authorizedBy = context.actorId;
  film.updatedBy = context.actorId;
}

async function currentFilm(id, revision, session) {
  const film = await Film.findOne({ publicId: id }).session(session);
  if (!film) throw missingFilm();
  if (film.__v !== revision) throw filmChanged();
  if (film.status === 'archived')
    throw new AppError(409, 'FILM_ARCHIVED', 'Archived films are read-only.');
  return film;
}

export async function createOriginal(input, context) {
  const { classification, slug, ...content } = input;
  if (classification !== 'original')
    throw new AppError(
      400,
      'FILM_REVIEW_REQUIRED',
      'Independent films are created from approved creator submissions.',
    );
  const id = await filmWrite(async (session) => {
    const film = new Film({ classification, createdBy: context.actorId });
    film.slug = slug ?? filmSlug(content.title, film.publicId);
    await setContent(film, content, context, session);
    await audit(session, context, 'create', film, {
      field: 'publication-status',
      to: 'draft',
    });
    return film.publicId;
  });
  return getManagedFilm(id);
}

export async function editFilm(id, { revision, ...content }, context) {
  await filmWrite(async (session) => {
    const film = await currentFilm(id, revision, session);
    if (film.status !== 'draft')
      throw new AppError(
        409,
        'FILM_UNPUBLISH_REQUIRED',
        'Unpublish this film before making direct edits.',
      );
    if (film.classification === 'independent') {
      // An administrator can curate an independent film, while the original creator remains its rights attestor.
      if (
        content.rightsConfirmed !== film.rightsConfirmed ||
        content.rightsNotes !== film.rightsNotes ||
        playback(content.mainUrl)?.providerVideoId !==
          film.mainVideo?.providerVideoId ||
        playback(content.trailerUrl)?.providerVideoId !==
          film.trailer?.providerVideoId ||
        content.extras.length !== film.extras.length ||
        content.extras.some(
          (extra, index) =>
            playback(extra.url).providerVideoId !==
            film.extras[index].video.providerVideoId,
        )
      ) {
        throw new AppError(
          409,
          'FILM_CREATOR_REVIEW_REQUIRED',
          'Changes to independent film rights or videos require a new creator proposal.',
        );
      }
    }
    await setContent(
      film,
      content,
      context,
      session,
      film.creatorId ? { attestedAt: film.rightsConfirmedAt } : {},
    );
    if (film.creatorId) {
      film.rightsConfirmedBy = film.creatorId;
      await film.save({ session });
    }
    await audit(session, context, 'edit', film, {
      field: 'film',
      to: 'updated',
    });
  });
  return getManagedFilm(id);
}

export async function changeFilmStatus(id, input, context) {
  await filmWrite(async (session) => {
    const film = await currentFilm(id, input.revision, session);
    const before = film.status;
    if (input.action === 'publish' && before === 'draft')
      authorizeRelease(film, input.release, context);
    else if (input.action === 'unpublish' && before === 'published')
      film.status = 'draft';
    else if (input.action === 'archive') film.status = 'archived';
    else
      throw new AppError(
        409,
        'FILM_INVALID_TRANSITION',
        'This publication action is unavailable.',
      );
    film.updatedBy = context.actorId;
    await film.save({ session });
    await audit(session, context, input.action, film, {
      field: 'publication-status',
      from: before,
      to: film.status,
    });
  });
  return getManagedFilm(id);
}

export function requireFilmCreator(user) {
  if (!user.roles.includes('creator'))
    throw new AppError(
      403,
      'FILM_CREATOR_REQUIRED',
      'An approved creator role is required.',
    );
}

async function ownedTarget(id, owner, session) {
  if (!id) return null;
  const film = await Film.findOne({
    publicId: id,
    creatorId: owner,
    classification: 'independent',
    status: { $ne: 'archived' },
  }).session(session);
  if (!film) throw missingFilm();
  return film;
}

export async function prepareFilmProposal(owner, proposal, session, previous) {
  if (previous && previous.targetId !== proposal.targetId)
    throw new AppError(
      400,
      'FILM_TARGET_IMMUTABLE',
      'Create a separate proposal for a different film.',
    );
  const target = await ownedTarget(proposal.targetId, owner, session);
  await chooseImages(proposal.film, session, owner, target);
  await chooseCredits(proposal.film.credits, session, target);
  const identity =
    proposal.targetId ??
    [
      normalizedName(proposal.film.title),
      playback(proposal.film.mainUrl)?.providerVideoId,
    ].join(':');
  const proposalKey = createHash('sha256')
    .update(['film', owner, identity].join(':'))
    .digest('hex');
  return {
    filmProposal: {
      ...proposal,
      targetRevision: previous?.targetRevision ?? target?.__v,
    },
    proposalKey,
  };
}

export async function setFilmProposalReferences(record, next, session) {
  const reference = { kind: 'film-proposal', targetId: record.publicId };
  const previous = requestedImages(record.filmProposal?.film);
  const current = requestedImages(next?.film);
  const added = current.difference(previous);
  const removed = previous.difference(current);
  if (added.size) {
    const target = await ownedTarget(next.targetId, record.owner, session);
    const assets = await chooseImages(next.film, session, record.owner, target);
    for (const id of added) await attach(assets.get(id), reference, session);
  }
  if (removed.size) {
    const assets = await MediaAsset.find({ publicId: { $in: [...removed] } })
      .select('_id')
      .session(session);
    for (const asset of assets)
      await releaseReference(asset._id, reference, session);
  }
}

export async function publishIndependent({
  submission,
  actorId,
  requestId,
  session,
  release,
}) {
  const proposal = submission.filmProposal;
  if (!proposal)
    throw new AppError(
      409,
      'PUBLICATION_UNAVAILABLE',
      'This submission needs structured film details before publication.',
    );
  if (
    !(await User.exists({
      publicId: submission.owner,
      roles: 'creator',
      status: 'active',
      emailVerifiedAt: { $type: 'date' },
    }).session(session))
  ) {
    throw new AppError(
      409,
      'FILM_CREATOR_INELIGIBLE',
      'The submitter must have an active, verified creator account.',
    );
  }
  const context = { actorId, requestId };
  const target = await ownedTarget(
    proposal.targetId,
    submission.owner,
    session,
  );
  if (target && target.__v !== proposal.targetRevision) throw filmChanged();
  const film =
    target ??
    new Film({
      classification: 'independent',
      creatorId: submission.owner,
      submission: submission._id,
      createdBy: actorId,
    });
  if (!target) film.slug = filmSlug(proposal.film.title, film.publicId);
  const before = film.status;
  const attestedAt = submission.history.findLast(
    ({ to }) => to === 'submitted',
  )?.at;
  await setContent(film, proposal.film, context, session, {
    owner: submission.owner,
    attestedAt,
  });
  authorizeRelease(film, release, context, Boolean(target));
  await film.save({ session });
  await setFilmProposalReferences(submission, null, session);
  await audit(session, context, target ? 'correction' : 'publish', film, {
    field: 'publication-status',
    from: before,
    to: 'published',
  });
  return {
    id: film.publicId,
    slug: film.slug,
    classification: film.classification,
  };
}
