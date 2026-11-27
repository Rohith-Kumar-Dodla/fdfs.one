import { Film, FilmCredit } from '../films/models.js';
import { Movie } from '../reviews/models.js';
import { publicMovieFilter } from '../reviews/movies.js';
import { EpisodeParticipant, PodcastEpisode } from '../podcasts/models.js';
import { findShow } from '../podcasts/read.js';
import { Personality } from './models.js';

export async function categoryStages(category, now = new Date(), hidden = []) {
  const limit = [{ $limit: 1 }, { $project: { _id: 1 } }];
  let collection;
  const localField = '_id';
  let foreignField = 'personality',
    pipeline;
  if (category === 'movies') {
    collection = Movie.collection.name;
    foreignField = 'credits.personality';
    pipeline = [
      {
        $match: {
          ...publicMovieFilter(now),
          ...(hidden.includes('/reviews') && { _id: null }),
        },
      },
      ...limit,
    ];
  } else {
    const films = category === 'short-films';
    collection = (films ? FilmCredit : EpisodeParticipant).collection.name;
    const show = films ? null : await findShow(true).select('_id').lean();
    const visibility = films
      ? {
          status: 'published',
          releaseAt: { $lte: now },
          classification: {
            $in: ['independent', 'original'].filter(
              (key) =>
                !hidden.includes(
                  key === 'independent' ? '/cinema' : '/originals',
                ),
            ),
          },
        }
      : {
          status: 'published',
          show: !hidden.includes('/podcasts') && show ? show._id : null,
          publicationAt: { $lte: now },
          releaseAt: { $lte: now },
        };
    pipeline = [
      ...(!films ? [{ $match: { role: 'guest' } }] : []),
      {
        $lookup: {
          from: (films ? Film : PodcastEpisode).collection.name,
          localField: films ? 'film' : 'episode',
          foreignField: '_id',
          pipeline: [{ $match: visibility }, ...limit],
          as: 'publishedRole',
        },
      },
      { $match: { 'publishedRole.0': { $exists: true } } },
      ...limit,
    ];
  }
  return [
    {
      $lookup: {
        from: collection,
        localField,
        foreignField,
        pipeline,
        as: 'categoryMatch',
      },
    },
    {
      $match: {
        $or: [
          { categories: category },
          { 'categoryMatch.0': { $exists: true } },
        ],
      },
    },
    { $unset: 'categoryMatch' },
  ];
}

export async function eligibleShortFilmProfiles(ids, now, hidden, limit = 12) {
  const rows = await Personality.aggregate([
    { $match: { status: 'published', ...(ids && { publicId: { $in: ids } }) } },
    ...(await categoryStages('short-films', now, hidden)),
    { $sort: { sortName: 1, _id: 1 } },
    { $limit: limit },
    { $project: { publicId: 1 } },
  ]);
  return rows.map((row) => row.publicId);
}
