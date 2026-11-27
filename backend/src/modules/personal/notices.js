import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { User } from '../auth/models.js';
import { Notice } from '../operations/support-models.js';
import { readConfig } from '../site/service.js';
import { contentByTalent, models } from './catalog.js';
import { Following, Preferences } from './models.js';

export async function createPersonalNotice(
  owner,
  key,
  type,
  path,
  notify,
  session,
) {
  try {
    const result = await Notice.updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          owner,
          type,
          path,
          publicId: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true, timestamps: false, session },
    );
    if (result.upsertedCount) notify?.(owner);
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
}

export async function scanReleaseNotices({
  after,
  notify,
  now = new Date(),
  limit = 20,
} = {}) {
  const { value: settings } = await readConfig('settings');
  if (settings.maintenance) return null;
  const opted = await Preferences.find({
    talentNotices: true,
    ...(after && { _id: { $gt: after } }),
  })
    .sort({ _id: 1 })
    .limit(limit)
    .select('_id')
    .lean();
  const active = await User.find({
    _id: { $in: opted.map((row) => row._id) },
    status: 'active',
  })
    .select('publicId')
    .lean();
  for (const account of active) {
    const follows = await Following.find({ owner: account._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(40)
      .lean();
    const people = await models.talent
      .find({
        status: 'published',
        publicId: { $in: follows.map((row) => row.talent) },
      })
      .select('publicId')
      .lean();
    const map = new Map(follows.map((row) => [row.talent, row]));
    const since = new Date(+now - 7 * 86400000);
    const releases = await contentByTalent(
      people.map((row) => row._id),
      { since, settings, now },
    );
    for (const item of releases.slice(0, 24)) {
      const eligible = people.filter(
        (row) =>
          item.people.some((id) => String(id) === String(row._id)) &&
          map.get(row.publicId).createdAt <= item.when,
      );
      if (!eligible.length) continue;
      let delivered = false;
      await mongoose.connection.transaction(async (session) => {
        // Serialize with preference edits. Recheck at least one qualifying follow.
        const gate = await Preferences.updateOne(
          { _id: account._id, talentNotices: true },
          { $inc: { serial: 1 } },
          { session },
        );
        if (!gate.matchedCount) return;
        const follow = await Following.exists({
          owner: account._id,
          talent: { $in: eligible.map((row) => row.publicId) },
          createdAt: { $lte: item.when },
        }).session(session);
        if (!follow) return;
        await createPersonalNotice(
          account.publicId,
          'talent:' + account.publicId + ':' + item.module + ':' + item.target,
          'talent_release',
          item.path,
          () => {
            delivered = true;
          },
          session,
        );
      });
      if (delivered) notify?.(account.publicId);
    }
  }
  return opted.length === limit ? opted.at(-1)._id : null;
}

export function startTalentNoticeWorker({ available, notify, logger, health }) {
  let job, cursor;
  const timer = setInterval(() => {
    if (job || !available()) return;
    job = scanReleaseNotices({ after: cursor, notify })
      .then((position) => {
        cursor = position;
        health?.('healthy');
      })
      .catch(() => {
        logger.warn('Talent release notification scan failed');
        health?.('degraded');
      })
      .finally(() => {
        job = undefined;
      });
  }, 60000).unref();
  return async () => {
    clearInterval(timer);
    await job;
  };
}
