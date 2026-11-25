import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { linkKinds, professions } from '../../../../shared/talent.js';

const { Schema } = mongoose;
export function normalizedName(name) {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const link = new Schema(
  {
    kind: { type: String, enum: Object.keys(linkKinds), required: true },
    label: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false },
);
const image = { type: Schema.Types.ObjectId, ref: 'MediaAsset' };
const personalitySchema = new Schema(
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
    displayName: { type: String, required: true, maxlength: 100 },
    alternativeName: { type: String, maxlength: 100 },
    sortName: { type: String, required: true },
    searchNames: [String],
    introduction: { type: String, required: true, maxlength: 240 },
    biography: { type: String, maxlength: 5000 },
    professions: {
      type: [{ type: String, enum: Object.keys(professions) }],
      validate: (roles) =>
        roles.length > 0 && new Set(roles).size === roles.length,
    },
    location: { type: String, maxlength: 100 },
    profileImage: image,
    coverImage: image,
    website: String,
    links: [link],
    associatedUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      sparse: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    createdBy: { type: String, required: true, immutable: true },
    updatedBy: { type: String, required: true },
    publishedAt: Date,
    archivedAt: Date,
  },
  { timestamps: true, bufferCommands: false, optimisticConcurrency: true },
);

personalitySchema.index({ status: 1, sortName: 1, _id: 1 });
personalitySchema.index({ status: 1, professions: 1, sortName: 1 });
personalitySchema.index({ status: 1, searchNames: 1 });
personalitySchema.index({ status: 1, publishedAt: -1, _id: -1 });
personalitySchema.index({ status: 1, updatedAt: -1, _id: -1 });

const achievementSchema = new Schema(
  {
    personality: {
      type: Schema.Types.ObjectId,
      ref: 'Personality',
      required: true,
      immutable: true,
    },
    position: { type: Number, required: true, min: 0 },
    title: { type: String, required: true, maxlength: 120 },
    organization: { type: String, maxlength: 120 },
    year: { type: Number, min: 1800, max: 2100 },
    description: { type: String, maxlength: 600 },
    source: String,
  },
  { timestamps: true, bufferCommands: false },
);
achievementSchema.index({ personality: 1, position: 1 }, { unique: true });
achievementSchema.index({ personality: 1, year: -1 });

export const Personality = mongoose.model('Personality', personalitySchema);
export const Achievement = mongoose.model('Achievement', achievementSchema);

export async function initializeTalentIndexes() {
  await Promise.all([Personality.createIndexes(), Achievement.createIndexes()]);
}
