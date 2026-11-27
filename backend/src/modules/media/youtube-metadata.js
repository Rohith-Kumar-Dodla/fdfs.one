import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { parseYouTube } from '../../../../shared/youtube.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/app-error.js';
import { sendError, sendSuccess } from '../../utils/responses.js';
import { authorize } from '../admin/policy.js';

const endpoint = 'https://www.googleapis.com/youtube/v3/videos';
const expiry = 15 * 60 * 1000;
const keys = ['maxres', 'standard', 'high', 'medium', 'default'];

export function mapYouTubeVideo({
  id,
  snippet = {},
  contentDetails = {},
  status = {},
}) {
  const duration = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(
    contentDetails.duration,
  );
  const durationSeconds =
    duration &&
    duration
      .slice(1)
      .reduce(
        (seconds, value, index) =>
          seconds + Number(value ?? 0) * [86400, 3600, 60, 1][index],
        0,
      );
  const thumbnails = keys.flatMap((key) => {
    const thumbnail = snippet.thumbnails?.[key];
    return thumbnail &&
      typeof thumbnail.url === 'string' &&
      thumbnail.url.startsWith('https://i.ytimg.com/vi/' + id + '/') &&
      Number.isInteger(thumbnail.width) &&
      thumbnail.width > 0 &&
      Number.isInteger(thumbnail.height) &&
      thumbnail.height > 0
      ? [
          {
            key,
            url: thumbnail.url,
            width: thumbnail.width,
            height: thumbnail.height,
          },
        ]
      : [];
  });
  return {
    id,
    title: snippet.title,
    description: snippet.description,
    language: snippet.defaultAudioLanguage ?? snippet.defaultLanguage,
    durationSeconds:
      Number.isSafeInteger(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : undefined,
    thumbnails,
    embeddable: status.embeddable,
    privacy: status.privacyStatus,
    uploadStatus: status.uploadStatus,
    broadcast: snippet.liveBroadcastContent,
    regionRestriction: contentDetails.regionRestriction,
  };
}

const unavailable = (message) =>
  new AppError(
    503,
    'YOUTUBE_METADATA_UNAVAILABLE',
    message + ' Complete the fields manually.',
  );
export function createYouTubeMetadata(apiKey, request = fetch) {
  const cache = new Map();
  const inflight = new Map();
  async function lookup(id) {
    const url = new URL(endpoint);
    url.searchParams.set('id', id);
    url.searchParams.set('part', 'snippet,contentDetails,status');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await request(url, {
          headers: { 'X-Goog-Api-Key': apiKey },
          signal: AbortSignal.timeout(3500),
          redirect: 'error',
        });
        if (response.status === 403 || response.status === 429)
          throw unavailable(
            'YouTube rejected the metadata request or the quota was reached.',
          );
        if (response.status >= 500 && attempt === 0) continue;
        if (!response.ok)
          throw unavailable('YouTube metadata is temporarily unavailable.');
        const { items } = await response.json();
        const item = items?.find((row) => row.id === id);
        if (!item)
          throw new AppError(
            404,
            'YOUTUBE_VIDEO_NOT_FOUND',
            'YouTube did not return details for this video. Check the URL or enter the details manually.',
          );
        const value = mapYouTubeVideo(item);
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(id, { value, expires: Date.now() + expiry });
        return value;
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (attempt === 1)
          throw unavailable('YouTube metadata is temporarily unavailable.');
      }
    }
  }
  return async (source) => {
    const video = parseYouTube(source);
    if (!video)
      throw new AppError(
        400,
        'YOUTUBE_URL_INVALID',
        'Enter a supported HTTPS YouTube URL.',
      );
    if (!apiKey) throw unavailable('YouTube metadata is not configured.');
    const id = video.providerVideoId;
    const entry = cache.get(id);
    if (entry?.expires > Date.now()) return entry.value;
    if (!inflight.has(id))
      inflight.set(
        id,
        lookup(id).finally(() => inflight.delete(id)),
      );
    return inflight.get(id);
  };
}

const metadataInput = z.object({
  body: z.strictObject({
    source: z.string().trim().min(1).max(2048),
    module: z.enum(['independent', 'original', 'podcasts', 'live']),
  }),
});

export function mountYouTubeMetadata(admin, apiKey) {
  const load = createYouTubeMetadata(apiKey);
  const quota = rateLimit({
    windowMs: 60000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.auth.user.publicId,
    handler: (_req, res) =>
      sendError(res, {
        status: 429,
        code: 'METADATA_RATE_LIMIT',
        message:
          'Wait before fetching more details or complete the fields manually.',
      }),
  });
  admin.post(
    '/youtube-metadata',
    validate(metadataInput),
    quota,
    async (req, res) => {
      const { source, module } = res.locals.validated.body;
      authorize(req.auth.user, 'content', module);
      return sendSuccess(res, await load(source));
    },
  );
}
