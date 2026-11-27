import { Router } from 'express';
import { z } from 'zod';
import { genres } from '../../../../shared/films.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { progressTypes, saveTypes } from '../../../../shared/personal.js';
import { validate } from '../../middlewares/validate.js';
import { listInput, publicId, idParams } from '../../utils/list.js';
import { sendSuccess } from '../../utils/responses.js';
import { AppError } from '../../utils/app-error.js';
import { requireActiveAccount } from '../auth/authorization.js';
import { Following } from './models.js';
import { related } from './catalog.js';
import { dashboard, personalizedHome, upcomingReminders } from './recommend.js';
import {
  editHistory,
  follow,
  followingList,
  preferences,
  progressState,
  publicPreferences,
  removeItem,
  savedList,
  savedStatus,
  saveItem,
  unfollow,
  updatePreferences,
  writeProgress,
  historyList,
} from './library.js';

const bounded = (types) =>
  listInput(types ? { module: z.enum(types).optional() } : {}).refine(
    ({ query }) => query.page <= 1000 && query.limit <= 24,
  );
const ref = (types) => z.object({ module: z.enum(types), id: publicId });
const targets = z.object({
  query: z.object({
    targets: z
      .string()
      .max(2400)
      .transform((raw, ctx) => {
        const records = raw.split(',').map((row) => row.split(':'));
        const safe = z
          .array(z.tuple([z.enum(saveTypes), publicId]))
          .min(1)
          .max(40)
          .safeParse(records);
        if (!safe.success) {
          ctx.addIssue({
            code: 'custom',
            message: 'Choose valid published content references.',
          });
          return z.NEVER;
        }
        return [
          ...new Map(
            safe.data.map(([module, id]) => [
              module + ':' + id,
              { module, id },
            ]),
          ).values(),
        ];
      }),
  }),
});
const prefs = z.object({
  body: z
    .strictObject({
      genres: z
        .array(z.enum(Object.keys({ ...genres, ...reviewGenres })))
        .max(12),
      types: z.array(z.enum(saveTypes)).max(saveTypes.length),
      recommendations: z.boolean(),
      history: z.boolean(),
      talentNotices: z.boolean(),
    })
    .partial()
    .refine(
      (row) =>
        Object.keys(row).length > 0 &&
        [row.genres, row.types].every(
          (list) => !list || new Set(list).size === list.length,
        ),
    ),
});
const progressParams = z.object({ params: ref(progressTypes) });
const seconds = z.number().min(0).max(86400);
const progressInput = progressParams.extend({
  body: z.strictObject({
    epoch: z.union([z.literal('initial'), z.uuid()]),
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    source: z.string().regex(/^[a-f0-9]{64}$/),
    videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    position: seconds,
    duration: seconds.positive().optional(),
    ended: z.boolean().default(false),
    restart: z.boolean().default(false),
  }),
});
const input = (res) => res.locals.validated;
const owner = (req) => req.auth.user._id;
const output = (res, value) => sendSuccess(res, value);
export function mountPersonal(api, authenticate, available) {
  const ready = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (available && !available())
      throw new AppError(
        503,
        'DEPENDENCY_UNAVAILABLE',
        'This service is temporarily unavailable.',
      );
    next();
  };
  api.get(
    '/related/:module/:id',
    ready,
    validate(z.object({ params: ref([...saveTypes, 'talent']) })),
    async (_req, res) => {
      const { module, id } = input(res).params;
      return output(res, await related(module, id));
    },
  );
  const router = Router();
  router.use(ready, authenticate, requireActiveAccount);
  const respond = (method, path, schema, handler) =>
    router[method](
      path,
      ...(schema ? [validate(schema)] : []),
      async (req, res) => output(res, await handler(req, input(res))),
    );
  respond('get', '/dashboard', null, (req) => dashboard(req.auth.user));
  respond('get', '/reminders', null, (req) => upcomingReminders(owner(req)));
  respond('get', '/homepage', null, (req) => personalizedHome(owner(req)));
  respond('get', '/preferences', null, async (req) =>
    publicPreferences(await preferences(owner(req))),
  );
  respond('patch', '/preferences', prefs, (req, entry) =>
    updatePreferences(owner(req), entry.body),
  );
  respond('get', '/watchlist', bounded(saveTypes), (req, entry) =>
    savedList(owner(req), entry.query),
  );
  respond('get', '/watchlist/status', targets, (req, entry) =>
    savedStatus(owner(req), entry.query.targets),
  );
  const watch = z.object({ params: ref(saveTypes) });
  respond('put', '/watchlist/:module/:id', watch, (req, entry) =>
    saveItem(owner(req), entry.params),
  );
  respond('delete', '/watchlist/:module/:id', watch, (req, entry) =>
    removeItem(owner(req), entry.params),
  );
  respond('get', '/progress/:module/:id', progressParams, (req, entry) =>
    progressState(owner(req), entry.params),
  );
  respond('put', '/progress/:module/:id', progressInput, (req, entry) =>
    writeProgress(owner(req), entry.params, entry.body),
  );
  respond('get', '/history', bounded(progressTypes), (req, entry) =>
    historyList(owner(req), entry.query),
  );
  respond('get', '/continue', bounded(progressTypes), (req, entry) =>
    historyList(owner(req), entry.query, { resume: true }),
  );
  respond('delete', '/continue/:module/:id', progressParams, (req, entry) =>
    editHistory(owner(req), entry.params, { dismiss: true }),
  );
  respond('delete', '/history/:module/:id', progressParams, (req, entry) =>
    editHistory(owner(req), entry.params),
  );
  respond('delete', '/history', null, (req) => editHistory(owner(req)));
  respond('get', '/following', bounded(), (req, entry) =>
    followingList(owner(req), entry.query),
  );
  const talent = z.object({ params: idParams });
  respond('get', '/following/:id', talent, async (req, entry) => ({
    following: Boolean(
      await Following.exists({ owner: owner(req), talent: entry.params.id }),
    ),
  }));
  respond('put', '/following/:id', talent, (req, entry) =>
    follow(owner(req), entry.params.id),
  );
  respond('delete', '/following/:id', talent, (req, entry) =>
    unfollow(owner(req), entry.params.id),
  );
  api.use('/personal', router);
}
