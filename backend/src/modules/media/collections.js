import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { can } from '../../../../shared/admin.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/app-error.js';
import {
  idParams,
  listInput,
  publicId,
  searchPattern,
  sendList,
} from '../../utils/list.js';
import { sendSuccess } from '../../utils/responses.js';
import { authorize } from '../admin/policy.js';
import { recordAudit } from '../admin/audit.js';
import {
  MediaAsset,
  attachReference,
  releaseReference,
  imageView,
} from './assets.js';

const modules = {
  movies: ['movies'],
  films: ['independent', 'original'],
  podcasts: ['podcasts'],
};
const category = z.enum(Object.keys(modules));
const schema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      default: randomUUID,
      unique: true,
      immutable: true,
    },
    category: { type: String, required: true, immutable: true },
    title: { type: String, required: true },
    titleKey: { type: String, required: true },
    owner: { type: String, required: true, immutable: true },
    images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }],
  },
  { timestamps: true, optimisticConcurrency: true, bufferCommands: false },
);
schema.index({ category: 1, titleKey: 1 });
export const MediaCollection = mongoose.model('MediaCollection', schema);
const list = listInput({
  category,
  q: z.string().trim().min(1).max(100).optional(),
});
const fields = {
  title: z.string().trim().min(1).max(100),
  imageIds: z
    .array(publicId)
    .min(1)
    .max(24)
    .refine((ids) => new Set(ids).size === ids.length),
};
const create = z.object({
  body: z.strictObject({ ...fields, category, id: publicId }),
});
const edit = z.object({
  params: idParams,
  body: z.strictObject({ ...fields, revision: z.number().int().nonnegative() }),
});
const normalizedTitle = (title) =>
  title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const missing = () =>
  new AppError(
    404,
    'MEDIA_COLLECTION_NOT_FOUND',
    'Image collection not found.',
  );
const stale = () =>
  new AppError(
    409,
    'MEDIA_COLLECTION_CHANGED',
    'The image collection changed. Reload and try again.',
  );

function permission(actor, category) {
  authorize(actor, 'media');
  if (!modules[category].some((module) => can(actor, 'content', module)))
    throw new AppError(
      403,
      'FORBIDDEN',
      'You do not have permission for this artwork category.',
    );
}

function view(row) {
  const images = row.images.filter(
    (item) => item.status === 'active' && item.url,
  );
  const references = images.flatMap((image) =>
    image.references.filter(({ kind }) =>
      ['movie', 'film', 'podcast-episode'].includes(kind),
    ),
  );
  return {
    id: row.publicId,
    category: row.category,
    title: row.title,
    revision: row.__v,
    images: images.map(imageView),
    associations: [
      ...new Map(
        references.map((ref) => [ref.kind + ':' + ref.targetId, ref]),
      ).values(),
    ],
  };
}

async function save(input, actor, audit, id) {
  const publicId = id ?? input.id;
  await mongoose.connection
    .transaction(async (session) => {
      const previous = await MediaCollection.findOne({ publicId }).session(
        session,
      );
      if (id && !previous) throw missing();
      const group = previous?.category ?? input.category;
      permission(actor, group);
      if (!id && previous) {
        if (previous.owner !== actor.publicId || group !== input.category)
          throw stale();
        return;
      }
      if (id && previous.__v !== input.revision) throw stale();
      const images = await MediaAsset.find({
        publicId: { $in: input.imageIds },
        status: 'active',
        purpose: 'library',
      }).session(session);
      if (images.length !== input.imageIds.length)
        throw new AppError(
          400,
          'MEDIA_COLLECTION_IMAGE_INVALID',
          'Select available library images.',
        );
      const row =
        previous ??
        new MediaCollection({
          publicId,
          category: group,
          owner: actor.publicId,
        });
      const existing = new Set(row.images.map(String));
      const imageMap = new Map(
        images.map((image) => [image.publicId, image._id]),
      );
      const next = input.imageIds.map((key) => imageMap.get(key));
      const selected = new Set(next.map(String));
      const ref = { kind: 'media-collection', targetId: publicId };
      for (const key of selected.difference(existing)) {
        if (!(await attachReference(key, ref, session)).matchedCount)
          throw stale();
      }
      for (const key of existing.difference(selected))
        await releaseReference(key, ref, session);
      row.set({
        title: input.title,
        titleKey: normalizedTitle(input.title),
        images: next,
      });
      await row.save({ session });
      await recordAudit(
        session,
        audit,
        id ? 'media.collection_edit' : 'media.collection_create',
        'media',
        publicId,
        { field: 'asset', to: group },
      );
    })
    .catch((error) => {
      if (error.code === 11000 || error.name === 'VersionError') throw stale();
      throw error;
    });
  return view(
    await MediaCollection.findOne({ publicId }).populate('images').lean(),
  );
}

export function mountMediaCollections(admin, context) {
  const path = '/media-collections';
  admin.get(path, validate(list), (req, res) => {
    const query = res.locals.validated.query;
    permission(req.auth.user, query.category);
    return sendList(
      res,
      MediaCollection,
      {
        category: query.category,
        ...(query.q && { titleKey: searchPattern(normalizedTitle(query.q)) }),
      },
      query,
      view,
      undefined,
      { updatedAt: -1, _id: -1 },
      (find) => find.populate('images'),
    );
  });
  admin.post(path, validate(create), async (req, res) =>
    sendSuccess(
      res,
      await save(res.locals.validated.body, req.auth.user, context(req, res)),
      { status: 201 },
    ),
  );
  admin.patch(path + '/:id', validate(edit), async (req, res) =>
    sendSuccess(
      res,
      await save(
        res.locals.validated.body,
        req.auth.user,
        context(req, res),
        res.locals.validated.params.id,
      ),
    ),
  );
}
