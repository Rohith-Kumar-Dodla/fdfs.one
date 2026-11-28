import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import {
  discoveryModules,
  homepageSections,
} from '../../../../shared/homepage.js';
import { assembledHomepage } from './homepage.js';
import { publicSitemap } from './sitemap.js';
import { globalSearch, searchInput, suggestInput } from './search.js';
import {
  getPromotion,
  Promotion,
  listPromotions,
  promotionAction,
  promotionCreate,
  promotionEdit,
  promotionList,
  writePromotion,
} from './promotions.js';
import {
  analyticsCampaignInput,
  campaignMetrics,
  collectPromotion,
  promotionRange,
} from './promotion-analytics.js';
import { AuditLog } from '../admin/audit.js';
import { idParams, listInput, sendList } from '../../utils/list.js';
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

const contentInput = listInput({
  module: z.enum(discoveryModules),
  q: z.string().trim().min(1).max(80).optional(),
  upcoming: z.stringbool().optional(),
});
const anywhere = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};
const throttle = rateLimit({
  windowMs: 60000,
  limit: 70,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) =>
    sendError(res, {
      status: 429,
      code: 'DISCOVERY_LIMIT',
      message: 'Try again shortly.',
    }),
});
const data = (res) => res.locals.validated;
export function mountPublicSite(api, available, { config, authConfig } = {}) {
  const ready = async (_req, res, next) => {
    if (!available())
      return sendError(res, {
        status: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Discovery is temporarily unavailable.',
      });
    const { value } = await readConfig('settings');
    if (value.maintenance)
      return sendError(res, {
        status: 503,
        code: 'SITE_MAINTENANCE',
        message: 'The website is temporarily in maintenance.',
      });
    res.locals.discoverySettings = value;
    next();
  };
  api.get('/site/sitemap.xml', anywhere, ready, async (_req, res) => {
    const origin = authConfig?.webOrigin ?? config?.CORS_ORIGINS?.[0];
    if (!origin)
      throw new AppError(
        503,
        'DEPENDENCY_UNAVAILABLE',
        'Sitemap is temporarily unavailable.',
      );
    const xml = await publicSitemap(
      origin,
      res.locals.discoverySettings.hiddenModules,
    );
    res.set('Cache-Control', 'public, max-age=0, s-maxage=60, must-revalidate');
    return res.type('application/xml').send(xml);
  });
  api.get('/homepage', anywhere, ready, async (req, res) =>
    sendSuccess(
      res,
      await assembledHomepage({
        logger: req.log,
        refined: req.query.view === 'entertainment',
        settings: res.locals.discoverySettings,
      }),
    ),
  );
  for (const [path, schema, suggest] of [
    ['/search', searchInput, false],
    ['/search/suggestions', suggestInput, true],
  ]) {
    api.get(
      path,
      anywhere,
      ready,
      throttle,
      validate(schema),
      async (_req, res) => {
        return sendSuccess(
          res,
          await globalSearch(
            { ...data(res).query, suggest },
            res.locals.discoverySettings.hiddenModules,
          ),
        );
      },
    );
  }
  if (authConfig)
    api.post(
      '/homepage/campaign-events',
      anywhere,
      ready,
      throttle,
      validate(analyticsCampaignInput),
      async (_req, res) =>
        sendSuccess(
          res,
          await collectPromotion(
            data(res).body,
            config,
            authConfig.accessSecret,
          ),
          { status: 202 },
        ),
    );
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

export function mountSiteAdmin(admin, config) {
  admin.use('/site', permit('site'));
  admin.get('/site/content', validate(contentInput), (_req, res) =>
    listFeatures(res, res.locals.validated.query),
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
  admin.get('/site/homepage/assembly', async (req, res) =>
    sendSuccess(
      res,
      await assembledHomepage({
        preview: true,
        refined: req.query.view === 'entertainment',
        logger: req.log,
      }),
    ),
  );
  admin.get('/site/homepage/hero-campaigns', async (_req, res) =>
    sendList(
      res,
      Promotion,
      {
        status: 'published',
        endAt: { $gt: new Date() },
        'placements.slot': 'hero',
      },
      { page: 1, limit: 100 },
      ({ publicId, name, startAt, endAt }) => ({
        id: publicId,
        name,
        startAt,
        endAt,
      }),
      'publicId name startAt endAt',
      { priority: -1, order: 1, _id: 1 },
    ),
  );
  admin.use('/promotions', permit('promotions'));
  admin.get('/promotions/content', validate(contentInput), (_req, res) =>
    listFeatures(res, data(res).query),
  );
  admin.get('/promotions/placements', async (_req, res) => {
    const { value, published } = await readConfig('homepage');
    const sections = new Map(
      [...homepageSections(published), ...value.sections].map((row) => [
        row.id,
        row,
      ]),
    );
    return sendSuccess(
      res,
      [...sections.values()].map(({ id, type, heading }) => ({
        id,
        type,
        heading,
      })),
    );
  });
  admin.get('/promotions', validate(promotionList), (_req, res) =>
    listPromotions(res, data(res).query),
  );
  admin.get(
    '/promotions/:id/metrics',
    validate(promotionRange),
    async (_req, res) => {
      const result = await campaignMetrics(
        data(res).params.id,
        data(res).query,
        config,
      );
      if (!result)
        throw new AppError(404, 'PROMOTION_NOT_FOUND', 'Campaign not found.');
      return sendSuccess(res, result);
    },
  );
  admin.get(
    '/promotions/:id/audit',
    validate(listInput().extend({ params: idParams })),
    (_req, res) =>
      sendList(
        res,
        AuditLog,
        { targetType: 'promotion', targetId: data(res).params.id },
        data(res).query,
        (row) => ({
          id: String(row._id),
          action: row.action,
          summary: row.summary,
          createdAt: row.createdAt,
        }),
        'action summary createdAt',
      ),
  );
  admin.get(
    '/promotions/:id',
    validate(z.object({ params: idParams })),
    async (_req, res) =>
      sendSuccess(res, await getPromotion(data(res).params.id)),
  );
  for (const [verb, path, schema] of [
    ['post', '/promotions', promotionCreate],
    ['patch', '/promotions/:id', promotionEdit],
    ['post', '/promotions/:id/status', promotionAction],
  ]) {
    admin[verb](path, validate(schema), async (req, res) =>
      sendSuccess(
        res,
        await writePromotion(
          data(res).params?.id,
          data(res).body,
          context(req, res),
        ),
        { status: data(res).params ? 200 : 201 },
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
