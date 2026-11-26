import { loadConfig, requireNamedDatabase } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../services/database.js';
import { bootstrapSuper } from '../admin/roles.js';
import { initializePhase22Indexes } from '../admin/routes.js';
import { initializeAuthIndexes, User } from './models.js';
import { normalizedEmail, password } from './schemas.js';

function hidden(prompt) {
  const { stdin, stderr } = process;
  return new Promise((resolve, reject) => {
    const previous = stdin.isRaw;
    let value = '';
    function finish(result, cancelled) {
      stdin.off('data', read);
      stdin.setRawMode(previous);
      stdin.pause();
      stderr.write('\n');
      if (cancelled) reject(new Error('Cancelled'));
      else resolve(result);
    }
    function read(chunk) {
      for (const symbol of chunk) {
        if (symbol === '\u0003' || symbol === '\u0004') return finish('', true);
        if (symbol === '\r' || symbol === '\n') return finish(value, false);
        if (symbol === '\u007f' || symbol === '\b')
          value = [...value].slice(0, -1).join('');
        else if (symbol >= ' ' && value.length < 256) value += symbol;
      }
    }
    stderr.write(prompt);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.on('data', read);
    stdin.resume();
  });
}

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
  try {
    const config = loadConfig();
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
    if (elevate) {
      if (
        (await hidden(
          'Type the existing administrator email to confirm authorized elevation: ',
        )) !== email.data
      )
        throw new Error('Cancelled');
    } else {
      secret = await hidden('New unique administrator password: ');
      if (!password.safeParse(secret).success) {
        console.error('Use at least 12 characters and at most 72 UTF-8 bytes.');
        process.exitCode = 1;
        return;
      }
      if ((await hidden('Repeat password: ')) !== secret)
        throw new Error('Cancelled');
    }
    await Promise.all([initializeAuthIndexes(), initializePhase22Indexes()]);
    await bootstrapSuper(email.data, {
      password: secret,
      bcryptCost: config.BCRYPT_COST,
    });
    console.log('Super Administrator is ready. Sign in through /admin.');
  } catch (error) {
    console.error(
      error.code?.startsWith?.('SUPER_')
        ? error.message
        : error.message === 'Cancelled'
          ? 'Bootstrap cancelled.'
          : 'Super Administrator bootstrap failed. Check database configuration.',
    );
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}
await main();
