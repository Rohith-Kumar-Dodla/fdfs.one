import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { can } from '../../../../shared/admin.js';
import {
  priorities,
  supportCategories,
  supportMaxImages,
  ticketStatuses,
} from '../../../../shared/operations.js';
import { AppError } from '../../utils/app-error.js';
import {
  idParams,
  listInput,
  publicId,
  searchPattern,
  sendList,
} from '../../utils/list.js';
import { AuditLog, recordAudit } from '../admin/audit.js';
import { User } from '../auth/models.js';
import { normalizedEmail } from '../auth/schemas.js';
import { randomToken, tokenHash } from '../auth/tokens.js';
import { normalizeImage } from '../media/images.js';
import {
  GuestAccess,
  GuestChallenge,
  GuestRate,
  Notice,
  SupportJob,
  Ticket,
  TicketAttachment,
  TicketMessage,
} from './support-models.js';

const text = (min, max) => z.string().trim().min(min).max(max);
const ticketFields = {
  category: z.enum(Object.keys(supportCategories)),
  subject: text(5, 140),
  description: text(10, 6000),
  urgency: text(1, 300).optional(),
  clientId: publicId,
};
const create = z.strictObject(ticketFields);
export const createInput = z.object({ body: create });
const emailReference = /^FDFS-[A-F0-9]{14}$/;
export const guestStartInput = z.object({
  body: z.strictObject({ email: normalizedEmail, ticket: create }).or(
    z.strictObject({
      email: normalizedEmail,
      reference: z.string().regex(emailReference),
    }),
  ),
});
export const guestVerifyInput = z.object({
  body: z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
});
export const ticketInput = z.object({ params: idParams });
export const attachmentInput = z.object({
  params: idParams.extend({ attachment: publicId }),
});
export const ticketListInput = listInput({
  q: text(1, 80).optional(),
  status: z.enum(ticketStatuses).optional(),
  category: z.enum(Object.keys(supportCategories)).optional(),
  priority: z.enum(priorities).optional(),
  assignment: z.enum(['mine', 'unassigned', 'assigned']).optional(),
});
export const transcriptInput = listInput().extend({ params: idParams });
export const replyInput = z.object({
  params: idParams,
  body: z.strictObject({
    text: text(1, 6000),
    clientId: publicId,
    internal: z.boolean().optional(),
  }),
});
export const manageInput = z.object({
  params: idParams,
  body: z.discriminatedUnion('action', [
    z.strictObject({
      action: z.literal('status'),
      revision: z.number().int().nonnegative(),
      status: z.enum(ticketStatuses),
      resolution: text(5, 1500).optional(),
    }),
    z.strictObject({
      action: z.literal('priority'),
      revision: z.number().int().nonnegative(),
      priority: z.enum(priorities),
    }),
    z.strictObject({
      action: z.literal('assign'),
      revision: z.number().int().nonnegative(),
      assigned: publicId.nullable(),
    }),
  ]),
});
export const assignmentInput = listInput({ q: text(1, 80).optional() });
const missing = () =>
  new AppError(404, 'TICKET_NOT_FOUND', 'Ticket or attachment not found.');
const conflict = () =>
  new AppError(
    409,
    'TICKET_CHANGED',
    'This operation is unavailable. Reload the ticket and try again.',
  );
const invalidToken = () =>
  new AppError(
    401,
    'SUPPORT_LINK_INVALID',
    'This support link is invalid or expired.',
  );
const reopenTime = 30 * 86400000;
const challengeTime = 30 * 60000;
const guestLifetime = 24 * 3600000;
const recentTicket = { $in: ['open', 'in_progress', 'awaiting_user'] };
const ticketFieldsSafe =
  'publicId reference owner category subject description urgency priority status assigned lastReplyAt resolvedAt resolution __v createdAt updatedAt';
export const openSupportCount = () =>
  Ticket.countDocuments({ status: recentTicket });

export function ticketView(row, staff = false, detail = false) {
  return {
    id: row.publicId,
    reference: row.reference,
    category: row.category,
    subject: row.subject,
    priority: row.priority,
    status: row.status,
    lastReplyAt: row.lastReplyAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revision: row.__v,
    ...(detail && {
      description: row.description,
      urgency: row.urgency,
      resolution: row.resolution,
    }),
    ...(staff && {
      assigned: row.assigned ?? null,
      requester: row.owner ? 'account' : 'guest',
    }),
  };
}

export async function ticketAccess(actor, id, session = null) {
  const filter = actor.staff
    ? {}
    : actor.user
      ? { owner: actor.user.publicId }
      : { publicId: actor.guestTicket };
  if (
    !actor.staff &&
    !actor.user &&
    (!actor.guestTicket || actor.guestTicket !== id)
  )
    throw missing();
  const row = await Ticket.findOne({ ...filter, publicId: id })
    .select(ticketFieldsSafe)
    .session(session);
  if (!row) throw missing();
  return row;
}

export async function guestActor(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalidToken();
  const record = await GuestAccess.findOne({
    _id: tokenHash(token),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!record) throw invalidToken();
  return { guestTicket: record.ticket };
}

export function listTickets(res, query, actor) {
  const filter = actor.staff ? {} : { owner: actor.user.publicId };
  const { q, status, category, priority, assignment } = query;
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (priority && actor.staff) filter.priority = priority;
  if (assignment && actor.staff)
    filter.assigned =
      assignment === 'mine'
        ? actor.user.publicId
        : assignment === 'assigned'
          ? { $type: 'string' }
          : null;
  if (q)
    filter.$or = [
      { reference: q.toUpperCase() },
      { subject: searchPattern(q) },
    ];
  return sendList(
    res,
    Ticket,
    filter,
    query,
    (row) => ticketView(row, actor.staff),
    ticketFieldsSafe,
    { updatedAt: -1, _id: -1 },
  );
}

export function listAssignees(res, query) {
  const filter = {
    roles: { $in: ['support_agent', 'admin', 'super_admin'] },
    status: 'active',
    emailVerifiedAt: { $type: 'date' },
  };
  if (query.q) filter.fullName = searchPattern(query.q);
  return sendList(
    res,
    User,
    filter,
    query,
    ({ publicId, fullName }) => ({ id: publicId, name: fullName }),
    'publicId fullName',
    { fullName: 1, _id: 1 },
  );
}

export async function details(actor, id) {
  const ticket = await ticketAccess(actor, id);
  const attachments = await TicketAttachment.find({
    ticket: id,
    expiresAt: { $gt: new Date() },
  })
    .select('publicId width height bytes createdAt')
    .sort({ createdAt: 1 })
    .lean();
  return {
    ...ticketView(ticket, actor.staff, true),
    attachments: attachments.map(
      ({ publicId, width, height, bytes, createdAt }) => ({
        id: publicId,
        width,
        height,
        bytes,
        createdAt,
      }),
    ),
  };
}

export async function transcript(res, query, actor, id) {
  await ticketAccess(actor, id);
  return sendList(
    res,
    TicketMessage,
    { ticket: id, ...(!actor.staff && { kind: { $ne: 'note' } }) },
    query,
    ({ publicId, sender, kind, text, from, to, createdAt }) => ({
      id: publicId,
      sender,
      kind,
      text,
      from,
      to,
      createdAt,
    }),
  );
}

export async function ticketAudit(res, query, actor, id) {
  await ticketAccess(actor, id);
  return sendList(
    res,
    AuditLog,
    { targetType: 'support', targetId: id },
    query,
    ({ _id, action, actorId, summary, createdAt }) => ({
      id: _id,
      action,
      actorId,
      from: summary?.from,
      to: summary?.to,
      createdAt,
    }),
    'action actorId summary.from summary.to createdAt',
  );
}

export async function queueEmail(id, values, session) {
  const now = new Date();
  await SupportJob.updateOne(
    { _id: id },
    {
      $setOnInsert: {
        ...values,
        status: 'queued',
        dueAt: now,
        expiresAt: new Date(+now + 30 * 86400000),
      },
    },
    { session, upsert: true },
  );
}

async function inform(ticket, type, key, session) {
  const id = type + ':' + ticket.publicId + ':' + key;
  await queueEmail(id, { type, ticket: ticket.publicId }, session);
  if (ticket.owner && type !== 'created') {
    await Notice.updateOne(
      { key: id },
      {
        $setOnInsert: {
          key: id,
          owner: ticket.owner,
          type,
          ticket: ticket.publicId,
        },
      },
      { session, upsert: true },
    );
  }
}

async function createTicket(input, owner, guestEmail, creationKey, session) {
  const previous = await Ticket.findOne({ creationKey }).session(session);
  if (previous) return previous;
  const { category, subject, description, urgency } = input;
  const [ticket] = await Ticket.create(
    [
      {
        reference: 'FDFS-' + randomBytes(7).toString('hex').toUpperCase(),
        owner,
        guestEmail,
        category,
        subject,
        description,
        urgency,
        creationKey,
      },
    ],
    { session },
  );
  await inform(ticket, 'created', 'initial', session);
  return ticket;
}

export async function createOwnedTicket(input, user) {
  const creationKey = user.publicId + ':' + input.clientId;
  try {
    return ticketView(
      await mongoose.connection.transaction((session) =>
        createTicket(input, user.publicId, undefined, creationKey, session),
      ),
      false,
      true,
    );
  } catch (error) {
    if (error.code === 11000) {
      const ticket = await Ticket.findOne({ creationKey });
      if (ticket) return ticketView(ticket, false, true);
    }
    throw error;
  }
}

export const guestLinkToken = (secret, id) =>
  createHmac('sha256', secret)
    .update('fdfs-support-guest:' + id)
    .digest('base64url');
export async function startGuest(input, secret) {
  const now = new Date();
  const hour = Math.floor(+now / 3600000);
  const emailKey = createHmac('sha256', secret)
    .update('fdfs-support-email:' + input.email)
    .digest('hex');
  const bucket = hour + ':' + emailKey;
  await GuestRate.updateOne(
    { _id: bucket },
    { $setOnInsert: { count: 0, expiresAt: new Date((hour + 2) * 3600000) } },
    { upsert: true },
  ).catch((error) => {
    if (error.code !== 11000) throw error;
  });
  await mongoose.connection.transaction(async (session) => {
    const target = input.reference
      ? await Ticket.findOne({
          guestEmail: input.email,
          reference: input.reference,
        })
          .select('publicId')
          .session(session)
      : undefined;
    if (input.reference && !target) return;
    const admitted = await GuestRate.updateOne(
      { _id: bucket, count: { $lt: 3 } },
      { $inc: { count: 1 } },
      { session },
    );
    if (!admitted.modifiedCount) return;
    const id = randomUUID();
    await GuestChallenge.create(
      [
        {
          _id: id,
          hash: tokenHash(guestLinkToken(secret, id)),
          email: input.email,
          draft: input.ticket,
          creationKey:
            input.ticket && 'guest:' + emailKey + ':' + input.ticket.clientId,
          ticket: target?.publicId,
          expiresAt: new Date(+now + challengeTime),
        },
      ],
      { session },
    );
    await queueEmail(
      'verify:' + id,
      { type: 'verify', challenge: id },
      session,
    );
  });
  return { queued: true };
}

export function verifyGuest(token, allowCreation = () => {}) {
  const now = new Date();
  return mongoose.connection.transaction(async (session) => {
    const challenge = await GuestChallenge.findOneAndUpdate(
      {
        hash: tokenHash(token),
        usedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { usedAt: now } },
      { session, returnDocument: 'after' },
    ).select('+draft +email');
    if (!challenge) throw invalidToken();
    if (challenge.draft) await allowCreation(challenge.draft.category);
    const ticket = challenge.ticket
      ? await Ticket.findOne({ publicId: challenge.ticket }).session(session)
      : await createTicket(
          challenge.draft,
          undefined,
          challenge.email,
          challenge.creationKey,
          session,
        );
    if (!ticket) throw invalidToken();
    const access = randomToken();
    const expiresAt = new Date(+now + guestLifetime);
    await GuestAccess.create(
      [{ _id: tokenHash(access), ticket: ticket.publicId, expiresAt }],
      { session },
    );
    await GuestChallenge.updateOne(
      { _id: challenge.id },
      { $unset: { draft: 1 } },
      { session },
    );
    return { ticket: ticketView(ticket, false, true), access, expiresAt };
  });
}

export async function reply(actor, id, input) {
  if (input.internal && !actor.staff) throw missing();
  return mongoose.connection
    .transaction(async (session) => {
      const row = await ticketAccess(actor, id, session);
      const sender = actor.staff ? 'staff' : 'user';
      const existing = await TicketMessage.exists({
        ticket: id,
        sender,
        clientId: input.clientId,
      }).session(session);
      if (existing) return { duplicate: true };
      if (['resolved', 'closed'].includes(row.status)) throw conflict();
      const [message] = await TicketMessage.create(
        [
          {
            ticket: id,
            sender,
            text: input.text,
            clientId: input.clientId,
            kind: input.internal ? 'note' : 'reply',
          },
        ],
        { session },
      );
      if (!input.internal) {
        row.lastReplyAt = new Date();
        if (!actor.staff && row.status === 'awaiting_user') {
          row.status = 'in_progress';
          await transitionMessage(row, 'awaiting_user', 'in_progress', session);
        }
        if (actor.staff) await inform(row, 'reply', message.publicId, session);
        else if (row.assigned)
          await queueEmail(
            'follow-up:' + message.publicId,
            { type: 'follow_up', ticket: id, owner: row.assigned },
            session,
          );
      }
      row.increment();
      await row.save({ session });
      return {
        id: message.publicId,
        noticeOwner: actor.staff && !input.internal ? row.owner : undefined,
      };
    })
    .catch((error) => {
      if (error.name === 'VersionError') throw conflict();
      throw error;
    });
}
const allowed = {
  open: ['in_progress', 'awaiting_user', 'resolved', 'closed'],
  in_progress: ['awaiting_user', 'resolved', 'closed'],
  awaiting_user: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'open'],
  closed: ['open'],
};
async function transitionMessage(ticket, from, to, session) {
  await TicketMessage.create(
    [
      {
        ticket: ticket.publicId,
        sender: 'system',
        kind: 'transition',
        from,
        to,
      },
    ],
    { session },
  );
}
export function manage(actor, id, input, audit) {
  return mongoose.connection
    .transaction(async (session) => {
      const row = await ticketAccess(actor, id, session);
      if (row.__v !== input.revision) throw conflict();
      const field =
        input.action === 'status'
          ? 'status'
          : input.action === 'priority'
            ? 'priority'
            : 'assigned';
      const before = row[field],
        next = input[field];
      if ((before ?? null) === next)
        return { ticket: ticketView(row, actor.staff, true) };
      if (field === 'assigned' && next) {
        const assignee = await User.findOne({
          publicId: next,
          status: 'active',
          emailVerifiedAt: { $type: 'date' },
        }).session(session);
        if (!can(assignee, 'support'))
          throw new AppError(
            400,
            'SUPPORT_ASSIGNEE_INVALID',
            'Choose active, verified support staff.',
          );
      }
      if (field === 'status') {
        if (
          !allowed[before]?.includes(next) ||
          (!actor.staff &&
            (next !== 'open' ||
              !row.resolvedAt ||
              Date.now() - row.resolvedAt > reopenTime))
        )
          throw conflict();
        if (next === 'resolved' && (!actor.staff || !input.resolution))
          throw new AppError(
            400,
            'RESOLUTION_REQUIRED',
            'Enter a resolution summary.',
          );
        if (next === 'resolved') {
          row.resolvedAt = new Date();
          row.resolution = input.resolution;
        }
        if (next === 'closed' && !row.resolvedAt) row.resolvedAt = new Date();
        if (next === 'open') {
          row.resolvedAt = undefined;
          row.resolution = undefined;
        }
        await transitionMessage(row, before, next, session);
      }
      row[field] = next ?? undefined;
      row.increment();
      await row.save({ session });
      if (audit)
        await recordAudit(
          session,
          audit,
          'support.' + input.action,
          'support',
          id,
          { field: 'support', from: before, to: next },
        );
      if (field === 'status' && actor.staff)
        await inform(
          row,
          next === 'resolved' ? 'resolved' : 'status',
          String(row.__v),
          session,
        );
      return {
        ticket: ticketView(row, actor.staff, true),
        noticeOwner: field === 'status' && actor.staff ? row.owner : undefined,
      };
    })
    .catch((error) => {
      if (error.name === 'VersionError') throw conflict();
      throw error;
    });
}

export async function addAttachment(
  actor,
  id,
  bytes,
  type,
  retentionDays = 90,
) {
  await ticketAccess(actor, id);
  const image = await normalizeImage(bytes, type);
  return mongoose.connection.transaction(async (session) => {
    const row = await ticketAccess(actor, id, session);
    if (['closed', 'resolved'].includes(row.status)) throw conflict();
    const now = new Date();
    if (
      (await TicketAttachment.countDocuments({
        ticket: id,
        expiresAt: { $gt: now },
      }).session(session)) >= supportMaxImages
    )
      throw conflict();
    const expiresAt = new Date(+now + retentionDays * 86400000);
    const [asset] = await TicketAttachment.create(
      [{ ticket: id, ...image, expiresAt }],
      { session },
    );
    row.increment();
    await row.save({ session });
    return {
      id: asset.publicId,
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes,
    };
  });
}

export async function getAttachment(actor, id, attachment, audit) {
  await ticketAccess(actor, id);
  const image = await TicketAttachment.findOne({
    publicId: attachment,
    ticket: id,
    expiresAt: { $gt: new Date() },
  }).select('+data');
  if (!image) throw missing();
  if (audit)
    await recordAudit(undefined, audit, 'support.attachment', 'support', id, {
      field: 'support',
      to: attachment,
    });
  return image.data;
}
