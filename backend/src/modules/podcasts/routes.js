import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { sendError, sendSuccess } from '../../utils/responses.js';
import {
  EpisodeComment,
  CommentReport,
  mountPodcastComments,
} from './comments.js';
import { PodcastShow, PodcastEpisode, EpisodeParticipant } from './models.js';
import { getEpisode, getShow, listEpisodes, missingShow } from './read.js';
import {
  adminEpisodeList,
  adminId,
  createEpisodeInput,
  editEpisodeInput,
  episodeList,
  publishEpisodeInput,
  saveShowInput,
  showStatusInput,
  slugInput,
} from './schemas.js';
import {
  changeEpisode,
  changeShow,
  createEpisode,
  editEpisode,
  saveShow,
} from './write.js';

const data = (res) => res.locals.validated;
const id = (res) => data(res).params.id;
const context = (req, res) => ({
  actorId: req.auth.user.publicId,
  requestId: res.get('X-Request-Id'),
});
export function initializePodcastIndexes() {
  return Promise.all(
    [
      PodcastShow,
      PodcastEpisode,
      EpisodeParticipant,
      EpisodeComment,
      CommentReport,
    ].map((model) => model.createIndexes()),
  );
}

export function publicPodcastRoutes(available) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!available())
      return sendError(res, {
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Podcasts are temporarily unavailable.',
      });
    next();
  });
  router.get('/', async (req, res) => sendSuccess(res, await getShow(true)));
  router.get('/shows/:slug', validate(slugInput), async (req, res) => {
    const show = await getShow(true, data(res).params.slug);
    if (!show) throw missingShow();
    return sendSuccess(res, show);
  });
  router.get('/episodes', validate(episodeList), (req, res) =>
    listEpisodes(res, data(res).query),
  );
  router.get('/episodes/:slug', validate(slugInput), async (req, res) =>
    sendSuccess(res, await getEpisode(data(res).params.slug)),
  );
  return router;
}

export function mountPodcastManagement(api, admin, authenticate) {
  const path = '/podcasts';
  admin.get(path + '/show', async (req, res) =>
    sendSuccess(res, await getShow(false)),
  );
  admin.put(path + '/show', validate(saveShowInput), async (req, res) =>
    sendSuccess(res, await saveShow(data(res).body, context(req, res))),
  );
  admin.post(
    path + '/show/status',
    validate(showStatusInput),
    async (req, res) =>
      sendSuccess(res, await changeShow(data(res).body, context(req, res))),
  );
  admin.get(path + '/episodes', validate(adminEpisodeList), (req, res) =>
    listEpisodes(res, data(res).query, true),
  );
  admin.get(path + '/episodes/:id', validate(adminId), async (req, res) =>
    sendSuccess(res, await getEpisode(id(res), true)),
  );
  admin.post(
    path + '/episodes',
    validate(createEpisodeInput),
    async (req, res) =>
      sendSuccess(res, await createEpisode(data(res).body, context(req, res)), {
        status: 201,
      }),
  );
  admin.patch(
    path + '/episodes/:id',
    validate(editEpisodeInput),
    async (req, res) =>
      sendSuccess(
        res,
        await editEpisode(id(res), data(res).body, context(req, res)),
      ),
  );
  admin.post(
    path + '/episodes/:id/status',
    validate(publishEpisodeInput),
    async (req, res) =>
      sendSuccess(
        res,
        await changeEpisode(id(res), data(res).body, context(req, res)),
      ),
  );
  mountPodcastComments(api, admin, authenticate);
}
