import { initializePersonalIndexes } from './modules/personal/models.js';
import {
  createPersonalNotice,
  startTalentNoticeWorker,
} from './modules/personal/notices.js';
import { Promotion } from './modules/site/promotions.js';
import { initializeReviewsIndexes } from './modules/reviews/models.js';
import { createPresenceStore } from './modules/operations/presence.js';
import { createOperationsHealth } from './modules/operations/platform.js';
import { initializeOperationsIndexes } from './modules/operations/routes.js';
import {
  startSupportWorker,
  supportMailer,
} from './modules/operations/support-email.js';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadAuthConfig } from './config/auth.js';
import { loadConfig, requireNamedDatabase } from './config/env.js';
import { createLogger } from './config/logger.js';
import { initializeAuthIndexes } from './modules/auth/models.js';
import { initializePhase22Indexes } from './modules/admin/routes.js';
import { initializeTalentIndexes } from './modules/talent/models.js';
import { initializeFilmIndexes } from './modules/films/models.js';
import { initializeLiveIndexes } from './modules/live/routes.js';
import { attachLiveSockets } from './modules/live/socket.js';
import { startReminderWorker } from './modules/live/reminders.js';
import { createReminderDelivery } from './modules/live/email.js';
import { createMailTransport } from './services/email.js';
import { initializePodcastIndexes } from './modules/podcasts/routes.js';
import {
  createCloudinaryProvider,
  loadMediaConfig,
} from './modules/media/provider.js';
import {
  connectDatabase,
  disconnectDatabase,
  isDatabaseConnected,
} from './services/database.js';

async function start(config, authConfig) {
  const mailTransport = createMailTransport(authConfig);
  const logger = createLogger(config.LOG_LEVEL);
  let stopping = false;
  let indexesReady = false;
  let databaseStartup;
  const available = () => !stopping && indexesReady && isDatabaseConnected();
  const health = createOperationsHealth();
  const presence = createPresenceStore({
    heartbeatMs: config.PRESENCE_HEARTBEAT_MS,
    staleMs: config.PRESENCE_STALE_MS,
  });
  let realtime;
  const app = createApp({
    config,
    logger,
    isDatabaseConnected: available,
    authConfig,
    authOptions: { available, mailTransport },
    phase22Options: {
      liveNotify: (event) => realtime.notify(event),
      reminderLead: config.LIVE_REMINDER_LEAD_MINUTES,
      mediaProvider: createCloudinaryProvider(loadMediaConfig(), (status) =>
        health.set('cloudinary', status),
      ),
      presence,
      health,
      noticeNotify: (id) => realtime.notice(id),
    },
  });
  const server = createServer(app);
  realtime = attachLiveSockets(server, {
    chatEnabled: config.LIVE_CHAT_ENABLED,
    authConfig,
    origins: config.CORS_ORIGINS,
    presence,
    available,
    logger,
  });
  const stopSupport = startSupportWorker(
    supportMailer(
      authConfig,
      logger,
      mailTransport,
      config.SUPPORT_STAFF_EMAIL,
    ),
    {
      available: () => Boolean(mailTransport && available()),
      logger,
      attempts: config.SUPPORT_EMAIL_ATTEMPTS,
      health: health.set,
    },
  );
  const notify = (id) => realtime.notice(id);
  const stopTalent = startTalentNoticeWorker({
    available,
    notify,
    logger,
    health: (status) => health.set('talentNotices', status),
  });
  const stopReminders = startReminderWorker({
    onDelivered: (user, job, event) =>
      createPersonalNotice(
        user.publicId,
        'reminder:' + String(job._id) + ':' + job.version,
        'live_reminder',
        '/live/' + event.slug,
        notify,
      ).catch(() =>
        logger.warn('Live reminder notification could not be saved'),
      ),
    health: (status) => health.set('reminderWorker', status),
    deliver: createReminderDelivery(authConfig, logger, mailTransport),
    intervalMs: config.LIVE_REMINDER_INTERVAL_MS,
    available: () => Boolean(mailTransport && available()),
    logger,
  });

  async function shutdown(reason, exitCode = 0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = exitCode;
    logger.info({ reason }, 'Shutdown started');
    const timeout = setTimeout(() => {
      logger.fatal('Shutdown timed out');
      process.exit(1);
    }, 20000).unref();

    try {
      realtime.close();
      const reminderDrain = Promise.all([
        stopReminders(),
        stopSupport(),
        stopTalent(),
      ]);
      if (server.listening) {
        const drainDeadline = setTimeout(() => {
          logger.warn(
            'Closing remaining HTTP connections after drain deadline',
          );
          server.closeAllConnections();
        }, 5000).unref();

        try {
          await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          });
        } finally {
          clearTimeout(drainDeadline);
        }
      }
      await reminderDrain;
      await databaseStartup?.catch(() => {});
      await disconnectDatabase();
      logger.info('Shutdown complete');
      clearTimeout(timeout);
    } catch {
      process.exitCode = 1;
      logger.error('Shutdown failed');
    }
  }

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  server.on('error', (error) => {
    logger.error({ code: error.code }, 'HTTP server failed');
    void shutdown('http_error', 1);
  });

  server.listen(config.PORT, '0.0.0.0', () => {
    if (stopping) return;
    health.set('sockets', 'healthy');
    logger.info({ port: config.PORT }, 'HTTP server listening');
    databaseStartup = connectDatabase(
      config.MONGODB_URI,
      logger,
      config.MONGODB_MAX_POOL_SIZE,
    ).then(async () => {
      if (stopping) return;
      await Promise.all([
        initializeAuthIndexes(),
        initializePhase22Indexes(),
        initializeTalentIndexes(),
        initializeFilmIndexes(),
        initializePodcastIndexes(),
        initializeLiveIndexes(),
        initializeOperationsIndexes(),
        initializeReviewsIndexes(),
        Promotion.createIndexes(),
        initializePersonalIndexes(),
      ]);
      indexesReady = true;
    });
    databaseStartup.catch(() => {
      if (stopping) return;
      logger.error(
        'Database startup failed. Check MongoDB connectivity and index permissions.',
      );
      void shutdown('database_startup_error', 1);
    });
  });
}

try {
  const config = loadConfig();
  requireNamedDatabase(config.MONGODB_URI, config.MONGODB_EXPECTED_DATABASE);
  const authConfig = loadAuthConfig(config);
  await start(config, authConfig).catch(() => {
    console.error('Application startup failed. See deployment diagnostics.');
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
