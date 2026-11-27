import { can } from '../../../../shared/admin.js';
import { User } from '../auth/models.js';
import { Movie, MovieRequest, ReviewReport } from '../reviews/models.js';
import { publicMovieFilter } from '../reviews/movies.js';
import { Film } from '../films/models.js';
import { visibility } from '../live/events.js';
import { LiveEvent } from '../live/models.js';
import { ChatReport } from '../live/chat.js';
import { CommentReport } from '../podcasts/comments.js';
import { PodcastEpisode } from '../podcasts/models.js';
import { findShow } from '../podcasts/read.js';
import { Submission } from '../submissions/workflow.js';
import { Personality } from '../talent/models.js';
import { MediaAsset } from '../media/assets.js';
import { AuditLog } from './audit.js';

export async function overview(account) {
  const now = new Date();
  const published = { status: 'published' };
  const released = { ...published, releaseAt: { $lte: now } };
  const live = visibility(now);
  const content = (module) => can(account, 'content', module);
  const metrics = {};
  if (can(account, 'users'))
    Object.assign(metrics, {
      users: User.countDocuments(),
      verified: User.countDocuments({ emailVerifiedAt: { $type: 'date' } }),
      unverified: User.countDocuments({ emailVerifiedAt: null }),
      suspended: User.countDocuments({ status: 'suspended' }),
    });
  if (content('independent'))
    metrics.cinema = Film.countDocuments({
      ...released,
      classification: 'independent',
    });
  if (content('original'))
    metrics.originals = Film.countDocuments({
      ...released,
      classification: 'original',
    });
  if (content('podcasts'))
    metrics.episodes = findShow(true).then((show) =>
      show
        ? PodcastEpisode.countDocuments({
            ...released,
            publicationAt: { $lte: now },
            show: show._id,
          })
        : 0,
    );
  if (content('movies')) {
    metrics.movies = Movie.countDocuments(publicMovieFilter(now));
    metrics.movieRequests = MovieRequest.countDocuments({ status: 'pending' });
  }
  if (content('talent')) metrics.talent = Personality.countDocuments(published);
  if (content('live'))
    Object.assign(metrics, {
      events: LiveEvent.countDocuments(live),
      scheduled: LiveEvent.countDocuments({ ...live, broadcast: 'scheduled' }),
      live: LiveEvent.countDocuments({ ...live, broadcast: 'live' }),
      replays: LiveEvent.countDocuments({
        ...live,
        broadcast: 'ended',
        'replay.provider': { $exists: true },
      }),
    });
  const allowed = [
    ['film', 'independent'],
    ['live', 'live'],
    ['talent', 'talent'],
  ]
    .filter(([, module]) => content(module))
    .map(([category]) => category);
  if (can(account, 'moderation') || allowed.length) {
    metrics.reviewQueue = Submission.countDocuments({
      status: { $in: ['submitted', 'under_review'] },
      ...(!can(account, 'moderation') && { category: { $in: allowed } }),
    });
  }
  if (can(account, 'moderation')) {
    metrics.reports = Promise.all([
      CommentReport.countDocuments({ status: 'open' }),
      ChatReport.countDocuments({ resolvedAt: null }),
      ReviewReport.countDocuments({ status: 'open' }),
    ]).then(([comments, chat, reviews]) => comments + chat + reviews);
  }
  if (can(account, 'media'))
    metrics.images = MediaAsset.countDocuments({
      status: 'active',
      purpose: 'library',
    });
  if (can(account, 'audit')) {
    metrics.auditEvents = AuditLog.countDocuments();
    metrics.recentActivity = AuditLog.find()
      .sort({ createdAt: -1, _id: -1 })
      .limit(8)
      .select('action targetType targetId createdAt')
      .lean();
  }
  return Object.fromEntries(
    await Promise.all(
      Object.entries(metrics).map(async ([key, count]) => [key, await count]),
    ),
  );
}
