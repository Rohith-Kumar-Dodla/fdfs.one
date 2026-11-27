import { Router } from 'express';
import { z } from 'zod';
import { youtubeArtwork } from '../../../../shared/youtube-artwork.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/app-error.js';
import { sendSuccess } from '../../utils/responses.js';
import {
  requireActiveAccount,
  requireAuthentication,
  requireVerifiedEmail,
} from '../auth/authorization.js';
import { createSessionService } from '../auth/sessions.js';
import { Film } from '../films/models.js';
import { slug } from '../films/schemas.js';
import { getPublicFilm } from '../films/read.js';
import { liveDetails, visibility } from '../live/events.js';
import { LiveEvent } from '../live/models.js';
import { PodcastEpisode } from '../podcasts/models.js';
import { getEpisode } from '../podcasts/read.js';
import { getMovie } from '../reviews/movies.js';
import { sourceFilter } from '../site/discovery.js';
import { allowedSource } from '../site/homepage.js';
import { readConfig } from '../site/service.js';

const films = ['independent', 'original'];
const params = {
  module: z.enum([...films, 'podcasts', 'live', 'movies']),
  slug,
};
const input = z.object({ params: z.object(params) });
const artInput = z.object({
  params: z.object({
    ...params,
    slot: z.string().regex(/^(poster|extra-\d{1,2})$/),
  }),
});
const missing = () =>
  new AppError(404, 'PLAYBACK_NOT_FOUND', 'This media is unavailable.');

async function resolveVideos(module, slug) {
  if (films.includes(module)) {
    const { mainVideo, trailer, extras } = await getPublicFilm(
      slug,
      module,
      true,
    );
    return { mainVideo, trailer, extras };
  }
  if (module === 'podcasts') {
    const { mainVideo, teaser, extras } = await getEpisode(slug, false, true);
    return { mainVideo, teaser, extras };
  }
  if (module === 'live') {
    const { video, replay } = await liveDetails(
      { ...visibility(), slug },
      false,
      true,
    );
    return { video, replay };
  }
  return { trailer: (await getMovie(slug, false, true)).trailer };
}

async function artworkSource(module, slug, slot) {
  if (module === 'movies') throw missing();
  const now = new Date();
  const model =
    module === 'live'
      ? LiveEvent
      : module === 'podcasts'
        ? PodcastEpisode
        : Film;
  const filter =
    module === 'live'
      ? {
          ...visibility(now),
          $and: [
            { $or: [{ broadcast: 'live' }, { providerArtworkApproved: true }] },
          ],
        }
      : await sourceFilter(module, { now, mode: 'released' });
  const row = await model
    .findOne({ ...filter, slug })
    .select('mainVideo video extras')
    .lean();
  if (!row) throw missing();
  const video =
    slot === 'poster'
      ? (row.mainVideo ?? row.video)
      : films.includes(module) && row.extras?.[Number(slot.slice(6))]?.video;
  const image = youtubeArtwork(video);
  if (!image) throw missing();
  return image.url;
}

async function readArtwork(url) {
  const limit = 512 * 1024;
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    if (
      !response.ok ||
      Number(response.headers.get('content-length')) > limit ||
      !/^image\/jpeg\b/i.test(response.headers.get('content-type') ?? '')
    ) {
      await response.body?.cancel();
      throw missing();
    }
    const parts = [];
    let size = 0;
    for await (const part of response.body) {
      size += part.byteLength;
      if (size > limit) throw missing();
      parts.push(Buffer.from(part));
    }
    return Buffer.concat(parts);
  } catch {
    throw missing();
  }
}

export function playbackRoutes(available, authConfig) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  const eligibility = async (_req, res, next) => {
    if (!available())
      throw new AppError(
        503,
        'DEPENDENCY_UNAVAILABLE',
        'Media is temporarily unavailable.',
      );
    const { value } = await readConfig('settings');
    if (
      value.maintenance ||
      !allowedSource(res.locals.validated.params.module, value.hiddenModules)
    )
      throw missing();
    next();
  };
  router.get(
    '/artwork/:module/:slug/:slot',
    validate(artInput),
    eligibility,
    async (_req, res) => {
      const { module, slug, slot } = res.locals.validated.params;
      return res
        .type('jpeg')
        .send(await readArtwork(await artworkSource(module, slug, slot)));
    },
  );
  const authenticate = authConfig
    ? requireAuthentication(createSessionService(authConfig))
    : requireActiveAccount;
  router.get(
    '/:module/:slug',
    authenticate,
    requireActiveAccount,
    requireVerifiedEmail,
    validate(input),
    eligibility,
    async (_req, res) => {
      const { module, slug } = res.locals.validated.params;
      return sendSuccess(res, await resolveVideos(module, slug));
    },
  );
  return router;
}
