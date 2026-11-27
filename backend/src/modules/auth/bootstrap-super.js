import { loadConfig, requireNamedDatabase } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../services/database.js';
import { bootstrapSuper } from '../admin/roles.js';
import { AuditLog } from '../admin/audit.js';
import {
  bootstrapFailure,
  bootstrapOptions,
  hiddenPassword,
} from './bootstrap-config.js';
import { User } from './models.js';
import { normalizedEmail, password } from './schemas.js';

async function main() {
  const [flag, target, confirmFlag, confirmation, option, ...extra] =
    process.argv.slice(2);
  const email = normalizedEmail.safeParse(target);
  const elevate = option === '--elevate-existing';
  if (
    flag !== '--email' ||
    confirmFlag !== '--confirm' ||
    !email.success ||
    confirmation?.trim().toLowerCase() !== email.data ||
    (option && !elevate) ||
    extra.length
  ) {
    console.error(
      'Usage: npm run auth:bootstrap-super -w @fdfs/backend -- --email <email> --confirm <email> [--elevate-existing]',
    );
    process.exitCode = 1;
    return;
  }
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    console.error(
      'Run this command in a local interactive terminal. Password entry is hidden.',
    );
    process.exitCode = 1;
    return;
  }
  let stage = 'config';
  try {
    const config = loadConfig();
    const options = bootstrapOptions(config);
    stage = 'database';
    requireNamedDatabase(config.MONGODB_URI);
    await connectDatabase(config.MONGODB_URI, createLogger(config.LOG_LEVEL));
    const existing = await User.findOne({ email: email.data })
      .select('status roles emailVerifiedAt +superSeed')
      .lean();
    if (
      existing?.superSeed &&
      existing.status === 'active' &&
      existing.emailVerifiedAt &&
      existing.roles.includes('super_admin')
    ) {
      console.log('The verified Super Administrator already exists.');
      return;
    }
    if (existing && !elevate) {
      console.error(
        'This email already exists. Confirm account ownership before using --elevate-existing for an active, verified administrator.',
      );
      process.exitCode = 1;
      return;
    }
    if (
      (!existing && elevate) ||
      (existing &&
        (existing.status !== 'active' ||
          !existing.emailVerifiedAt ||
          !existing.roles.includes('admin')))
    ) {
      console.error(
        'Existing-account elevation requires an active, verified administrator.',
      );
      process.exitCode = 1;
      return;
    }
    let secret;
    stage = 'input';
    if (elevate) {
      if (
        (await hiddenPassword(
          'Type the existing administrator email to confirm authorized elevation: ',
        )) !== email.data
      )
        throw Object.assign(new Error('Cancelled'), {
          code: 'BOOTSTRAP_CANCELLED',
        });
    } else {
      secret = await hiddenPassword('New unique administrator password: ');
      if (!password.safeParse(secret).success) {
        console.error('Use at least 12 characters and at most 72 UTF-8 bytes.');
        process.exitCode = 1;
        return;
      }
      if ((await hiddenPassword('Repeat password: ')) !== secret)
        throw Object.assign(new Error('Confirmation failed'), {
          code: 'BOOTSTRAP_MISMATCH',
        });
    }
    stage = 'indexes';
    await Promise.all([User.createIndexes(), AuditLog.createIndexes()]);
    stage = 'write';
    await bootstrapSuper(email.data, { ...options, password: secret });
    console.log('Super Administrator is ready. Sign in through /admin.');
  } catch (error) {
    console.error(bootstrapFailure(error, stage));
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}
await main();
