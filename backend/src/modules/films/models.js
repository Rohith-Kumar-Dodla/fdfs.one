import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { genres, languages } from '../../../../shared/films.js';
import { professions } from '../../../../shared/talent.js';

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
    playbackType: { type: String, enum: ['on_demand'], required: true },
    availability: {
      type: String,
      enum: ['unknown', 'available', 'unavailable'],
      default: 'unknown',
    },
  },
  { _id: false },
);

const extra = new Schema(
  { title: String, video, thumbnail: media },
  { _id: false },
);
const award = new Schema(
  { title: String, organization: String, year: Number, source: String },
  { _id: false },
);
const filmSchema = new Schema(
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
    classification: {
      type: String,
      enum: ['independent', 'original'],
      immutable: true,
      required: true,
    },
    title: { type: String, required: true, maxlength: 140 },
    titleKey: { type: String, required: true },
    titlePrefixes: [String],
    synopsis: { type: String, required: true, maxlength: 280 },
    description: { type: String, maxlength: 6000 },
    genres: {
      type: [{ type: String, enum: Object.keys(genres) }],
      validate: (items) =>
        items.length > 0 && new Set(items).size === items.length,
    },
    language: { type: String, enum: Object.keys(languages), required: true },
    subtitles: [{ type: String, enum: Object.keys(languages) }],
    runtimeMinutes: {
      type: Number,
      min: 1,
      max: 300,
      required: true,
      validate: Number.isInteger,
    },
    releaseYear: {
      type: Number,
      min: 1888,
      max: 2100,
      required: true,
      validate: Number.isInteger,
    },
    productionCompany: String,
    advisory: String,
    poster: media,
    banner: media,
    gallery: [media],
    mainVideo: video,
    trailer: video,
    extras: [extra],
    awards: [award],
    creatorId: { type: String, immutable: true },
    submission: {
      type: Schema.Types.ObjectId,
      ref: 'Submission',
      immutable: true,
      unique: true,
      sparse: true,
    },
    rightsConfirmed: { type: Boolean, default: false },
    rightsNotes: String,
    rightsConfirmedBy: String,
    rightsConfirmedAt: Date,
    authorizedBy: String,
    authorizedAt: Date,
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    releaseAt: Date,
    announce: { type: Boolean, default: false },
    engagementFence: { type: Number, select: false },
    createdBy: { type: String, immutable: true, required: true },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true, optimisticConcurrency: true, bufferCommands: false },
);

filmSchema.index({ classification: 1, status: 1, releaseAt: -1, _id: -1 });
filmSchema.index({ classification: 1, status: 1, titleKey: 1, _id: 1 });
filmSchema.index({ classification: 1, status: 1, releaseYear: -1 });
filmSchema.index({ status: 1, titlePrefixes: 1 });
filmSchema.index({ classification: 1, status: 1, genres: 1 });
filmSchema.index({ classification: 1, status: 1, language: 1 });
filmSchema.index({ creatorId: 1, updatedAt: -1 });

const creditSchema = new Schema(
  {
    film: { type: Schema.Types.ObjectId, ref: 'Film', required: true },
    personality: {
      type: Schema.Types.ObjectId,
      ref: 'Personality',
      required: true,
    },
    role: { type: String, enum: Object.keys(professions), required: true },
    character: String,
    characterKey: { type: String, default: '' },
    department: String,
    position: { type: Number, min: 0, required: true },
  },
  { bufferCommands: false },
);
creditSchema.index(
  { film: 1, personality: 1, role: 1, characterKey: 1 },
  { unique: true },
);
creditSchema.index({ personality: 1, film: 1 });
creditSchema.index({ film: 1, position: 1 });

export const Film = mongoose.model('Film', filmSchema);
export const FilmCredit = mongoose.model('FilmCredit', creditSchema);
export const initializeFilmIndexes = () =>
  Promise.all([Film.createIndexes(), FilmCredit.createIndexes()]);
