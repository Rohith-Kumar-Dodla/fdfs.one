import { loadConfig, requireNamedDatabase } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../services/database.js';
import { createMediaService } from './assets.js';
import { createCloudinaryProvider, loadMediaConfig } from './provider.js';

async function cleanup() {
  const config = loadConfig();
  requireNamedDatabase(config.MONGODB_URI);
  const cloud = loadMediaConfig();
  if (!cloud) {
    console.error('Configure Cloudinary before running media cleanup.');
    process.exitCode = 1;
    return;
  }
  const logger = createLogger(config.LOG_LEVEL);
  try {
    await connectDatabase(config.MONGODB_URI, logger);
    const result = await createMediaService(
      createCloudinaryProvider(cloud),
      logger,
    ).cleanupBatch();
    console.log(JSON.stringify(result));
    if (result.completed !== result.attempted) process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

cleanup().catch(() => {
  console.error('Media cleanup could not complete.');
  process.exitCode = 1;
});
