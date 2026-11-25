import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../utils/app-error.js';
import { listInput, sendList } from '../../utils/list.js';
import { User } from '../auth/models.js';
import { recordAudit } from '../admin/audit.js';
import { normalizeImage } from './images.js';

const referenceSchema = new mongoose.Schema(
  { kind: String, targetId: String },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      unique: true,
      immutable: true,
      default: randomUUID,
    },
    providerId: { type: String, unique: true, immutable: true, required: true },
    providerAssetId: String,
    owner: { type: String, required: true, immutable: true },
    purpose: {
      type: String,
      required: true,
      enum: ['library', 'profile', 'talent'],
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['staged', 'active', 'deleting'],
    },
    url: String,
    width: Number,
    height: Number,
    bytes: Number,
    references: { type: [referenceSchema], default: [] },
  },
  { timestamps: true, bufferCommands: false },
);
schema.index({ status: 1, createdAt: -1 });
schema.index({ owner: 1, createdAt: -1 });
export const MediaAsset = mongoose.model('MediaAsset', schema);
export const mediaListInput = listInput();

const providerError = () =>
  new AppError(
    502,
    'MEDIA_PROVIDER_FAILURE',
    'The image provider could not complete the request.',
  );
const unavailable = () =>
  new AppError(503, 'MEDIA_UNAVAILABLE', 'Image operations are unavailable.');
const missing = () => new AppError(404, 'MEDIA_NOT_FOUND', 'Image not found.');
const inUse = () =>
  new AppError(
    409,
    'MEDIA_IN_USE',
    'Remove all active references before changing this image.',
  );
const noReferences = { 'references.0': { $exists: false } };

export function imageView({
  publicId,
  purpose,
  url,
  width,
  height,
  bytes,
  references,
  createdAt,
}) {
  const variants = [320, 640, 1280]
    .filter((size) => size < width)
    .map((size) => ({
      width: size,
      url: url.replace(
        '/image/upload/',
        `/image/upload/c_limit,w_${size},f_auto,q_auto/`,
      ),
    }));
  variants.push({ width, url });
  return {
    id: publicId,
    purpose,
    url,
    variants,
    width,
    height,
    bytes,
    references: references.length,
    createdAt,
  };
}

export function listMedia(res, query) {
  return sendList(res, MediaAsset, { status: 'active' }, query, imageView);
}

export function attachReference(assetId, reference, session) {
  return MediaAsset.updateOne(
    { _id: assetId, status: 'active' },
    { $addToSet: { references: reference } },
    { session },
  );
}

export function releaseReference(assetId, reference, session) {
  return MediaAsset.updateOne(
    { _id: assetId, status: 'active' },
    { $pull: { references: reference } },
    { session },
  );
}

export function createMediaService(provider, logger) {
  async function stage(owner, purpose, bytes, type) {
    if (!provider) throw unavailable();
    const image = await normalizeImage(bytes, type);
    const publicId = randomUUID();
    const asset = await MediaAsset.create({
      publicId,
      providerId: `fdfs/${purpose}/${publicId}`,
      owner,
      purpose,
      status: 'staged',
      width: image.width,
      height: image.height,
      bytes: image.bytes,
    });
    let uploaded;
    try {
      uploaded = await provider.upload(asset.providerId, image.data);
    } catch {
      logger.warn(
        'Image upload did not complete; staged asset retained for cleanup.',
      );
      throw providerError();
    }
    asset.url = uploaded.url;
    asset.providerAssetId = uploaded.assetId;
    await asset.save();
    return asset;
  }

  async function cleanup(assetId) {
    if (!provider) throw unavailable();
    const asset = await MediaAsset.findOne({
      _id: assetId,
      status: 'deleting',
      ...noReferences,
    });
    if (!asset) return;
    try {
      await provider.remove(asset.providerId);
    } catch {
      logger.warn('Image cleanup remains pending.');
      throw providerError();
    }
    await MediaAsset.deleteOne({
      _id: assetId,
      status: 'deleting',
      ...noReferences,
    });
  }

  async function tryCleanup(assetId) {
    try {
      if (assetId) await cleanup(assetId);
    } catch {
      // The deleting record retains the provider ID for the retry command.
      logger.warn('Pending image retained for cleanup retry.');
    }
  }

  async function claimImage(id, session) {
    const claimed = await MediaAsset.findOneAndUpdate(
      { publicId: id, status: 'active', ...noReferences },
      { $set: { status: 'deleting' } },
      { session },
    );
    if (claimed) return claimed;
    if (
      await MediaAsset.exists({ publicId: id, status: 'active' }).session(
        session,
      )
    )
      throw inUse();
    throw missing();
  }

  return {
    async uploadLibrary(user, bytes, type, purpose = 'library') {
      const asset = await stage(user.publicId, purpose, bytes, type);
      const active = await MediaAsset.findOneAndUpdate(
        { _id: asset._id, status: 'staged' },
        { $set: { status: 'active' } },
        { returnDocument: 'after' },
      );
      if (!active) throw providerError();
      return imageView(active);
    },

    async getProfile(user) {
      if (!user.profileImage) return null;
      const asset = await MediaAsset.findOne({
        _id: user.profileImage,
        status: 'active',
        owner: user.publicId,
        purpose: 'profile',
      });
      return asset ? imageView(asset) : null;
    },

    async replaceProfile(user, bytes, type) {
      const asset = await stage(user.publicId, 'profile', bytes, type);
      const reference = { kind: 'user-avatar', targetId: user.publicId };
      const { next, retired } = await mongoose.connection.transaction(
        async (session) => {
          const previous = await User.findOneAndUpdate(
            {
              _id: user._id,
              status: 'active',
              authVersion: user.authVersion,
              emailVerifiedAt: { $type: 'date' },
            },
            { $set: { profileImage: asset._id } },
            { session },
          );
          if (!previous)
            throw new AppError(
              403,
              'ACCOUNT_INELIGIBLE',
              'A verified active account is required.',
            );
          const next = await MediaAsset.findOneAndUpdate(
            { _id: asset._id, status: 'staged' },
            { $set: { status: 'active', references: [reference] } },
            { session, returnDocument: 'after' },
          );
          if (!next) throw providerError();
          if (!previous.profileImage) return { next };
          await releaseReference(previous.profileImage, reference, session);
          const retired = await MediaAsset.findOneAndUpdate(
            {
              _id: previous.profileImage,
              owner: user.publicId,
              purpose: 'profile',
              status: 'active',
              ...noReferences,
            },
            { $set: { status: 'deleting' } },
            { session },
          );
          return { next, retired };
        },
      );
      await tryCleanup(retired?._id);
      return imageView(next);
    },

    async replaceLibrary(user, id, context, bytes, type) {
      const current = await MediaAsset.findOne({
        publicId: id,
        status: 'active',
      });
      if (!current) throw missing();
      if (current.references.length) throw inUse();
      const asset = await stage(user.publicId, 'library', bytes, type);
      const { next, retired } = await mongoose.connection.transaction(
        async (session) => {
          const retired = await claimImage(id, session);
          const next = await MediaAsset.findOneAndUpdate(
            { _id: asset._id, status: 'staged' },
            { $set: { status: 'active' } },
            { session, returnDocument: 'after' },
          );
          if (!next) throw providerError();
          await recordAudit(session, context, 'media.replace', 'media', id, {
            field: 'asset',
            from: id,
            to: next.publicId,
          });
          return { next, retired };
        },
      );
      await tryCleanup(retired._id);
      return imageView(next);
    },

    async deleteLibrary(id, context) {
      if (!provider) throw unavailable();
      const retired = await mongoose.connection.transaction(async (session) => {
        const asset = await claimImage(id, session);
        await recordAudit(session, context, 'media.delete', 'media', id, {
          field: 'asset',
          to: 'deletion-requested',
        });
        return asset;
      });
      await tryCleanup(retired._id);
      return { deleted: !(await MediaAsset.exists({ _id: retired._id })) };
    },

    async cleanupBatch() {
      if (!provider) throw unavailable();
      await MediaAsset.updateMany(
        {
          status: 'staged',
          createdAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) },
          ...noReferences,
        },
        { $set: { status: 'deleting' } },
      );
      const assets = await MediaAsset.find({
        status: 'deleting',
        ...noReferences,
      })
        .sort({ createdAt: 1 })
        .limit(100);
      let completed = 0;
      for (const asset of assets) {
        try {
          await cleanup(asset._id);
          completed++;
        } catch {
          // Leave the record in the next batch.
        }
      }
      return { attempted: assets.length, completed };
    },
  };
}
