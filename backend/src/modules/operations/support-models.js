import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  priorities,
  supportCategories,
  ticketStatuses,
} from '../../../../shared/operations.js';
const { Schema } = mongoose;
const defaults = { timestamps: true, bufferCommands: false };
const publicId = {
  type: String,
  default: randomUUID,
  unique: true,
  immutable: true,
};
const ticket = new Schema(
  {
    publicId,
    reference: { type: String, unique: true, immutable: true },
    owner: { type: String, immutable: true },
    guestEmail: { type: String, select: false },
    creationKey: { type: String, unique: true, sparse: true },
    category: { type: String, enum: Object.keys(supportCategories) },
    subject: String,
    description: String,
    urgency: String,
    priority: { type: String, enum: priorities, default: 'medium' },
    status: { type: String, enum: ticketStatuses, default: 'open' },
    assigned: String,
    lastReplyAt: Date,
    resolvedAt: Date,
    resolution: String,
  },
  { ...defaults, optimisticConcurrency: true },
);
ticket.index({ owner: 1, updatedAt: -1 });
ticket.index({ status: 1, updatedAt: -1 });
ticket.index({ assigned: 1, status: 1, updatedAt: -1 });
ticket.index({ createdAt: 1 });
const message = new Schema(
  {
    publicId,
    ticket: String,
    sender: { type: String, enum: ['user', 'staff', 'system'] },
    kind: { type: String, enum: ['reply', 'note', 'transition'] },
    text: String,
    from: String,
    to: String,
    clientId: String,
  },
  defaults,
);
message.index({ ticket: 1, createdAt: -1, _id: -1 });
message.index(
  { ticket: 1, sender: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } },
);
const attachment = new Schema(
  {
    publicId,
    ticket: String,
    width: Number,
    height: Number,
    bytes: Number,
    expiresAt: Date,
    data: { type: Buffer, select: false },
  },
  defaults,
);
attachment.index({ ticket: 1, expiresAt: 1 });
attachment.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const challenge = new Schema(
  {
    _id: String,
    hash: { type: String, unique: true, select: false },
    email: { type: String, select: false },
    draft: { type: Schema.Types.Mixed, select: false },
    ticket: String,
    creationKey: String,
    expiresAt: Date,
    usedAt: Date,
  },
  defaults,
);
challenge.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const access = new Schema(
  { _id: String, ticket: String, expiresAt: Date },
  defaults,
);
access.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const notice = new Schema(
  {
    publicId,
    owner: String,
    type: String,
    ticket: String,
    path: String,
    readAt: Date,
    key: { type: String, unique: true },
  },
  defaults,
);
notice.index({ owner: 1, readAt: 1 });
notice.index({ owner: 1, createdAt: -1, _id: -1 });
const job = new Schema(
  {
    _id: String,
    type: String,
    owner: String,
    ticket: String,
    challenge: String,
    status: { type: String, default: 'queued' },
    attempts: { type: Number, default: 0 },
    dueAt: Date,
    leaseUntil: Date,
    claim: String,
    attemptedAt: Date,
    acceptedAt: Date,
    expiresAt: Date,
  },
  defaults,
);
job.index({ status: 1, dueAt: 1 });
job.index({ status: 1, leaseUntil: 1 });
job.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Ticket = mongoose.model('SupportTicket', ticket);
export const TicketMessage = mongoose.model('SupportMessage', message);
export const TicketAttachment = mongoose.model('SupportAttachment', attachment);
const guestRate = new Schema(
  { _id: String, count: Number, expiresAt: Date },
  { bufferCommands: false, versionKey: false },
);
guestRate.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const GuestRate = mongoose.model('SupportGuestRate', guestRate);
export const GuestChallenge = mongoose.model('SupportChallenge', challenge);
export const GuestAccess = mongoose.model('SupportGuestAccess', access);
export const Notice = mongoose.model('AccountNotification', notice);
export const SupportJob = mongoose.model('SupportEmailJob', job);
export const supportModels = [
  Ticket,
  TicketMessage,
  TicketAttachment,
  GuestChallenge,
  GuestRate,
  GuestAccess,
  Notice,
  SupportJob,
];
