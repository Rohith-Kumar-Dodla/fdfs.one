export const genres = {
  animation: 'Animation',
  comedy: 'Comedy',
  documentary: 'Documentary',
  drama: 'Drama',
  experimental: 'Experimental',
  fantasy: 'Fantasy',
  horror: 'Horror',
  romance: 'Romance',
  science_fiction: 'Science fiction',
  thriller: 'Thriller',
  other: 'Other',
};

export const languages = {
  en: 'English',
  hi: 'Hindi',
  te: 'Telugu',
  ta: 'Tamil',
  ml: 'Malayalam',
  kn: 'Kannada',
  bn: 'Bengali',
  mr: 'Marathi',
  gu: 'Gujarati',
  pa: 'Punjabi',
  or: 'Odia',
  ur: 'Urdu',
  as: 'Assamese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  und: 'Undetermined',
  zxx: 'No spoken dialogue',
};

export const filmPaths = { independent: '/cinema', original: '/originals' };
export const filmLabels = { independent: 'Cinema', original: 'FDFS Originals' };
export const filmPath = ({ classification, slug }) =>
  filmPaths[classification] + '/' + slug;
