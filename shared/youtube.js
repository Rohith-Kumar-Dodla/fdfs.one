const youtubeHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
]);
const privateHosts = new Set([
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export const isYouTubeId = (id) =>
  typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);

export function parseYouTube(source) {
  if (
    typeof source !== 'string' ||
    source.length > 2048 ||
    /[\s\\]/.test(source)
  )
    return null;
  let url;
  try {
    url = new globalThis.URL(source);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password)
    return null;

  let id;
  if (url.hostname === 'youtu.be') id = /^\/([^/]+)$/.exec(url.pathname)?.[1];
  if (youtubeHosts.has(url.hostname)) {
    if (
      url.pathname === '/watch' &&
      url.searchParams.getAll('v').length === 1
    ) {
      id = url.searchParams.get('v');
    } else {
      id = /^\/(?:embed|live|shorts)\/([^/]+)$/.exec(url.pathname)?.[1];
    }
  }
  if (privateHosts.has(url.hostname))
    id = /^\/embed\/([^/]+)$/.exec(url.pathname)?.[1];
  return isYouTubeId(id)
    ? {
        provider: 'youtube',
        providerVideoId: id,
        sourceUrl: 'https://www.youtube.com/watch?v=' + id,
      }
    : null;
}

export function youtubeEmbed(id, origin) {
  if (!isYouTubeId(id)) return null;
  const url = new globalThis.URL(
    'https://www.youtube-nocookie.com/embed/' + id,
  );
  url.searchParams.set('enablejsapi', '1');
  url.searchParams.set('origin', origin);
  return url.href;
}
