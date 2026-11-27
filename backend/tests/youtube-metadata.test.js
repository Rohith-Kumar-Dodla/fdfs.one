import { expect, it, vi } from 'vitest';
import { createYouTubeMetadata } from '../src/modules/media/youtube-metadata.js';
import { mapYouTubeVideo } from '../src/modules/media/youtube-metadata.js';

it('maps a provider schedule and keeps unavailable duration unset', () => {
  const scheduled = '2030-05-25T13:00:00Z';
  const result = mapYouTubeVideo({
    id: 'aBCDef123_-',
    snippet: { liveBroadcastContent: 'upcoming' },
    contentDetails: { duration: 'PT0S' },
    liveStreamingDetails: { scheduledStartTime: scheduled },
  });
  expect(result.scheduledStartAt).toBe(scheduled);
  expect(result.durationSeconds).toBeUndefined();
  expect(result.actualStartAt).toBeUndefined();
});

const id = 'aBCDef123_-';
const watch = 'https://www.youtube.com/watch?v=' + id;
it('validates video links, maps provider metadata and coalesces cache hits across URL formats', async () => {
  const thumbnail = {
    url: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
    width: 320,
    height: 180,
  };
  const fetch = vi.fn(async () =>
    Response.json({
      items: [
        {
          id,
          snippet: {
            title: 'Isolated title',
            description: 'Details',
            defaultAudioLanguage: 'te-IN',
            thumbnails: { medium: thumbnail },
          },
          contentDetails: { duration: 'PT2H3M4S' },
          status: { embeddable: true, privacyStatus: 'unlisted' },
        },
      ],
    }),
  );
  const details = createYouTubeMetadata('isolated-test-key', fetch);
  await expect(
    details('https://www.youtube.com.example.test/watch?v=' + id),
  ).rejects.toMatchObject({ code: 'YOUTUBE_URL_INVALID' });
  const [first, second] = await Promise.all([
    details('https://youtu.be/' + id),
    details('https://www.youtube.com/shorts/' + id),
  ]);
  expect(first).toEqual(second);
  expect(first).toMatchObject({
    id,
    title: 'Isolated title',
    language: 'te-IN',
    durationSeconds: 7384,
    thumbnails: [{ key: 'medium', ...thumbnail }],
    embeddable: true,
    privacy: 'unlisted',
  });
  await expect(details('https://www.youtube.com/live/' + id)).resolves.toEqual(
    first,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url.origin + url.pathname).toBe(
    'https://www.googleapis.com/youtube/v3/videos',
  );
  expect(url.searchParams.has('key')).toBe(false);
  expect(options.signal).toBeInstanceOf(AbortSignal);
});

it('gives a manual fallback with no key, server errors or quota exhaustion', async () => {
  const unconfigured = vi.fn();
  await expect(
    createYouTubeMetadata('', unconfigured)(watch),
  ).rejects.toMatchObject({
    code: 'YOUTUBE_METADATA_UNAVAILABLE',
    message: expect.stringContaining('manually'),
  });
  expect(unconfigured).not.toHaveBeenCalled();
  const failing = vi.fn(async () => new Response(null, { status: 502 }));
  await expect(
    createYouTubeMetadata('isolated-test-key', failing)(watch),
  ).rejects.toMatchObject({
    status: 503,
    message: expect.stringContaining('manually'),
  });
  expect(failing).toHaveBeenCalledTimes(2);
  const limited = vi.fn(async () => new Response(null, { status: 403 }));
  await expect(
    createYouTubeMetadata('isolated-test-key', limited)(watch),
  ).rejects.toMatchObject({
    status: 503,
    message: expect.stringContaining('quota'),
  });
  expect(limited).toHaveBeenCalledTimes(1);
});
