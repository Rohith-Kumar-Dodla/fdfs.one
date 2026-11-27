import { isYouTubeId } from './youtube.js';

export const youtubeThumbnails = {
  maxres: ['maxresdefault', 1280, 720],
  standard: ['sddefault', 640, 480],
  high: ['hqdefault', 480, 360],
  medium: ['mqdefault', 320, 180],
  default: ['default', 120, 90],
};

export function youtubeArtwork(video) {
  if (
    !isYouTubeId(video?.providerVideoId) ||
    !Object.hasOwn(youtubeThumbnails, video.artwork)
  )
    return null;
  const [file, width, height] = youtubeThumbnails[video.artwork];
  return {
    url:
      'https://i.ytimg.com/vi/' + video.providerVideoId + '/' + file + '.jpg',
    width,
    height,
  };
}
