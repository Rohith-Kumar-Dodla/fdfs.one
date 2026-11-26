export const podcastBrand = {
  name: '404 Reality Not Found',
  slug: '404-reality-not-found',
};
export const participantRoles = {
  host: 'Host',
  co_host: 'Co-host',
  guest: 'Guest',
  moderator: 'Moderator',
  other: 'Other participant',
};

export function timestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const tail = String(seconds % 60).padStart(2, '0');
  return hours
    ? hours + ':' + String(minutes).padStart(2, '0') + ':' + tail
    : minutes + ':' + tail;
}
