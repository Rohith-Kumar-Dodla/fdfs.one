import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { sendSuccess } from '../../utils/responses.js';
import { AppError } from '../../utils/app-error.js';
import {
  requireActiveAccount,
  requireRoles,
  requireVerifiedEmail,
} from '../auth/authorization.js';
import { LiveEvent } from './models.js';
import {
  ChatMessage,
  ChatParticipant,
  ChatReport,
  chatActionInput,
  chatClosed,
  chatHistory,
  chatHistoryInput,
  chatReportInput,
  listChatReports,
  moderateChat,
  reportChat,
} from './chat.js';
import {
  changeEvent,
  createEvent,
  findManaged,
  listEvents,
  liveDetails,
  publicEvent,
  visibility,
} from './events.js';
import {
  Reminder,
  reminderState,
  subscribe,
  unsubscribe,
} from './reminders.js';
import {
  adminCreate,
  adminEdit,
  eventId,
  eventOptions,
  managedList,
  ownerAction,
  publicList,
  slugInput,
  staffAction,
} from './schemas.js';

const input = (res) => res.locals.validated;
const identity = (req) => req.auth.user;
const audit = (req, res) => ({
  actorId: identity(req).publicId,
  requestId: res.get('X-Request-Id'),
});
const availableOnly = (available) => (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (available && !available())
    throw new AppError(
      503,
      'DEPENDENCY_UNAVAILABLE',
      'Live services are temporarily unavailable.',
    );
  next();
};
const historicSlug = slugInput.extend(chatHistoryInput.shape);
const historicId = eventId.extend(chatHistoryInput.shape);
const reportInput = slugInput.extend(chatReportInput.shape);
const reminderInput = slugInput.extend({ body: z.strictObject({}).optional() });
export function initializeLiveIndexes() {
  return Promise.all(
    [LiveEvent, ChatMessage, ChatParticipant, ChatReport, Reminder].map(
      (model) => model.createIndexes(),
    ),
  );
}

export function publicLiveRoutes(available, chatEnabled = false) {
  const router = Router();
  router.use(availableOnly(available));
  router.get('/', validate(publicList), (_req, res) =>
    listEvents(res, input(res).query),
  );
  router.get('/:slug', validate(slugInput), async (_req, res) => {
    const event = await liveDetails({ ...visibility(), ...input(res).params });
    return sendSuccess(res, {
      ...event,
      chatEnabled: chatEnabled && event.chatEnabled,
    });
  });
  router.get('/:slug/chat', validate(historicSlug), async (_req, res) => {
    if (!chatEnabled) throw chatClosed();
    return sendSuccess(
      res,
      await chatHistory(
        await publicEvent(input(res).params.slug),
        input(res).query.cursor,
      ),
    );
  });
  return router;
}

export function mountLiveManagement(
  api,
  admin,
  authenticate,
  { available, liveNotify = () => {}, reminderLead = 15, chatEnabled = false },
) {
  const organizer = Router();
  organizer.use(
    availableOnly(available),
    authenticate,
    requireActiveAccount,
    requireVerifiedEmail,
    requireRoles('organizer'),
  );
  const participation = Router();
  participation.use(
    availableOnly(available),
    authenticate,
    requireActiveAccount,
    requireVerifiedEmail,
  );
  for (const [method, action] of [
    ['get', reminderState],
    ['put', subscribe],
    ['delete', unsubscribe],
  ]) {
    participation[method](
      '/:slug/reminder',
      validate(reminderInput),
      async (req, res) =>
        sendSuccess(
          res,
          await action(
            await publicEvent(input(res).params.slug),
            identity(req),
            reminderLead,
          ),
        ),
    );
  }
  if (!chatEnabled)
    participation.post('/:slug/chat', () => {
      throw chatClosed();
    });
  participation.post(
    '/:slug/chat/reports',
    validate(reportInput),
    async (req, res) => {
      if (!chatEnabled) throw chatClosed();
      return sendSuccess(
        res,
        await reportChat(
          await publicEvent(input(res).params.slug),
          identity(req),
          input(res).body,
        ),
      );
    },
  );
  api.use('/live', participation);
  api.use('/organizer', organizer);

  admin.post('/live', validate(adminCreate), async (req, res) => {
    const { providerArtworkApproved, ...eventInput } = input(res).body;
    const event = await createEvent(
      eventInput,
      identity(req),
      audit(req, res),
      reminderLead,
      { providerArtworkApproved },
    );
    if (event.status === 'published')
      liveNotify({ slug: event.slug, status: event.status });
    return sendSuccess(res, await liveDetails({ _id: event._id }, true), {
      status: 201,
    });
  });

  for (const [router, scoped] of [
    [admin, false],
    [organizer, true],
  ]) {
    const scope = (req) => (scoped ? { organizer: identity(req)._id } : {});
    router.get('/live', validate(managedList), (req, res) =>
      listEvents(res, input(res).query, scope(req)),
    );
    router.get('/live/:id', validate(eventId), async (req, res) =>
      sendSuccess(
        res,
        await liveDetails(
          { publicId: input(res).params.id, ...scope(req) },
          true,
        ),
      ),
    );
    const update = (operation) => async (req, res) => {
      const event = await changeEvent(
        input(res).params.id,
        scope(req),
        input(res).body,
        audit(req, res),
        reminderLead,
        operation,
      );
      liveNotify(event);
      return sendSuccess(res, await liveDetails({ _id: event._id }, true));
    };
    if (!scoped) router.patch('/live/:id', validate(adminEdit), update('edit'));
    router.patch(
      '/live/:id/status',
      validate(scoped ? ownerAction : staffAction),
      update('status'),
    );
    router.patch(
      '/live/:id/options',
      validate(eventOptions),
      update('options'),
    );
    const eventForChat = (req, res, session) =>
      findManaged(
        input(res).params.id,
        scoped ? { ...scope(req), ...visibility() } : {},
        session,
      );
    router.get('/live/:id/chat', validate(historicId), async (req, res) =>
      sendSuccess(
        res,
        await chatHistory(
          await eventForChat(req, res),
          input(res).query.cursor,
          true,
        ),
      ),
    );
    router.get(
      '/live/:id/chat/reports',
      validate(historicId),
      async (req, res) =>
        sendSuccess(
          res,
          await listChatReports(
            await eventForChat(req, res),
            input(res).query.cursor,
          ),
        ),
    );
    router.patch(
      '/live/:id/chat',
      validate(chatActionInput),
      async (req, res) => {
        const result = await moderateChat(
          (session) => eventForChat(req, res, session),
          input(res).body,
          audit(req, res),
        );
        if (result.removed || result.restored) liveNotify(result);
        return sendSuccess(res, result);
      },
    );
  }
}
