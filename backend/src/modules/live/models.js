import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { broadcasts, eventCategories } from '../../../../shared/live.js';
import { languages } from '../../../../shared/films.js';
const { Schema } = mongoose;
const media = { type: Schema.Types.ObjectId, ref: 'MediaAsset' };
const video = new Schema(
  {
    provider: { type: String, enum: ['youtube'], required: true },
    providerVideoId: {
      type: String,
      required: true,
      match: /^[A-Za-z0-9_-]{11}$/,
    },
    sourceUrl: { type: String, required: true },
    playbackType: {
      type: String,
      enum: ['scheduled_live', 'live', 'replay'],
      required: true,
    },
    artwork: String,
    availability: {
      type: String,
      enum: ['unknown', 'available', 'unavailable'],
      default: 'unknown',
    },
  },
  { _id: false },
);
const schema = new Schema(
  {
    publicId: {
      type: String,
      unique: true,
      immutable: true,
      default: randomUUID,
    },
    slug: {
      type: String,
      unique: true,
      immutable: true,
      required: true,
      maxlength: 90,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    title: { type: String, required: true, maxlength: 140 },
    summary: { type: String, required: true, maxlength: 280 },
    description: { type: String, required: true, maxlength: 6000 },
    category: {
      type: String,
      enum: Object.keys(eventCategories),
      required: true,
    },
    language: { type: String, enum: Object.keys(languages), required: true },
    topic: String,
    venue: String,
    organizer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    talent: [{ type: Schema.Types.ObjectId, ref: 'Personality' }],
    providerArtworkApproved: Boolean,
    poster: media,
    banner: media,
    replayThumbnail: media,
    startAt: { type: Date, required: true },
    endAt: Date,
    timeZone: { type: String, required: true },
    publicationAt: Date,
    actualStartAt: Date,
    actualEndAt: Date,
    video,
    replay: video,
    plannedReplayUrl: String,
    rightsConfirmed: { type: Boolean, default: false },
    rightsNotes: String,
    rightsConfirmedAt: Date,
    replayApprovedAt: Date,
    replayApprovedBy: String,
    moderation: {
      type: String,
      enum: ['pending', 'approved'],
      default: 'pending',
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    broadcast: { type: String, enum: broadcasts, default: 'scheduled' },
    reminderSequence: { type: Number, default: 0 },
    chatSequence: { type: Number, default: 0 },
    chatEnabled: { type: Boolean, default: true },
    slowSeconds: { type: Number, min: 0, max: 120, default: 0 },
    remindersEnabled: { type: Boolean, default: true },
    scheduleVersion: { type: Number, default: 0 },
    submission: {
      type: Schema.Types.ObjectId,
      ref: 'Submission',
      immutable: true,
      unique: true,
      sparse: true,
    },
    createdBy: { type: String, required: true, immutable: true },
    updatedBy: { type: String, required: true },
    approvedBy: String,
    approvedAt: Date,
  },
  { timestamps: true, optimisticConcurrency: true, bufferCommands: false },
);
schema.index({ status: 1, broadcast: 1, startAt: 1, _id: 1 });
schema.index({ status: 1, category: 1, startAt: 1 });
schema.index({ status: 1, title: 1, _id: 1 });

schema.index({ organizer: 1, startAt: -1 });
schema.index({ moderation: 1, startAt: 1 });
export const LiveEvent = mongoose.model('LiveEvent', schema);
