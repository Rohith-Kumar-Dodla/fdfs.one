import { loadConfig, requireNamedDatabase } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../services/database.js';
import { bootstrapSuper } from '../admin/roles.js';
import { initializePhase22Indexes } from '../admin/routes.js';
import { initializeAuthIndexes } from './models.js';
import { normalizedEmail } from './schemas.js';

async function main() {
  const [flag, target, confirmFlag, confirmation, ...extra] =
    process.argv.slice(2);
  const email = normalizedEmail.safeParse(target);
  if (
    flag !== '--email' ||
    confirmFlag !== '--confirm' ||
    !email.success ||
    confirmation?.trim().toLowerCase() !== email.data ||
    extra.length
  ) {
    console.error(
      'Usage: npm run auth:bootstrap-super -w @fdfs/backend -- --email <email> --confirm <email>',
    );
    process.exitCode = 1;
    return;
  }
  try {
    const config = loadConfig();
    requireNamedDatabase(config.MONGODB_URI);
    await connectDatabase(config.MONGODB_URI, createLogger(config.LOG_LEVEL));
    await Promise.all([initializeAuthIndexes(), initializePhase22Indexes()]);
    await bootstrapSuper(email.data);
    console.log('Super Administrator role assigned. Sign in again.');
  } catch (error) {
    console.error(
      error.code?.startsWith?.('SUPER_')
        ? error.message
        : 'Super Administrator bootstrap failed. Check database configuration.',
    );
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}
await main();
