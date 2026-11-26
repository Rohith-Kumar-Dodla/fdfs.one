import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { sendError, sendSuccess } from '../../utils/responses.js';
import { requireRoles } from '../auth/authorization.js';
import { Personality } from '../talent/models.js';
import { MediaAsset } from '../media/assets.js';
import {
  adminCreate,
  adminDetail,
  adminEdit,
  adminList,
  adminStatus,
  publicDetail,
  publicList,
} from './schemas.js';
import { getManagedFilm, getPublicFilm, listFilms } from './read.js';
import { changeFilmStatus, createOriginal, editFilm } from './write.js';

const data = (res) => res.locals.validated;
const id = (res) => data(res).params.id;
const owner = (req) => req.auth.user.publicId;
const context = (req, res) => ({
  actorId: owner(req),
  requestId: res.get('X-Request-Id'),
});

export function publicFilmRoutes(available) {
  const routes = Router();
  routes.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!available())
      return sendError(res, {
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Films are temporarily unavailable.',
      });
    next();
  });
  routes.get('/', validate(publicList), (req, res) =>
    listFilms(res, data(res).query),
  );
  routes.get('/:slug', validate(publicDetail), async (req, res) =>
    sendSuccess(
      res,
      await getPublicFilm(
        data(res).params.slug,
        data(res).query.classification,
      ),
    ),
  );
  return routes;
}

export function mountAdminFilms(admin) {
  admin.get('/films', validate(adminList), (req, res) =>
    listFilms(res, data(res).query, { admin: true }),
  );
  admin.post('/films', validate(adminCreate), async (req, res) =>
    sendSuccess(res, await createOriginal(data(res).body, context(req, res)), {
      status: 201,
    }),
  );
  admin.get('/films/:id', validate(adminDetail), async (req, res) =>
    sendSuccess(res, await getManagedFilm(id(res))),
  );
  admin.patch('/films/:id', validate(adminEdit), async (req, res) =>
    sendSuccess(
      res,
      await editFilm(id(res), data(res).body, context(req, res)),
    ),
  );
  admin.post('/films/:id/status', validate(adminStatus), async (req, res) =>
    sendSuccess(
      res,
      await changeFilmStatus(id(res), data(res).body, context(req, res)),
    ),
  );
}

export function mountCreatorFilms(submissions, media, upload) {
  const creator = requireRoles('creator');
  submissions.get('/films', creator, validate(adminList), (req, res) =>
    listFilms(res, data(res).query, { creatorId: owner(req) }),
  );
  submissions.get(
    '/films/:id',
    creator,
    validate(adminDetail),
    async (req, res) =>
      sendSuccess(res, await getManagedFilm(id(res), owner(req))),
  );
  submissions.post('/film-images', creator, ...upload, async (req, res) =>
    sendSuccess(
      res,
      await media.uploadLibrary(
        req.auth.user,
        req.body,
        req.get('Content-Type'),
        'film',
      ),
      { status: 201 },
    ),
  );
}

export async function filmProposalDetails(record) {
  const { film, targetId } = record.filmProposal;
  const ids = [
    film.posterId,
    film.bannerId,
    ...film.galleryIds,
    ...film.extras.map((extra) => extra.thumbnailId),
  ].filter(Boolean);
  const [people, assets] = await Promise.all([
    Personality.find({
      publicId: { $in: film.credits.map((credit) => credit.personalityId) },
    })
      .select('publicId displayName')
      .lean(),
    MediaAsset.find({
      publicId: { $in: ids },
      status: 'active',
      'references.targetId': record.publicId,
    })
      .select('publicId url width height')
      .lean(),
  ]);
  return {
    targetId,
    film: {
      ...film,
      credits: film.credits.map((credit) => ({
        ...credit,
        displayName: people.find(
          (person) => person.publicId === credit.personalityId,
        )?.displayName,
      })),
    },
    images: assets.map(({ publicId, url, width, height }) => ({
      id: publicId,
      url,
      width,
      height,
    })),
  };
}
