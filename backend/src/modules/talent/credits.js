import mongoose from 'mongoose';
import { z } from 'zod';
import { participantRoles } from '../../../../shared/podcasts.js';
import { AppError } from '../../utils/app-error.js';
import { publicId } from '../../utils/list.js';
import { recordAudit } from '../admin/audit.js';
import { authorize } from '../admin/policy.js';
import { Film, FilmCredit } from '../films/models.js';
import { characterKey, creditRole } from '../films/schemas.js';
import { EpisodeParticipant, PodcastEpisode } from '../podcasts/models.js';
import { Movie } from '../reviews/models.js';
import { Personality } from './models.js';

const params = z.object({
  id: publicId,
  target: publicId,
  module: z.enum(['movies', 'independent', 'original', 'podcasts']),
});
const text = (max) => z.string().trim().min(1).max(max).optional();
const roleRow = z.strictObject({
  role: creditRole,
  character: text(100),
  department: text(80),
});
const guestRow = z.strictObject({
  role: z.enum(Object.keys(participantRoles)),
  introduction: text(300),
});
const key = (row) => row.role + ':' + characterKey(row.character);
const rowsOf = (shape) =>
  z
    .array(shape)
    .max(20)
    .refine(
      (rows) => new Set(rows.map(key)).size === rows.length,
      'Remove duplicate roles.',
    );
export const readTalentCredits = z.object({ params });
export const writeTalentCredits = readTalentCredits.extend({
  body: z.object({
    revision: z.number().int().nonnegative(),
    rows: z.array(z.unknown()).max(20),
  }),
});
const sources = {
  independent: { model: Film, link: FilmCredit, parent: 'film', limit: 60 },
  original: { model: Film, link: FilmCredit, parent: 'film', limit: 60 },
  movies: { model: Movie, limit: 100 },
  podcasts: {
    model: PodcastEpisode,
    link: EpisodeParticipant,
    parent: 'episode',
    limit: 40,
  },
};
const missing = () =>
  new AppError(404, 'CREDIT_RESOURCE_MISSING', 'Profile or content not found.');
const changed = () =>
  new AppError(
    409,
    'CREDIT_RESOURCE_CHANGED',
    'The content changed. Reload before saving credits.',
  );

async function resources({ id, target, module }, actor, session) {
  authorize(actor, 'content', module);
  const source = sources[module];
  const profile = await Personality.findOne({ publicId: id }).session(session);
  const content = await source.model
    .findOne({
      publicId: target,
      ...(source.model === Film && { classification: module }),
    })
    .session(session);
  if (!profile || !content) throw missing();
  const lock =
    source.model === Film &&
    content.status === 'published' &&
    Boolean(content.creatorId);
  const editable =
    !lock && profile.status !== 'archived' && content.status !== 'archived';
  const filter = source.link && { [source.parent]: content._id };
  const all = source.link
    ? await source.link
        .find(filter)
        .sort({ position: 1, _id: 1 })
        .session(session)
        .lean()
    : content.credits;
  const owned = all.filter((item) => item.personality.equals(profile._id));
  return { source, profile, content, all, owned, filter, editable };
}

const fields = (rows) =>
  rows.map(({ role, character, department, introduction }) => ({
    role,
    character,
    department,
    introduction,
  }));
export async function talentCredits(params, actor) {
  const { content, owned, editable } = await resources(params, actor, null);
  return { revision: content.__v, rows: fields(owned), editable };
}

export function saveTalentCredits(
  params,
  input,
  actor,
  audit,
  existingSession,
) {
  const schema = rowsOf(params.module === 'podcasts' ? guestRow : roleRow);
  const parsed = schema.safeParse(input.rows);
  if (!parsed.success)
    throw new AppError(
      400,
      'INVALID_CREDITS',
      'Select valid, distinct roles within the allowed limits.',
    );
  const apply = async (session) => {
    const { source, profile, content, all, owned, filter, editable } =
      await resources(params, actor, session);
    if (!editable || content.__v !== input.revision) throw changed();
    const existing = new Set(owned.map(key));
    if (
      profile.status !== 'published' &&
      parsed.data.some((row) => !existing.has(key(row)))
    )
      throw new AppError(
        409,
        'PROFILE_UNPUBLISHED',
        'Publish the Talent Profile before adding new credits.',
      );
    // Preserve other Talent credits and the relative order of unchanged entries.
    const pending = new Map(parsed.data.map((row) => [key(row), row]));
    const related = all.flatMap((row) => {
      if (!row.personality.equals(profile._id)) return [row];
      const identity = key(row);
      const next = pending.get(identity);
      if (!next) return [];
      pending.delete(identity);
      return [{ ...next, personality: profile._id }];
    });
    related.push(
      ...Array.from(pending.values(), (row) => ({
        ...row,
        personality: profile._id,
      })),
    );
    if (related.length > source.limit)
      throw new AppError(
        409,
        'CREDIT_LIMIT',
        'This content has reached its credit limit.',
      );
    content.updatedBy = actor.publicId;
    if (!source.link) content.credits = related;
    content.increment();
    await content.save({ session });
    if (source.link) {
      await source.link.deleteMany(filter, { session });
      await source.link.insertMany(
        related.map((row, position) => ({
          ...fields([row])[0],
          ...filter,
          personality: row.personality,
          position,
          ...(source.model === Film && {
            characterKey: characterKey(row.character),
          }),
        })),
        { session },
      );
    }
    await recordAudit(
      session,
      audit,
      'talent.credits',
      'personality',
      profile.publicId,
      {
        field: 'content-credits',
        to: content.publicId,
        reason: params.module,
      },
    );
    return { revision: content.__v, rows: parsed.data, editable };
  };
  return (
    existingSession
      ? apply(existingSession)
      : mongoose.connection.transaction(apply)
  ).catch((error) => {
    if (error.name === 'VersionError' || error.code === 11000) throw changed();
    throw error;
  });
}
