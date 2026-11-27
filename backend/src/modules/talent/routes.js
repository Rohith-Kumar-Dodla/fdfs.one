import { Personality, normalizedName } from './models.js';
import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { idParams } from '../../utils/list.js';
import { sendError, sendSuccess } from '../../utils/responses.js';
import {
  readTalentCredits,
  saveTalentCredits,
  talentCredits,
  writeTalentCredits,
} from './credits.js';
import { z } from 'zod';
import {
  adminCreateInput,
  adminEditInput,
  adminListInput,
  adminStatusInput,
  associationInput,
  directoryInput,
  slugInput,
} from './schemas.js';
import {
  associateTalent,
  changeTalentStatus,
  createTalent,
  getAdminTalent,
  getPublicTalent,
  listTalent,
  updateTalent,
} from './service.js';

const data = (res) => res.locals.validated;
const id = (res) => data(res).params.id;
const context = (req, res) => ({
  actorId: req.auth.user.publicId,
  requestId: res.get('X-Request-Id'),
});

export function publicTalentRoutes(available) {
  const router = Router();
  router.use((req, res, next) => {
    if (!available())
      return sendError(res, {
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Talent profiles are temporarily unavailable.',
      });
    next();
  });
  router.get('/', validate(directoryInput), (req, res) =>
    listTalent(res, data(res).query),
  );
  router.get('/:slug', validate(slugInput), async (req, res) =>
    sendSuccess(res, await getPublicTalent(data(res).params.slug)),
  );
  return router;
}

export function mountAdminTalent(admin) {
  const credits = '/talent/:id/credits/:module/:target';
  admin.get(credits, validate(readTalentCredits), async (req, res) =>
    sendSuccess(res, await talentCredits(data(res).params, req.auth.user)),
  );
  admin.put(credits, validate(writeTalentCredits), async (req, res) =>
    sendSuccess(
      res,
      await saveTalentCredits(
        data(res).params,
        data(res).body,
        req.auth.user,
        context(req, res),
      ),
    ),
  );
  admin.get(
    '/talent/duplicates',
    validate(
      z.object({
        query: z.object({ name: z.string().trim().min(3).max(100) }),
      }),
    ),
    async (_req, res) => {
      const name = normalizedName(data(res).query.name);
      const matches = await Personality.find({
        searchNames: name,
        status: { $ne: 'archived' },
      })
        .select('publicId displayName status')
        .limit(6)
        .lean();
      sendSuccess(
        res,
        matches.map(({ publicId, displayName, status }) => ({
          id: publicId,
          displayName,
          status,
        })),
      );
    },
  );
  admin.get('/talent', validate(adminListInput), (req, res) =>
    listTalent(res, data(res).query, true),
  );
  admin.post('/talent', validate(adminCreateInput), async (req, res) =>
    sendSuccess(res, await createTalent(data(res).body, context(req, res)), {
      status: 201,
    }),
  );
  admin.get(
    '/talent/:id',
    validate(z.object({ params: idParams })),
    async (req, res) => sendSuccess(res, await getAdminTalent(id(res))),
  );
  admin.patch('/talent/:id', validate(adminEditInput), async (req, res) =>
    sendSuccess(
      res,
      await updateTalent(id(res), data(res).body, context(req, res)),
    ),
  );
  admin.post(
    '/talent/:id/status',
    validate(adminStatusInput),
    async (req, res) =>
      sendSuccess(
        res,
        await changeTalentStatus(id(res), data(res).body, context(req, res)),
      ),
  );
  admin.put(
    '/talent/:id/association',
    validate(associationInput),
    async (req, res) =>
      sendSuccess(
        res,
        await associateTalent(id(res), data(res).body, context(req, res)),
      ),
  );
}
