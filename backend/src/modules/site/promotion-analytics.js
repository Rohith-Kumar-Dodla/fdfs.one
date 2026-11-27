import { createHmac } from 'node:crypto';
import { z } from 'zod';
import {
  AnalyticsDaily,
  analyticsOptions,
  calendarDay,
  period,
  rangeInput,
  recordAnalytics,
} from '../operations/analytics.js';
import { idParams, publicId } from '../../utils/list.js';
import { Promotion, promotionEligible } from './promotions.js';
import { readConfig } from './service.js';

const placement = z
  .string()
  .regex(/^(?:hero|footer|(?:between|rail):[a-f0-9-]{36})$/);
export const analyticsCampaignInput = z.object({
  body: z.strictObject({
    campaign: publicId,
    placement,
    visit: z.uuid(),
    kind: z.enum(['impression', 'click']),
    consent: z.boolean().default(false),
  }),
});
export const promotionRange = rangeInput.extend({ params: idParams });
export async function collectPromotion(
  input,
  config,
  secret,
  now = new Date(),
) {
  if (!input.consent) return { collected: false };
  const options = analyticsOptions(config);
  const { value } = await readConfig('settings');
  if (!options.enabled || value.analyticsOpen === false || value.maintenance)
    return { collected: false };
  if (
    !(await promotionEligible(
      input.campaign,
      input.placement,
      now,
      value.hiddenModules,
    ))
  )
    return { collected: false };
  const id = createHmac('sha256', secret)
    .update(
      [
        'campaign',
        calendarDay(now, options.timezone),
        input.campaign,
        input.placement,
        input.visit,
        input.kind,
      ].join('|'),
    )
    .digest('hex');
  return recordAnalytics(
    {
      id,
      content: input.campaign,
      placement: input.placement,
      kind: 'promotion_' + input.kind,
      module: 'home',
      device: 'unknown',
    },
    undefined,
    options,
    secret,
    now,
  );
}
export async function campaignMetrics(id, query, config, now = new Date()) {
  const options = analyticsOptions(config);
  const { from, to } = period(query, options, now);
  const [exists, rows] = await Promise.all([
    Promotion.exists({ publicId: id }),
    AnalyticsDaily.aggregate([
      {
        $match: {
          content: id,
          timezone: options.timezone,
          day: { $gte: from, $lte: to },
          kind: { $in: ['promotion_click', 'promotion_impression'] },
          expiresAt: { $gt: now },
        },
      },
      {
        $group: {
          _id: '$placement',
          impressions: {
            $sum: {
              $cond: [{ $eq: ['$kind', 'promotion_impression'] }, '$count', 0],
            },
          },
          clicks: {
            $sum: {
              $cond: [{ $eq: ['$kind', 'promotion_click'] }, '$count', 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);
  if (!exists) return null;
  const rate = ({ impressions, clicks }) =>
    impressions ? (100 * clicks) / impressions : null;
  const totals = rows.reduce(
    (result, row) => ({
      impressions: result.impressions + row.impressions,
      clicks: result.clicks + row.clicks,
    }),
    { impressions: 0, clicks: 0 },
  );
  return {
    from,
    to,
    timezone: options.timezone,
    ...totals,
    ctr: rate(totals),
    placements: rows.map(({ _id, ...row }) => ({
      placement: _id,
      ...row,
      ctr: rate(row),
    })),
  };
}
