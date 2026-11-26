import { z } from 'zod';
import { contentModules } from '../../../../shared/admin.js';
import { listInput } from '../../utils/list.js';
import { AppError } from '../../utils/app-error.js';
import { sendError, sendSuccess } from '../../utils/responses.js';
import { validate } from '../../middlewares/validate.js';
import { permit } from '../admin/policy.js';
import { homepageInput, publishInput, settingsInput } from './schemas.js';
import {
  homepageView,
  listFeatures,
  publicSettings,
  readConfig,
  saveConfig,
  siteFlags,
} from './service.js';
import { emptyHomepage, siteDefaults } from '../../../../shared/site.js';

export function mountPublicSite(api, available) {
  api.get('/site/settings', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return sendSuccess(
      res,
      available() ? await publicSettings() : siteDefaults,
    );
  });
  api.get('/site/homepage', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const published = available()
      ? (await readConfig('homepage')).published
      : undefined;
    return sendSuccess(res, await homepageView(published ?? emptyHomepage));
  });
  api.use(async (req, res, next) => {
    const path = req.path.toLowerCase();
    const [, module, collection, identifier, action] = path.split('/');
    const register =
      req.method === 'POST' &&
      (path === '/auth/register' || path === '/auth/register/');
    const community =
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      ((module === 'podcasts' &&
        collection === 'episodes' &&
        action === 'comments') ||
        (module === 'live' && collection && identifier === 'chat'));
    const publicModule = [
      'films',
      'talent',
      'podcasts',
      'live',
      'submissions',
      'organizer',
    ].includes(module);
    if (!available() || !(register || publicModule)) return next();
    const flags = await siteFlags();
    if (flags.maintenance)
      return sendError(res, {
        status: 503,
        code: 'SITE_MAINTENANCE',
        message: 'The website is temporarily in maintenance.',
      });
    if (register && !flags.registrationOpen)
      throw new AppError(
        403,
        'REGISTRATION_CLOSED',
        'Registration is currently closed.',
      );
    if (community && !flags.communityOpen)
      throw new AppError(
        403,
        'COMMUNITY_CLOSED',
        'Community participation is currently closed.',
      );
    next();
  });
}

export function mountSiteAdmin(admin) {
  admin.use('/site', permit('site'));
  admin.get(
    '/site/content',
    validate(
      listInput({
        module: z.enum(contentModules),
        q: z.string().trim().min(1).max(80).optional(),
      }),
    ),
    (_req, res) => listFeatures(res, res.locals.validated.query),
  );
  const input = (res) => res.locals.validated.body;
  const context = (req, res) => ({
    actorId: req.auth.user.publicId,
    requestId: res.get('X-Request-Id'),
  });
  for (const [key, schema] of [
    ['settings', settingsInput],
    ['homepage', homepageInput],
  ]) {
    admin.get('/site/' + key, async (_req, res) =>
      sendSuccess(res, await readConfig(key)),
    );
    admin.put('/site/' + key, validate(schema), async (req, res) =>
      sendSuccess(
        res,
        await saveConfig(
          key,
          input(res).revision,
          input(res)[key],
          context(req, res),
        ),
      ),
    );
  }
  admin.get('/site/homepage/preview', async (_req, res) =>
    sendSuccess(
      res,
      await homepageView((await readConfig('homepage')).value, true),
    ),
  );
  admin.post(
    '/site/homepage/publish',
    validate(publishInput),
    async (req, res) =>
      sendSuccess(
        res,
        await saveConfig(
          'homepage',
          input(res).revision,
          undefined,
          context(req, res),
          true,
        ),
      ),
  );
}
