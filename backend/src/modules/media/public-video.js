import { youtubeArtwork } from '../../../../shared/youtube-artwork.js';
import { parseYouTube } from '../../../../shared/youtube.js';

export const playbackDescriptor = (video) =>
  video?.providerVideoId && video.availability !== 'unavailable'
    ? { availability: video.availability, playbackType: video.playbackType }
    : undefined;

export function publicVideoArtwork(video, module, slug, slot = 'poster') {
  const artwork = youtubeArtwork(video);
  if (!artwork) return null;
  return {
    ...artwork,
    url:
      '/api/v1/playback/artwork/' +
      module +
      '/' +
      encodeURIComponent(slug) +
      '/' +
      slot,
  };
}

export const isVideoLink = (url) =>
  Boolean(
    url &&
    (parseYouTube(url) ||
      /^https:\/\/(?:i\.ytimg\.com|img\.youtube\.com|(?:www\.)?youtube(?:-nocookie)?\.com)\/(?:vi(?:_webp)?|embed|v|shorts|live)\//i.test(
        url,
      )),
  );
