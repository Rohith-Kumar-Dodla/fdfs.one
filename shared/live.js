export const eventCategories = {
  sports: 'Sports',
  technology: 'Technology',
  college: 'College',
  cultural: 'Cultural',
  community: 'Community',
  interview: 'Interview',
  entertainment: 'Entertainment',
  other: 'Other',
};
export const broadcasts = [
  'scheduled',
  'live',
  'ended',
  'cancelled',
  'postponed',
];

export function formatEventTime(value, timeZone, locale) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatter(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

export function eventLocalTime(value, timeZone) {
  if (!value) return '';
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(value))
      .map(({ type, value }) => [type, value]),
  );
  return (
    parts.year +
    '-' +
    parts.month +
    '-' +
    parts.day +
    'T' +
    parts.hour +
    ':' +
    parts.minute
  );
}

export function eventUtcTime(value, timeZone) {
  const stamp = Date.parse(value + 'Z');
  if (!Number.isFinite(stamp)) throw new Error('Enter a valid event time.');
  const day = 86400000;
  const candidates = [stamp - day, stamp, stamp + day]
    .map(
      (probe) =>
        stamp + probe - Date.parse(eventLocalTime(probe, timeZone) + 'Z'),
    )
    .filter((candidate) => eventLocalTime(candidate, timeZone) === value);
  if (candidates.length === 0)
    throw new Error('This local time does not exist in the selected timezone.');
  return new Date(Math.min(...candidates)).toISOString();
}
