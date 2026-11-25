import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './config/logger.js';
import {
  connectDatabase,
  disconnectDatabase,
  isDatabaseConnected,
} from './services/database.js';

async function start() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  let stopping = false;
  let databaseStartup;
  const app = createApp({
    config,
    logger,
    isDatabaseConnected: () => !stopping && isDatabaseConnected(),
  });
  const server = createServer(app);

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
    databaseStartup = connectDatabase(config.MONGODB_URI, logger);
    databaseStartup.catch(() => {
      if (stopping) return;
      logger.error(
        'MongoDB startup failed. Check the connection settings and Atlas network access.',
      );
      void shutdown('database_startup_error', 1);
    });
  });
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
