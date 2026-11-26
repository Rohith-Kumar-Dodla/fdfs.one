import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
  supportCategories,
  supportMaxBytes,
  supportMaxImages,
} from '../../../../shared/operations.js';
import { AppError } from '../../utils/app-error.js';
import { idParams, listInput } from '../../utils/list.js';
import { sendError, sendSuccess } from '../../utils/responses.js';
import { validate } from '../../middlewares/validate.js';
import { requireActiveAccount } from '../auth/authorization.js';
import { permit } from '../admin/policy.js';
import { readConfig } from '../site/service.js';
import { uploadRateLimit } from '../media/images.js';
import {
  activityTotals,
  analyticsInput,
  analyticsModels,
  analyticsOptions,
  historical,
  ingest,
  rangeInput,
} from './analytics.js';
import {
  addAttachment,
  assignmentInput,
  attachmentInput,
  createInput,
  createOwnedTicket,
  details,
  getAttachment,
  guestActor,
  guestStartInput,
  guestVerifyInput,
  listAssignees,
  listTickets,
  manage,
  manageInput,
  openSupportCount,
  reply,
  replyInput,
  startGuest,
  ticketAudit,
  ticketInput,
  ticketListInput,
  transcript,
  transcriptInput,
  verifyGuest,
} from './support.js';
import { supportModels, Ticket } from './support-models.js';
import {
  Announcement,
  announcementAction,
  announcementCreate,
  announcementEdit,
  announcementList,
  announcements,
  editAnnouncement,
  getAnnouncement,
  listNotices,
  managedAnnouncements,
  readNotices,
  systemHealth,
  unreadCount,
} from './platform.js';

export const initializeOperationsIndexes = () =>
  Promise.all(
    [...supportModels, ...analyticsModels, Announcement].map((model) =>
      model.createIndexes(),
    ),
  );
const input = (res) => res.locals.validated;
const user = (req) => req.auth.user;
const audit = (req, res) => ({
  actorId: user(req).publicId,
  requestId: res.get('X-Request-Id'),
});
const ids = (res) => input(res).params;
const privateResponse = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};
const rawScreenshot = express.raw({
  type: ['image/png', 'image/jpeg', 'image/webp'],
  limit: supportMaxBytes,
  inflate: false,
});
const quota = (limit, windowMs) =>
  rateLimit({
    limit,
    windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      sendError(res, {
        status: 429,
        code: 'OPERATIONS_RATE_LIMIT',
        message: 'Too many requests. Try again later.',
      }),
  });

export function mountOperations(api, admin, authenticate, options) {
  const {
    authConfig,
    presence,
    health,
    config,
    notify = () => {},
    available,
    mediaProvider,
  } = options;
  const analytics = analyticsOptions(config);
  const ready = (_req, res, next) => {
    if (available && !available())
      return sendError(res, {
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'The service is temporarily unavailable.',
      });
    next();
  };
  const actor = async (req, res, next) => {
    const match = /^Guest ([A-Za-z0-9_-]{43})$/.exec(
      req.get('Authorization') ?? '',
    );
    if (match) {
      req.supportActor = await guestActor(match[1]);
      return next();
    }
    return authenticate(req, res, () =>
      requireActiveAccount(req, res, () => {
        req.supportActor = { user: user(req) };
        next();
      }),
    );
  };
  const staffActor = (req, _res, next) => {
    req.supportActor = { user: user(req), staff: true };
    next();
  };
  async function settings() {
    const { value } = await readConfig('settings');
    return {
      enabled: value.supportOpen !== false,
      categories: value.supportCategories ?? Object.keys(supportCategories),
      email: value.supportEmail,
      contact: value.contact,
      guestEmail: Boolean(options.supportEmailAvailable ?? authConfig.smtp),
      attachments: config?.SUPPORT_ATTACHMENTS !== false,
      maxBytes: supportMaxBytes,
      attachmentDays: config?.SUPPORT_ATTACHMENT_DAYS ?? 90,
      maxImages: supportMaxImages,
    };
  }
  async function creationAllowed(category) {
    const config = await settings();
    if (!config.enabled)
      throw new AppError(
        403,
        'SUPPORT_DISABLED',
        'New support tickets are temporarily unavailable.',
      );
    if (category && !config.categories.includes(category))
      throw new AppError(
        400,
        'SUPPORT_CATEGORY_DISABLED',
        'Choose an available support category.',
      );
    return config;
  }
  api.get('/support/config', privateResponse, ready, async (_req, res) =>
    sendSuccess(res, await settings()),
  );
  api.post(
    '/support/guest/start',
    privateResponse,
    ready,
    quota(8, 900000),
    validate(guestStartInput),
    async (_req, res) => {
      const { body } = input(res);
      const config = body.ticket
        ? await creationAllowed(body.ticket.category)
        : await settings();
      if (!config.guestEmail)
        return sendError(res, {
          status: 503,
          code: 'SUPPORT_EMAIL_UNAVAILABLE',
          message: 'Guest verification requires working email delivery.',
        });
      return sendSuccess(res, await startGuest(body, authConfig.accessSecret), {
        status: 202,
      });
    },
  );
  api.post(
    '/support/guest/verify',
    privateResponse,
    ready,
    quota(20, 900000),
    validate(guestVerifyInput),
    async (_req, res) =>
      sendSuccess(
        res,
        await verifyGuest(input(res).body.token, creationAllowed),
      ),
  );
  api.post(
    '/support/tickets',
    privateResponse,
    ready,
    authenticate,
    requireActiveAccount,
    quota(12, 900000),
    validate(createInput),
    async (req, res) => {
      await creationAllowed(input(res).body.category);
      return sendSuccess(
        res,
        await createOwnedTicket(input(res).body, user(req)),
        { status: 201 },
      );
    },
  );
  api.get(
    '/support/tickets',
    privateResponse,
    ready,
    authenticate,
    requireActiveAccount,
    validate(ticketListInput),
    (req, res) => listTickets(res, input(res).query, { user: user(req) }),
  );
  const support = Router();
  support.use(privateResponse, ready, actor);
  api.use('/support', support);
  const staff = Router();
  staff.use(permit('support'), staffActor);
  admin.use('/support', staff);
  staff.get('/stats', async (_req, res) =>
    sendSuccess(res, { open: await openSupportCount() }),
  );
  staff.get('/assignees', validate(assignmentInput), (_req, res) =>
    listAssignees(res, input(res).query),
  );
  staff.get('/tickets', validate(ticketListInput), (req, res) =>
    listTickets(res, input(res).query, req.supportActor),
  );
  staff.get('/tickets/:id/audit', validate(transcriptInput), (req, res) =>
    ticketAudit(res, input(res).query, req.supportActor, ids(res).id),
  );
  for (const [router, staffOnly] of [
    [support, false],
    [staff, true],
  ]) {
    router.get('/tickets/:id', validate(ticketInput), async (req, res) =>
      sendSuccess(res, await details(req.supportActor, ids(res).id)),
    );
    router.get('/tickets/:id/messages', validate(transcriptInput), (req, res) =>
      transcript(res, input(res).query, req.supportActor, ids(res).id),
    );
    router.post(
      '/tickets/:id/messages',
      quota(30, 900000),
      validate(replyInput),
      async (req, res) => {
        const { noticeOwner, ...data } = await reply(
          req.supportActor,
          ids(res).id,
          input(res).body,
        );
        if (noticeOwner) notify(noticeOwner);
        return sendSuccess(res, data);
      },
    );
    router.patch('/tickets/:id', validate(manageInput), async (req, res) => {
      const { body } = input(res);
      if (!staffOnly && !(body.action === 'status' && body.status === 'open'))
        throw new AppError(
          403,
          'FORBIDDEN',
          'This action requires support staff.',
        );
      const { ticket, noticeOwner } = await manage(
        req.supportActor,
        ids(res).id,
        body,
        staffOnly ? audit(req, res) : undefined,
      );
      if (noticeOwner) notify(noticeOwner);
      return sendSuccess(res, ticket);
    });
    router.post(
      '/tickets/:id/attachments',
      uploadRateLimit(),
      rawScreenshot,
      validate(ticketInput),
      async (req, res) => {
        if (config?.SUPPORT_ATTACHMENTS === false)
          throw new AppError(
            403,
            'ATTACHMENTS_DISABLED',
            'Support attachments are disabled.',
          );
        return sendSuccess(
          res,
          await addAttachment(
            req.supportActor,
            ids(res).id,
            req.body,
            req.get('Content-Type'),
            config?.SUPPORT_ATTACHMENT_DAYS,
          ),
          { status: 201 },
        );
      },
    );
    router.get(
      '/tickets/:id/attachments/:attachment',
      validate(attachmentInput),
      async (req, res) => {
        const { id, attachment } = ids(res);
        const data = await getAttachment(
          req.supportActor,
          id,
          attachment,
          staffOnly ? audit(req, res) : undefined,
        );
        res.set({
          'Content-Type': 'image/webp',
          'Content-Disposition': 'inline; filename="screenshot.webp"',
          'Cross-Origin-Resource-Policy': 'same-site',
        });
        return res.send(data);
      },
    );
  }
  const currentAnalytics = async () => ({
    ...analytics,
    enabled:
      analytics.enabled &&
      (await readConfig('settings')).value.analyticsOpen !== false,
  });
  api.post(
    '/analytics/events',
    privateResponse,
    ready,
    quota(80, 60000),
    validate(analyticsInput),
    (req, res, next) =>
      req.get('Authorization')
        ? authenticate(req, res, () => requireActiveAccount(req, res, next))
        : next(),
    async (req, res) =>
      sendSuccess(
        res,
        await ingest(
          input(res).body,
          req.auth?.user,
          await currentAnalytics(),
          authConfig.accessSecret,
        ),
        { status: 202 },
      ),
  );
  admin.get(
    '/analytics',
    permit('analytics'),
    validate(rangeInput),
    async (_req, res) =>
      sendSuccess(
        res,
        await historical(input(res).query, await currentAnalytics(), Ticket),
      ),
  );
  admin.get('/activity', permit('analytics'), (_req, res) =>
    sendSuccess(res, presence?.snapshot() ?? { available: false }),
  );
  admin.get('/analytics/overview', permit('analytics'), async (_req, res) => {
    const [stats, openTickets] = await Promise.all([
      activityTotals(await currentAnalytics()),
      openSupportCount(),
    ]);
    return sendSuccess(res, {
      ...stats,
      openTickets,
      presence: presence?.snapshot() ?? { available: false },
      at: new Date(),
    });
  });
  admin.get('/system-health', permit('operations'), async (_req, res) =>
    sendSuccess(
      res,
      await systemHealth({
        available: available ?? (() => true),
        presence,
        health,
        smtp: Boolean(authConfig.smtp),
        analytics: await currentAnalytics(),
        media: Boolean(mediaProvider),
      }),
    ),
  );

  api.get('/announcements', ready, privateResponse, async (_req, res) =>
    sendSuccess(res, await announcements()),
  );
  api.get(
    '/announcements/account',
    ready,
    privateResponse,
    authenticate,
    requireActiveAccount,
    async (req, res) => sendSuccess(res, await announcements(user(req))),
  );
  const notifications = Router();
  notifications.use(ready, privateResponse, authenticate, requireActiveAccount);
  notifications.get('/', validate(listInput()), (req, res) =>
    listNotices(res, input(res).query, user(req)),
  );
  notifications.get('/unread', async (req, res) =>
    sendSuccess(res, await unreadCount(user(req))),
  );
  notifications.patch('/read', async (req, res) =>
    sendSuccess(res, await readNotices(user(req))),
  );
  notifications.patch('/:id/read', validate(ticketInput), async (req, res) =>
    sendSuccess(res, await readNotices(user(req), ids(res).id)),
  );
  api.use('/notifications', notifications);
  admin.use('/announcements', permit('announcements'));
  admin.get('/announcements', validate(announcementList), (_req, res) =>
    managedAnnouncements(res, input(res).query),
  );
  admin.get(
    '/announcements/:id',
    validate(z.object({ params: idParams })),
    async (_req, res) => sendSuccess(res, await getAnnouncement(ids(res).id)),
  );
  for (const [verb, path, schema] of [
    ['post', '/announcements', announcementCreate],
    ['patch', '/announcements/:id', announcementEdit],
    ['post', '/announcements/:id/status', announcementAction],
  ]) {
    admin[verb](path, validate(schema), async (req, res) =>
      sendSuccess(
        res,
        await editAnnouncement(ids(res)?.id, input(res).body, audit(req, res)),
      ),
    );
  }
}
