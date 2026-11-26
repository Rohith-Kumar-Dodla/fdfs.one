import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { idParams, publicId } from '../../utils/list.js';
import { recordAudit } from '../admin/audit.js';
import { LiveEvent } from './models.js';

const { Schema } = mongoose;
const ref = { type: Schema.Types.ObjectId, required: true };
const options = { timestamps: true, bufferCommands: false };
const messages = new Schema(
  {
    publicId: { type: String, default: randomUUID, unique: true },
    event: ref,
    author: ref,
    name: String,
    text: String,
    clientId: String,
    hiddenAt: Date,
  },
  options,
);
messages.index({ event: 1, author: 1, clientId: 1 }, { unique: true });
messages.index({ event: 1, hiddenAt: 1, _id: -1 });
const participants = new Schema(
  {
    event: ref,
    user: ref,
    until: Date,
    windowAt: Date,
    count: Number,
    lastSentAt: Date,
    lastText: String,
  },
  options,
);
participants.index({ event: 1, user: 1 }, { unique: true });
const reports = new Schema(
  {
    publicId: { type: String, unique: true, default: randomUUID },
    event: ref,
    message: { ...ref, ref: 'LiveChatMessage' },
    reporter: ref,
    reason: String,
    resolvedAt: Date,
  },
  options,
);
reports.index({ message: 1, reporter: 1 }, { unique: true });
reports.index({ event: 1, resolvedAt: 1, _id: -1 });
export const ChatMessage = mongoose.model('LiveChatMessage', messages);
export const ChatParticipant = mongoose.model(
  'LiveChatParticipant',
  participants,
);
export const ChatReport = mongoose.model('LiveChatReport', reports);
const reasons = ['harassment', 'spam', 'inappropriate', 'other'];
const cursor = z.object({
  cursor: z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .optional(),
});
export const chatHistoryInput = z.object({ query: cursor });
export const chatSendInput = z.strictObject({
  clientId: publicId,
  text: z.string().trim().min(1).max(400),
});
export const chatReportInput = z.object({
  body: z.strictObject({ messageId: publicId, reason: z.enum(reasons) }),
});
export const chatActionInput = z.object({
  params: idParams,
  body: z.discriminatedUnion('action', [
    z.strictObject({ action: z.enum(['hide', 'unmute']), messageId: publicId }),
    z.strictObject({
      action: z.literal('mute'),
      messageId: publicId,
      minutes: z.number().int().min(1).max(1440),
    }),
    z.strictObject({ action: z.literal('resolve'), reportId: publicId }),
  ]),
});

export const chatReadable = (event) =>
  event.chatEnabled && event.broadcast !== 'cancelled';
const chatClosed = () =>
  new AppError(409, 'CHAT_CLOSED', 'Chat is currently unavailable.');
const unavailable = () =>
  new AppError(404, 'CHAT_NOT_FOUND', 'Chat record not found.');
const limited = () =>
  new AppError(429, 'CHAT_RATE_LIMIT', 'Wait before sending another message.');

function messageView(message) {
  return {
    id: message.publicId,
    text: message.text,
    name: message.name,
    createdAt: message.createdAt,
  };
}

export async function chatHistory(event, before, managed = false) {
  if (!managed && !chatReadable(event)) throw chatClosed();
  const rows = await ChatMessage.find({
    event: event._id,
    ...(!managed && { hiddenAt: null }),
    ...(before && { _id: { $lt: before } }),
  })
    .sort({ _id: -1 })
    .limit(31)
    .lean();
  const page = rows.slice(0, 30);
  return {
    messages: page.reverse().map((row) => ({
      ...messageView(row),
      ...(managed && { hidden: Boolean(row.hiddenAt) }),
    })),
    cursor: rows.length === 31 ? String(rows[29]._id) : null,
  };
}

export function sendChat(eventId, user, input) {
  return mongoose.connection
    .transaction(async (session) => {
      const event = await LiveEvent.findOne({
        _id: eventId,
        status: 'published',
        moderation: 'approved',
        broadcast: 'live',
        chatEnabled: true,
      }).session(session);
      if (!event) throw chatClosed();
      const filter = {
        event: eventId,
        author: user._id,
        clientId: input.clientId,
      };
      const previous = await ChatMessage.findOne(filter).session(session);
      if (previous) return { duplicate: true, id: previous.publicId };
      const now = new Date();
      const identity = { event: eventId, user: user._id };
      const participant =
        (await ChatParticipant.findOne(identity).session(session)) ??
        new ChatParticipant(identity);
      if (participant.until > now)
        throw new AppError(403, 'CHAT_MUTED', 'You are temporarily muted.');
      const activeWindow = now - participant.windowAt < 10000;
      const sincePrevious = now - participant.lastSentAt;
      if (
        (activeWindow && participant.count >= 5) ||
        sincePrevious < event.slowSeconds * 1000 ||
        (sincePrevious < 10000 &&
          participant.lastText === input.text.toLowerCase())
      )
        throw limited();
      participant.set({
        lastSentAt: now,
        lastText: input.text.toLowerCase(),
        windowAt: activeWindow ? participant.windowAt : now,
        count: activeWindow ? participant.count + 1 : 1,
      });
      // Serialize a send with lifecycle/chat configuration changes.
      const locked = await LiveEvent.updateOne(
        { _id: event._id, __v: event.__v },
        { $inc: { chatSequence: 1 } },
        { session, timestamps: false },
      );
      if (!locked.matchedCount) throw chatClosed();
      await participant.save({ session });
      const message = new ChatMessage({
        ...filter,
        text: input.text,
        name: user.fullName,
      });
      await message.save({ session });
      return {
        duplicate: false,
        id: message.publicId,
        message: messageView(message),
      };
    })
    .catch(async (error) => {
      if (error.code !== 11000) throw error;
      const previous = await ChatMessage.findOne({
        event: eventId,
        author: user._id,
        clientId: input.clientId,
      });
      if (previous) return { duplicate: true, id: previous.publicId };
      throw limited();
    });
}

export async function reportChat(event, user, input) {
  if (!chatReadable(event)) throw chatClosed();
  const message = await ChatMessage.findOne({
    event: event._id,
    publicId: input.messageId,
    hiddenAt: null,
  });
  if (!message) throw unavailable();
  const key = { message: message._id, reporter: user._id };
  try {
    await ChatReport.updateOne(
      key,
      { $setOnInsert: { ...key, event: event._id, reason: input.reason } },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return { reported: true };
}

export async function listChatReports(event, before) {
  const rows = await ChatReport.find({
    event: event._id,
    resolvedAt: null,
    ...(before && { _id: { $lt: before } }),
  })
    .sort({ _id: -1 })
    .limit(31)
    .populate('message', 'publicId name text hiddenAt')
    .lean();
  return {
    reports: rows.slice(0, 30).map((row) => ({
      id: row.publicId,
      reason: row.reason,
      message: messageView(row.message),
      hidden: Boolean(row.message.hiddenAt),
    })),
    cursor: rows.length === 31 ? String(rows[29]._id) : null,
  };
}

export function moderateChat(loadEvent, input, context) {
  return mongoose.connection.transaction(async (session) => {
    const event = await loadEvent(session);
    const now = new Date();
    let targetId;
    if (input.action === 'resolve') {
      const report = await ChatReport.findOneAndUpdate(
        { event: event._id, publicId: input.reportId, resolvedAt: null },
        { $set: { resolvedAt: now } },
        { session },
      );
      if (!report) throw unavailable();
      targetId = report.publicId;
    } else {
      const message = await ChatMessage.findOne({
        event: event._id,
        publicId: input.messageId,
      }).session(session);
      if (!message) throw unavailable();
      targetId = message.publicId;
      if (input.action === 'hide') {
        message.hiddenAt = now;
        await message.save({ session });
      } else {
        const filter = { event: event._id, user: message.author };
        const change =
          input.action === 'mute'
            ? {
                $set: {
                  until: new Date(now.getTime() + input.minutes * 60000),
                },
              }
            : { $unset: { until: 1 } };
        await ChatParticipant.updateOne(filter, change, {
          session,
          upsert: input.action === 'mute',
        });
      }
    }
    await recordAudit(
      session,
      context,
      'live.chat_' + input.action,
      'live-event',
      event.publicId,
      { field: 'live', to: targetId },
    );
    return {
      slug: event.slug,
      removed: input.action === 'hide' ? targetId : undefined,
    };
  });
}
