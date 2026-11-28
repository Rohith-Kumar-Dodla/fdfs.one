import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { contentModules, staffRoles } from '../../../../shared/admin.js';

const { Schema } = mongoose;
export const roles = ['viewer', 'creator', 'organizer', ...staffRoles];

const challenge = new Schema(
  {
    hash: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    publicId: {
      type: String,
      unique: true,
      immutable: true,
      default: randomUUID,
    },
    fullName: { type: String, required: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true, select: false },
    roles: { type: [{ type: String, enum: roles }], default: ['viewer'] },
    cmsModules: { type: [{ type: String, enum: contentModules }], default: [] },
    superSeed: { type: Boolean, select: false },
    policyVersion: { type: Number, select: false },
    emailVerifiedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['active', 'suspended', 'deleted'],
      default: 'active',
    },
    profileImage: {
      type: Schema.Types.ObjectId,
      ref: 'MediaAsset',
      default: null,
    },
    bio: { type: String, maxlength: 500, default: '' },
    preferences: { emailUpdates: { type: Boolean, default: false } },
    welcomePresentedAt: Date,
    welcomeAcknowledgedAt: Date,
    authVersion: { type: Number, default: 0, select: false },
    verification: { type: challenge, select: false },
    emailVerification: {
      type: new Schema(
        {
          requests: [Date],
          requestId: String,
          delivery: { type: String, enum: ['pending', 'accepted', 'failed'] },
          code: new Schema(
            {
              id: String,
              digest: String,
              expiresAt: Date,
              attempts: Number,
            },
            { _id: false },
          ),
        },
        { _id: false },
      ),
      select: false,
    },
    passwordReset: { type: challenge, select: false },
    bootstrapAdmin: { type: Boolean, select: false },
  },
  { timestamps: true, bufferCommands: false },
);

userSchema.index({ 'verification.hash': 1 }, { unique: true, sparse: true });
userSchema.index({ 'passwordReset.hash': 1 }, { unique: true, sparse: true });
userSchema.index(
  { bootstrapAdmin: 1 },
  { unique: true, partialFilterExpression: { bootstrapAdmin: true } },
);

userSchema.index(
  { superSeed: 1 },
  { unique: true, partialFilterExpression: { superSeed: true } },
);
userSchema.index({ roles: 1, status: 1 });
userSchema.index({ emailVerifiedAt: 1 });

const usedToken = new Schema(
  {
    hash: { type: String, required: true },
    usedAt: { type: Date, required: true },
  },
  { _id: false },
);

const sessionSchema = new Schema(
  {
    publicId: {
      type: String,
      unique: true,
      immutable: true,
      default: randomUUID,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    authVersion: { type: Number, required: true, immutable: true },
    refreshHash: { type: String, required: true, select: false },
    used: { type: [usedToken], select: false },
    userAgent: { type: String, maxlength: 240, default: '' },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, bufferCommands: false },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({
  userId: 1,
  authVersion: 1,
  revokedAt: 1,
  lastSeenAt: -1,
});

export const User = mongoose.model('User', userSchema);
export const Session = mongoose.model('Session', sessionSchema);

export async function initializeAuthIndexes() {
  await Promise.all([User.createIndexes(), Session.createIndexes()]);
}
