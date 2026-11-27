import { RatingTotals } from './models.js';

export async function ratedPage(
  model,
  where,
  sort,
  { page, limit, minimumRating },
  targetTypes,
  projection,
  populate,
) {
  const select = Object.fromEntries(
    projection.split(' ').map((field) => [field, 1]),
  );
  const [result] = await model.aggregate([
    { $match: where },
    {
      $lookup: {
        from: RatingTotals.collection.name,
        localField: '_id',
        foreignField: 'target',
        pipeline: [
          {
            $match: {
              targetType: { $in: targetTypes },
              count: { $gt: 0 },
              $expr: {
                $gte: ['$sum', { $multiply: ['$count', minimumRating * 2] }],
              },
            },
          },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: 'qualifiedRating',
      },
    },
    { $match: { 'qualifiedRating.0': { $exists: true } } },
    {
      $facet: {
        rows: [
          { $sort: sort },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $project: select },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  return [
    await model.populate(result.rows, populate),
    result.total[0]?.count ?? 0,
  ];
}
