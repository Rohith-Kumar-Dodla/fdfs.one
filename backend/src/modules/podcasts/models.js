import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { participantRoles } from '../../../../shared/podcasts.js';
import { languages } from '../../../../shared/films.js';

const { Schema } = mongoose;
const identity = {
  publicId: {
    type: String,
    unique: true,
    immutable: true,
    default: randomUUID,
  },
  slug: {
    type: String,
    required: true,
    immutable: true,
    maxlength: 90,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
  },
  createdBy: { type: String, required: true, immutable: true },
  updatedBy: { type: String, required: true },
};
const metadata = {
  timestamps: true,
  optimisticConcurrency: true,
  bufferCommands: false,
};
const image = { type: Schema.Types.ObjectId, ref: 'MediaAsset' };
const link = new Schema(
  { label: String, url: String, description: String },
  { _id: false },
);
const video = new Schema(
  {
    provider: { type: String, enum: ['youtube'] },
    providerVideoId: { type: String, match: /^[A-Za-z0-9_-]{11}$/ },
    sourceUrl: String,
    playbackType: { type: String, enum: ['on_demand'] },
    artwork: String,
    availability: {
      type: String,
      enum: ['unknown', 'available', 'unavailable'],
    },
  },
  { _id: false },
);
const chapter = new Schema(
  {
    title: { type: String, required: true },
    start: { type: Number, min: 0, required: true, validate: Number.isInteger },
    description: String,
  },
  { _id: false },
);
const show = new Schema(
  {
    ...identity,
    name: { type: String, required: true, maxlength: 120 },
    introduction: { type: String, required: true, maxlength: 280 },
    description: { type: String, required: true, maxlength: 6000 },
    cover: image,
    banner: image,
    hosts: [{ type: Schema.Types.ObjectId, ref: 'Personality' }],
    languages: [{ type: String, enum: Object.keys(languages) }],
    links: [link],
    rightsConfirmed: { type: Boolean, default: false },
  },
  metadata,
);
show.index({ slug: 1 }, { unique: true });

const episode = new Schema(
  {
    ...identity,
    show: {
      type: Schema.Types.ObjectId,
      ref: 'PodcastShow',
      required: true,
      immutable: true,
    },
    title: { type: String, required: true, maxlength: 140 },
    titlePrefixes: [String],
    commentsEnabled: { type: Boolean, default: true },
    guestName: String,
    synopsis: { type: String, maxlength: 280 },
    notes: String,
    season: {
      type: Number,
      min: 1,
      max: 999,
      required: true,
      validate: Number.isInteger,
    },
    number: {
      type: Number,
      min: 1,
      max: 9999,
      required: true,
      validate: Number.isInteger,
    },
    language: { type: String, enum: Object.keys(languages), required: true },
    topics: [String],
    duration: {
      type: Number,
      min: 1,
      max: 28800,
      required: true,
      validate: Number.isInteger,
    },
    thumbnail: image,
    gallery: [image],
    extras: [new Schema({ title: String, video }, { _id: false })],
    banner: image,
    mainVideo: video,
    teaser: video,
    chapters: [chapter],
    links: [link],
    advisory: String,
    releaseAt: Date,
    publicationAt: Date,
    announce: { type: Boolean, default: false },
    rightsConfirmed: { type: Boolean, default: false },
    rightsNotes: String,
    rightsConfirmedAt: Date,
    authorizedAt: Date,
    authorizedBy: String,
  },
  metadata,
);
episode.index({ show: 1, slug: 1 }, { unique: true });
episode.index({ show: 1, season: 1, number: 1 }, { unique: true });
episode.index({ show: 1, status: 1, publicationAt: 1, releaseAt: -1 });
episode.index({ show: 1, status: 1, titlePrefixes: 1 });
episode.index({ show: 1, status: 1, topics: 1, releaseAt: -1 });
episode.index({ show: 1, status: 1, language: 1, releaseAt: -1 });
episode.index({ show: 1, status: 1, season: 1, releaseAt: -1 });

const participant = new Schema(
  {
    episode: {
      type: Schema.Types.ObjectId,
      ref: 'PodcastEpisode',
      required: true,
    },
    personality: {
      type: Schema.Types.ObjectId,
      ref: 'Personality',
      required: true,
    },
    role: { type: String, enum: Object.keys(participantRoles), required: true },
    introduction: String,
    position: { type: Number, min: 0, required: true },
  },
  { bufferCommands: false },
);
participant.index({ episode: 1, personality: 1, role: 1 }, { unique: true });
participant.index({ personality: 1, episode: 1 });
participant.index({ episode: 1, position: 1 });

export const PodcastShow = mongoose.model('PodcastShow', show);
export const PodcastEpisode = mongoose.model('PodcastEpisode', episode);
export const EpisodeParticipant = mongoose.model(
  'EpisodeParticipant',
  participant,
);
