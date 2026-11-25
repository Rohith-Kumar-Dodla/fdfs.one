import { z } from 'zod';
import { parseYouTube } from '../../../../shared/youtube.js';

const providers = { youtube: parseYouTube };
const videoInput = z.strictObject({
  provider: z.enum(Object.keys(providers)),
  sourceUrl: z.string().max(2048),
  playbackType: z.enum(['on_demand', 'scheduled_live', 'live', 'replay']),
  availability: z
    .enum(['unknown', 'available', 'unavailable'])
    .default('unknown'),
  durationSeconds: z.number().int().positive().optional(),
  thumbnail: z
    .strictObject({
      url: z.url({ protocol: /^https$/ }),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
});

export const videoSource = videoInput.transform(
  ({ provider, sourceUrl, ...metadata }, ctx) => {
    const result = providers[provider](sourceUrl);
    if (!result) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceUrl'],
        message: 'Unsupported video URL',
      });
      return z.NEVER;
    }
    return { ...result, ...metadata };
  },
);
