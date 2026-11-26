import { Router } from 'express';
import { z } from 'zod';
import { mountPodcastManagement } from '../podcasts/routes.js';
import { validate } from '../../middlewares/validate.js';
import { idParams } from '../../utils/list.js';
import { sendError, sendSuccess } from '../../utils/responses.js';
import {
  requireActiveAccount,
  requireAuthentication,
  requireRoles,
  requireVerifiedEmail,
} from '../auth/authorization.js';
import { User } from '../auth/models.js';
import { createSessionService } from '../auth/sessions.js';
import {
  createMediaService,
  listMedia,
  MediaAsset,
  mediaListInput,
} from '../media/assets.js';
import { readImage, uploadRateLimit } from '../media/images.js';
import { mountAdminTalent } from '../talent/routes.js';
import { getProposalImages, publishTalent } from '../talent/service.js';
import {
  filmProposalDetails,
  mountAdminFilms,
  mountCreatorFilms,
} from '../films/routes.js';
import { releaseInput } from '../films/schemas.js';
import { publishIndependent } from '../films/write.js';
import {
  createSubmission,
  editSubmissionInput,
  getSubmission,
  listSubmissions,
  moderateSubmission,
  moderationInput,
  newSubmissionInput,
  publishSubmission,
  Submission,
  submissionInput,
  submissionListInput,
  submissionView,
  updateOwnSubmission,
} from '../submissions/workflow.js';
import { AuditLog, auditListInput, listAudit } from './audit.js';
import {
  getUser,
  listUsers,
  modifyUser,
  roleInput,
  statusInput,
  userInput,
  usersInput,
} from './users.js';

const query = (res) => res.locals.validated.query;
const body = (res) => res.locals.validated.body;
const id = (res) => res.locals.validated.params.id;
const user = (req) => req.auth.user;
async function details(record) {
  return {
    ...submissionView(record, true),
    ...(record.proposal && { proposalImages: await getProposalImages(record) }),
    ...(record.filmProposal && {
      filmProposal: await filmProposalDetails(record),
    }),
  };
}
const context = (req, res) => ({
  actorId: user(req).publicId,
  requestId: res.get('X-Request-Id'),
});
const emptyBody = z.strictObject({}).optional();
const resourceAction = z.object({ params: idParams, body: emptyBody });
const publishInput = z.object({
  params: idParams,
  body: z.strictObject({ release: releaseInput.optional() }).optional(),
});

export async function initializePhase22Indexes() {
  await Promise.all(
    [AuditLog, Submission, MediaAsset].map((model) => model.createIndexes()),
  );
}

export function mountPhase22(
  api,
  authConfig,
  logger,
  { available, mediaProvider, publishers } = {},
) {
  const admin = Router();
  const submissions = Router();
  const profileImage = Router();
  const authenticate = requireAuthentication(createSessionService(authConfig));
  const media = createMediaService(mediaProvider, logger);
  const upload = [uploadRateLimit(), readImage];
  for (const router of [admin, submissions, profileImage]) {
    router.use(
      (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        if (available && !available()) {
          return sendError(res, {
            status: 503,
            code: 'DEPENDENCY_UNAVAILABLE',
            message: 'This service is temporarily unavailable.',
          });
        }
        next();
      },
      authenticate,
      requireActiveAccount,
      requireVerifiedEmail,
    );
  }

  admin.use(requireRoles('admin'));
  mountPodcastManagement(api, admin, authenticate);
  mountAdminFilms(admin);
  mountAdminTalent(admin);
  admin.get('/overview', async (req, res) => {
    const [users, reviewQueue, images, auditEvents] = await Promise.all([
      User.countDocuments(),
      Submission.countDocuments({
        status: { $in: ['submitted', 'under_review'] },
      }),
      MediaAsset.countDocuments({ status: 'active' }),
      AuditLog.countDocuments(),
    ]);
    return sendSuccess(res, { users, reviewQueue, images, auditEvents });
  });
  admin.get('/users', validate(usersInput), (req, res) =>
    listUsers(res, query(res)),
  );
  admin.get('/users/:id', validate(userInput), async (req, res) =>
    sendSuccess(res, await getUser(id(res))),
  );
  for (const [path, input, operation] of [
    ['role', roleInput, 'role'],
    ['status', statusInput, 'status'],
    ['revoke-sessions', resourceAction, 'sessions'],
  ]) {
    admin[operation === 'sessions' ? 'post' : 'patch'](
      '/users/:id/' + path,
      validate(input),
      async (req, res) =>
        sendSuccess(
          res,
          await modifyUser(id(res), context(req, res), operation, body(res)),
        ),
    );
  }
  admin.get('/audit', validate(auditListInput), (req, res) =>
    listAudit(res, query(res)),
  );

  submissions.get('/', validate(submissionListInput), (req, res) =>
    listSubmissions(res, query(res), user(req).publicId),
  );
  mountCreatorFilms(submissions, media, upload);
  submissions.post('/talent-images', ...upload, async (req, res) =>
    sendSuccess(
      res,
      await media.uploadLibrary(
        user(req),
        req.body,
        req.get('Content-Type'),
        'talent',
      ),
      { status: 201 },
    ),
  );
  submissions.post('/', validate(newSubmissionInput), async (req, res) =>
    sendSuccess(res, await createSubmission(user(req), body(res)), {
      status: 201,
    }),
  );
  submissions.get('/:id', validate(submissionInput), async (req, res) =>
    sendSuccess(
      res,
      await details(await getSubmission(id(res), user(req).publicId)),
    ),
  );
  submissions.patch('/:id', validate(editSubmissionInput), async (req, res) =>
    sendSuccess(res, await updateOwnSubmission(user(req), id(res), body(res))),
  );
  submissions.post('/:id/submit', validate(resourceAction), async (req, res) =>
    sendSuccess(res, await updateOwnSubmission(user(req), id(res))),
  );
  admin.get('/submissions', validate(submissionListInput), (req, res) =>
    listSubmissions(res, query(res)),
  );
  admin.get('/submissions/:id', validate(submissionInput), async (req, res) =>
    sendSuccess(res, await details(await getSubmission(id(res)))),
  );
  admin.post(
    '/submissions/:id/moderate',
    validate(moderationInput),
    async (req, res) =>
      sendSuccess(
        res,
        await moderateSubmission(id(res), body(res), context(req, res)),
      ),
  );
  admin.post(
    '/submissions/:id/publish',
    validate(publishInput),
    async (req, res) =>
      sendSuccess(
        res,
        await publishSubmission(
          id(res),
          context(req, res),
          {
            talent: publishTalent,
            film: publishIndependent,
            ...publishers,
          },
          body(res)?.release,
        ),
      ),
  );

  admin.get('/media', validate(mediaListInput), (req, res) =>
    listMedia(res, query(res)),
  );
  admin.post('/media', ...upload, async (req, res) =>
    sendSuccess(
      res,
      await media.uploadLibrary(user(req), req.body, req.get('Content-Type')),
      { status: 201 },
    ),
  );
  admin.put('/media/:id', validate(userInput), ...upload, async (req, res) =>
    sendSuccess(
      res,
      await media.replaceLibrary(
        user(req),
        id(res),
        context(req, res),
        req.body,
        req.get('Content-Type'),
      ),
    ),
  );
  admin.delete('/media/:id', validate(resourceAction), async (req, res) =>
    sendSuccess(res, await media.deleteLibrary(id(res), context(req, res))),
  );
  profileImage.get('/', async (req, res) =>
    sendSuccess(res, { image: await media.getProfile(user(req)) }),
  );
  profileImage.put('/', ...upload, async (req, res) =>
    sendSuccess(res, {
      image: await media.replaceProfile(
        user(req),
        req.body,
        req.get('Content-Type'),
      ),
    }),
  );

  api.use('/admin', admin);
  api.use('/submissions', submissions);
  api.use('/users/me/image', profileImage);
}
