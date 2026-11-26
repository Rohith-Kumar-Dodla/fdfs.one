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

async function start() {
  const config = loadConfig();
  requireNamedDatabase(config.MONGODB_URI);
  const authConfig = loadAuthConfig(config);
  const logger = createLogger(config.LOG_LEVEL);
  let stopping = false;
  let indexesReady = false;
  let databaseStartup;
  const available = () => !stopping && indexesReady && isDatabaseConnected();
  let realtime;
  const app = createApp({
    config,
    logger,
    isDatabaseConnected: available,
    authConfig,
    authOptions: { available },
    phase22Options: {
      liveNotify: (event) => realtime.notify(event),
      reminderLead: config.LIVE_REMINDER_LEAD_MINUTES,
      mediaProvider: createCloudinaryProvider(loadMediaConfig()),
    },
  });
  const server = createServer(app);
  realtime = attachLiveSockets(server, {
    authConfig,
    origins: config.CORS_ORIGINS,
    available,
    logger,
  });
  const stopReminders = startReminderWorker({
    deliver: createReminderDelivery(authConfig, logger),
    intervalMs: config.LIVE_REMINDER_INTERVAL_MS,
    available: () => Boolean(authConfig.smtp && available()),
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
      const reminderDrain = stopReminders();
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

  server.listen(config.PORT, () => {
    if (stopping) return;
    logger.info({ port: config.PORT }, 'HTTP server listening');
    databaseStartup = connectDatabase(config.MONGODB_URI, logger).then(
      async () => {
        if (stopping) return;
        await Promise.all([
          initializeAuthIndexes(),
          initializePhase22Indexes(),
          initializeTalentIndexes(),
          initializeFilmIndexes(),
          initializePodcastIndexes(),
          initializeLiveIndexes(),
        ]);
        indexesReady = true;
      },
    );
    databaseStartup.catch(() => {
      if (stopping) return;
      logger.error(
        'Database startup failed. Check MongoDB connectivity and index permissions.',
      );
      void shutdown('database_startup_error', 1);
    });
  });
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
