import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/app-error.js';
import { idParams, listInput } from '../../utils/list.js';
import { sendError, sendSuccess } from '../../utils/responses.js';
import { permit } from '../admin/policy.js';
import {
  requireActiveAccount,
  requireVerifiedEmail,
} from '../auth/authorization.js';
import { directoryInput } from '../talent/schemas.js';
import { listTalent } from '../talent/service.js';
import { siteFlags } from '../site/service.js';
import { getMovie, getManagedMovie, listMovies, writeMovie } from './movies.js';
import {
  accountRating,
  moderateRating,
  ratingSummary,
  resolveTarget,
  saveRating,
} from './ratings.js';
import {
  getReview,
  interact,
  listComments,
  listReports,
  listReviews,
  trendingReviews,
  resolveReport,
  submitReport,
  writeReview,
} from './community.js';
import * as s from './schemas.js';
import {
  createMetadataService,
  metadataSearch,
  metadataId,
  metadataImport,
  metadataRefresh,
} from './metadata.js';

const input = (res) => res.locals.validated;
const actor = (req) => req.auth.user;
const privateResponse = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};
const quota = rateLimit({
  windowMs: 60000,
  limit: 45,
  keyGenerator: (req) => req.auth.user.publicId,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) =>
    sendError(res, {
      status: 429,
      code: 'REVIEW_RATE_LIMIT',
      message: 'Try again shortly.',
    }),
});
const active = async (_req, _res, next) => {
  const flags = await siteFlags();
  if (flags.maintenance)
    throw new AppError(
      503,
      'SITE_MAINTENANCE',
      'The website is temporarily in maintenance.',
    );
  next();
};
const community = async (_req, _res, next) => {
  if (!(await siteFlags()).communityOpen)
    throw new AppError(
      403,
      'COMMUNITY_CLOSED',
      'Community participation is currently closed.',
    );
  next();
};
export function mountReviews(
  api,
  admin,
  authenticate,
  { available, notify = () => {}, movieMetadataProvider },
) {
  const ready = (_req, _res, next) => {
    if (available && !available())
      throw new AppError(
        503,
        'DEPENDENCY_UNAVAILABLE',
        'This service is temporarily unavailable.',
      );
    next();
  };
  const catalog = Router();
  const ratings = Router();
  const reviews = Router();
  for (const [path, router] of [
    ['/movies', catalog],
    ['/ratings', ratings],
    ['/reviews', reviews],
  ]) {
    router.use(ready, active);
    api.use(path, router);
  }
  const write = [
    privateResponse,
    authenticate,
    requireActiveAccount,
    requireVerifiedEmail,
    quota,
    community,
  ];
  const identity = [privateResponse, authenticate, requireActiveAccount];
  const target = '/:type/:slug';
  const review = target + '/:id';
  const comment = review + '/comments/:comment';
  const result =
    (operation, status = 200) =>
    async (req, res) => {
      const { noticeOwner, ...data } = await operation(req, res);
      if (noticeOwner) notify(noticeOwner);
      sendSuccess(res, data, { status });
    };
  catalog.get('/', validate(s.movies), (_req, res) =>
    listMovies(res, input(res).query),
  );
  catalog.get('/:slug/credits', validate(s.slugInput), async (_req, res) =>
    sendSuccess(res, await getMovie(input(res).params.slug, true)),
  );
  catalog.get('/:slug', validate(s.slugInput), async (_req, res) =>
    sendSuccess(res, await getMovie(input(res).params.slug)),
  );
  ratings.get(
    target + '/mine',
    ...identity,
    validate(s.targetInput),
    async (req, res) =>
      sendSuccess(
        res,
        await accountRating(await resolveTarget(input(res).params), actor(req)),
      ),
  );
  ratings.get(target, validate(s.targetInput), async (_req, res) =>
    sendSuccess(
      res,
      await ratingSummary(await resolveTarget(input(res).params)),
    ),
  );
  ratings.put(
    target,
    ...write,
    validate(s.rate),
    result((req, res) =>
      saveRating(input(res).params, actor(req), input(res).body.rating),
    ),
  );
  ratings.delete(
    target,
    ...write,
    validate(s.targetInput),
    result((req, res) => saveRating(input(res).params, actor(req))),
  );
  reviews.get('/trending', validate(listInput()), async (_req, res) => {
    const { data, pagination } = await trendingReviews(input(res).query);
    return sendSuccess(res, data, { pagination });
  });
  reviews.get(
    target + '/mine',
    ...identity,
    validate(s.targetInput),
    async (req, res) =>
      sendSuccess(res, await getReview(input(res).params, actor(req))),
  );
  reviews.get(review + '/comments', validate(s.comments), (_req, res) =>
    listComments(res, input(res).params, input(res).query),
  );
  reviews.get(review, validate(s.reviewInput), async (_req, res) =>
    sendSuccess(res, await getReview(input(res).params)),
  );
  reviews.get(target, validate(s.reviewList), async (_req, res) =>
    listReviews(res, await resolveTarget(input(res).params), input(res).query),
  );
  reviews.post(
    target,
    ...write,
    validate(s.createReview),
    result(
      (req, res) =>
        writeReview(input(res).params, actor(req), input(res).body, 'create'),
      201,
    ),
  );
  reviews.patch(
    review,
    ...write,
    validate(s.editReview),
    result((req, res) =>
      writeReview(input(res).params, actor(req), input(res).body, 'edit'),
    ),
  );
  reviews.delete(
    review,
    ...write,
    validate(s.reviewInput),
    result((req, res) =>
      writeReview(input(res).params, actor(req), undefined, 'delete'),
    ),
  );
  const interaction = (action) =>
    result(
      (req, res) =>
        interact(input(res).params, actor(req), input(res).body, action),
      action === 'comment' ? 201 : 200,
    );
  reviews.put(
    review + '/like',
    ...write,
    validate(s.reviewInput),
    interaction('like'),
  );
  reviews.delete(
    review + '/like',
    ...write,
    validate(s.reviewInput),
    interaction('unlike'),
  );
  reviews.post(
    review + '/comments',
    ...write,
    validate(s.createComment),
    interaction('comment'),
  );
  reviews.patch(
    comment,
    ...write,
    validate(s.editComment),
    interaction('edit-comment'),
  );
  reviews.delete(
    comment,
    ...write,
    validate(s.commentInput),
    interaction('remove-comment'),
  );
  const report = result(
    (req, res) => submitReport(input(res).params, actor(req), input(res).body),
    202,
  );
  reviews.post(review + '/report', ...write, validate(s.reportReview), report);
  reviews.post(
    comment + '/report',
    ...write,
    validate(s.reportComment),
    report,
  );

  const audit = (req, res) => ({
    actorId: actor(req).publicId,
    requestId: res.get('X-Request-Id'),
  });
  admin.use('/movies', permit('content', 'movies'));
  admin.get('/movies/credit-talent', validate(directoryInput), (_req, res) =>
    listTalent(res, input(res).query),
  );
  const metadata = createMetadataService(movieMetadataProvider);
  admin.get(
    '/movies/metadata/search',
    quota,
    validate(metadataSearch),
    async (_req, res) =>
      sendSuccess(res, await metadata.search(input(res).query.q)),
  );
  admin.get(
    '/movies/metadata/:id/preview',
    quota,
    validate(metadataId),
    result((_req, res) => metadata.preview(input(res).params.id)),
  );
  admin.post(
    '/movies/metadata/:id/import',
    quota,
    validate(metadataImport),
    result(
      (req, res) => metadata.import(input(res).params.id, audit(req, res)),
      201,
    ),
  );
  admin.post(
    '/movies/:id/metadata/refresh',
    quota,
    validate(metadataRefresh),
    result((req, res) =>
      metadata.refresh(
        input(res).params.id,
        input(res).body.revision,
        audit(req, res),
      ),
    ),
  );
  admin.get('/movies', validate(s.adminMovies), (_req, res) =>
    listMovies(res, input(res).query, true),
  );
  admin.get(
    '/movies/:id',
    validate(z.object({ params: idParams })),
    result((_req, res) => getManagedMovie(input(res).params.id)),
  );
  admin.post(
    '/movies',
    validate(s.movieCreate),
    result(
      (req, res) => writeMovie(undefined, input(res).body, audit(req, res)),
      201,
    ),
  );
  admin.patch(
    '/movies/:id',
    validate(s.movieEdit),
    result((req, res) =>
      writeMovie(input(res).params.id, input(res).body, audit(req, res)),
    ),
  );
  admin.post(
    '/movies/:id/status',
    validate(s.movieAction),
    result((req, res) =>
      writeMovie(input(res).params.id, input(res).body, audit(req, res)),
    ),
  );
  admin.use('/review-moderation', permit('moderation'));
  admin.get('/review-moderation/reports', validate(s.reports), (_req, res) =>
    listReports(res, input(res).query),
  );
  admin.patch(
    '/review-moderation/reports/:id',
    validate(s.resolve),
    result((req, res) =>
      resolveReport(input(res).params.id, input(res).body, audit(req, res)),
    ),
  );
  admin.patch(
    '/review-moderation/ratings/:type/:slug/:account',
    validate(s.ratingAbuse),
    result((req, res) =>
      moderateRating(input(res).params, input(res).body, audit(req, res)),
    ),
  );
}
