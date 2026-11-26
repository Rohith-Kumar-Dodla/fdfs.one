import { can } from '../../../../shared/admin.js';
import { AppError } from '../../utils/app-error.js';
import { authorize } from '../admin/policy.js';
import { Film } from './models.js';
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
import { changeFilmStatus, createAdminFilm, editFilm } from './write.js';

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
  const filmAccess = async (req, res, next) => {
    const film = await Film.findOne({ publicId: id(res) })
      .select('classification')
      .lean();
    if (!film) throw new AppError(404, 'FILM_NOT_FOUND', 'Film not found.');
    authorize(req.auth.user, 'content', film.classification);
    next();
  };
  admin.get('/films', validate(adminList), (req, res) => {
    const input = data(res).query;
    const allowed = ['independent', 'original'].filter((module) =>
      can(req.auth.user, 'content', module),
    );
    if (
      !allowed.length ||
      (input.classification && !allowed.includes(input.classification))
    )
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission.');
    return listFilms(
      res,
      {
        ...input,
        classification:
          input.classification ??
          (allowed.length === 1 ? allowed[0] : undefined),
      },
      { admin: true },
    );
  });
  for (const [path, module] of [
    ['/films', 'original'],
    ['/cinema', 'independent'],
  ]) {
    admin.post(path, validate(adminCreate), async (req, res) => {
      authorize(req.auth.user, 'content', module);
      if (data(res).body.classification !== module)
        throw new AppError(
          400,
          'INVALID_CLASSIFICATION',
          'This form uses a different film classification.',
        );
      return sendSuccess(
        res,
        await createAdminFilm(data(res).body, context(req, res)),
        { status: 201 },
      );
    });
  }
  admin.get('/films/:id', validate(adminDetail), filmAccess, async (req, res) =>
    sendSuccess(res, await getManagedFilm(id(res))),
  );
  admin.patch('/films/:id', validate(adminEdit), filmAccess, async (req, res) =>
    sendSuccess(
      res,
      await editFilm(id(res), data(res).body, context(req, res)),
    ),
  );
  admin.post(
    '/films/:id/status',
    validate(adminStatus),
    filmAccess,
    async (req, res) =>
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
