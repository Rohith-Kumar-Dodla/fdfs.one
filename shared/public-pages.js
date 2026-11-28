export const publicPages = {
  '/': [
    'FDFS.ONE',
    'Independent films, original stories, podcasts, live events, reviews and talent.',
  ],
  '/cinema': [
    'FDFS Cinema',
    'Discover independent short films from the FDFS.ONE community.',
  ],
  '/originals': [
    'FDFS Originals',
    'Explore original short films produced or presented by FDFS.ONE.',
  ],
  '/podcasts': [
    '404 Reality Not Found',
    'Browse podcast episodes and conversations with guests from film and culture.',
  ],
  '/live': [
    'FDFS Live',
    'Find upcoming FDFS.ONE live events and available replays.',
  ],
  '/reviews': [
    'FDFS Reviews',
    'Discover movie and short-film reviews, ratings and community discussions.',
  ],
  '/talent': [
    'FDFS Talent Profiles',
    'Explore public profiles and credits for people working across film and podcasts.',
  ],
  '/reviews/movies': [
    'Movie Reviews',
    'Browse the movie catalogue and read community reviews.',
  ],
  '/reviews/short-films': [
    'Short-film Reviews',
    'Explore community ratings and reviews of independent and original short films.',
  ],
  '/reviews/community': [
    'Community Reviews',
    'Read recent reviews and discussions from the FDFS.ONE community.',
  ],
};

export const escapeMarkup = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char],
  );

export const pageTitle = (title) =>
  title === 'FDFS.ONE' ? title : title + ' | FDFS.ONE';
