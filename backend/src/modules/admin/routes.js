import { can } from '../../../../shared/admin.js';
import { AppError } from '../../utils/app-error.js';
import { LiveEvent } from '../live/models.js';
import { ChatReport } from '../live/chat.js';
import { listInput, searchPattern, sendList } from '../../utils/list.js';
import { authorize, permit } from './policy.js';
import { changeStaff, staffInput } from './roles.js';
import { mountSiteAdmin } from '../site/routes.js';
import { overview } from './overview.js';
import { mountOperations } from '../operations/routes.js';
import { Router } from 'express';
import { z } from 'zod';
import { mountLiveManagement } from '../live/routes.js';
import {
  eventProposalDetails,
  publishEventSubmission,
} from '../live/events.js';
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
import { createSessionService } from '../auth/sessions.js';
import {
  createMediaService,
  listMedia,
  MediaAsset,
  mediaListInput,
  mediaMetadataInput,
  saveMediaMetadata,
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
  categories,
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
    ...(record.eventProposal &&
      (await eventProposalDetails(record.eventProposal))),
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
  {
    available,
    mediaProvider,
    publishers,
    liveNotify,
    reminderLead = 15,
    config,
    presence,
    health,
    noticeNotify,
    supportEmailAvailable,
  } = {},
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

  mountOperations(api, admin, authenticate, {
    authConfig,
    available,
    config,
    presence,
    health,
    notify: noticeNotify,
    mediaProvider,
    supportEmailAvailable,
  });
  admin.use(permit('dashboard'));
  mountSiteAdmin(admin);
  admin.use('/users', permit('users'));
  admin.use('/audit', permit('audit'));
  admin.use('/media', permit('media'));
  admin.use('/talent', permit('content', 'talent'));
  admin.use('/talent/:id/association', permit('users'));
  admin.use(
    ['/podcasts/show', '/podcasts/episodes'],
    permit('content', 'podcasts'),
  );
  admin.use(['/podcasts/comments', '/podcasts/reports'], permit('moderation'));
  admin.use('/live', (req, res, next) => {
    if (
      /^\/[^/]+\/chat(?:\/|$)/i.test(req.path) &&
      can(req.auth.user, 'moderation')
    )
      return next();
    return permit('content', 'live')(req, res, next);
  });
  admin.patch(
    '/users/:id/staff',
    permit('roles'),
    validate(staffInput),
    async (req, res) =>
      sendSuccess(
        res,
        await changeStaff(id(res), body(res), context(req, res)),
      ),
  );
  admin.get(
    '/moderation/live-events',
    permit('moderation'),
    validate(listInput({ q: z.string().trim().min(1).max(80).optional() })),
    (_req, res) =>
      sendList(
        res,
        LiveEvent,
        {
          moderation: 'approved',
          ...(query(res).q && { title: searchPattern(query(res).q) }),
        },
        query(res),
        (row) => ({
          id: row.publicId,
          title: row.title,
          broadcast: row.broadcast,
        }),
        'publicId title broadcast',
      ),
  );
  admin.get(
    '/moderation/live-reports',
    permit('moderation'),
    validate(
      listInput({ status: z.enum(['open', 'resolved']).default('open') }),
    ),
    (_req, res) =>
      sendList(
        res,
        ChatReport,
        { resolvedAt: query(res).status === 'open' ? null : { $type: 'date' } },
        query(res),
        (row) => ({
          id: row.publicId,
          reason: row.reason,
          createdAt: row.createdAt,
          event: row.event && {
            id: row.event.publicId,
            title: row.event.title,
          },
          message: row.message && {
            text: row.message.text,
            name: row.message.name,
          },
          resolvedAt: row.resolvedAt,
        }),
        'publicId event message reason createdAt resolvedAt',
        undefined,
        (find) =>
          find
            .populate('event', 'publicId title')
            .populate('message', 'text name'),
      ),
  );
  mountPodcastManagement(api, admin, authenticate);
  mountLiveManagement(api, admin, authenticate, {
    available,
    liveNotify,
    reminderLead,
  });
  mountAdminFilms(admin);
  mountAdminTalent(admin);
  admin.get('/overview', async (req, res) =>
    sendSuccess(res, await overview(user(req))),
  );
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
  submissions.post(
    '/live-images',
    requireRoles('organizer'),
    ...upload,
    async (req, res) =>
      sendSuccess(
        res,
        await media.uploadLibrary(
          user(req),
          req.body,
          req.get('Content-Type'),
          'live',
        ),
        { status: 201 },
      ),
  );
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
  const submissionModule = {
    film: 'independent',
    original: 'original',
    podcast: 'podcasts',
    live: 'live',
    talent: 'talent',
  };
  const submissionAccess = (account, category) =>
    can(account, 'moderation') ||
    can(account, 'content', submissionModule[category]);
  const reviewed = async (req, res, next) => {
    const record = await getSubmission(id(res));
    if (!submissionAccess(user(req), record.category))
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission.');
    res.locals.submission = record;
    next();
  };
  admin.get('/submissions', validate(submissionListInput), (req, res) => {
    const allowed = categories.filter((category) =>
      submissionAccess(user(req), category),
    );
    if (
      !allowed.length ||
      (query(res).category && !allowed.includes(query(res).category))
    )
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission.');
    return listSubmissions(res, query(res), undefined, allowed);
  });
  admin.get(
    '/submissions/:id',
    validate(submissionInput),
    reviewed,
    async (_req, res) => sendSuccess(res, await details(res.locals.submission)),
  );
  admin.post(
    '/submissions/:id/moderate',
    validate(moderationInput),
    reviewed,
    async (req, res) =>
      sendSuccess(
        res,
        await moderateSubmission(id(res), body(res), context(req, res)),
      ),
  );
  admin.post(
    '/submissions/:id/publish',
    validate(publishInput),
    reviewed,
    async (req, res) => {
      authorize(
        user(req),
        'content',
        submissionModule[res.locals.submission.category],
      );
      const result = await publishSubmission(
        id(res),
        context(req, res),
        {
          talent: publishTalent,
          film: publishIndependent,
          live: publishEventSubmission(reminderLead),
          ...publishers,
        },
        body(res)?.release,
      );
      if (result.category === 'live' && result.publishedResource?.slug)
        liveNotify?.({ slug: result.publishedResource.slug });
      return sendSuccess(res, result);
    },
  );

  admin.get('/media', validate(mediaListInput), (req, res) =>
    listMedia(res, query(res), can(user(req), 'media_manage')),
  );
  admin.post('/media', ...upload, async (req, res) =>
    sendSuccess(
      res,
      await media.uploadLibrary(user(req), req.body, req.get('Content-Type')),
      { status: 201 },
    ),
  );
  admin.patch(
    '/media/:id',
    permit('media_manage'),
    validate(mediaMetadataInput),
    async (req, res) =>
      sendSuccess(
        res,
        await saveMediaMetadata(id(res), body(res), context(req, res)),
      ),
  );
  admin.put(
    '/media/:id',
    permit('media_manage'),
    validate(userInput),
    ...upload,
    async (req, res) =>
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
  admin.delete(
    '/media/:id',
    permit('media_manage'),
    validate(resourceAction),
    async (req, res) =>
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
