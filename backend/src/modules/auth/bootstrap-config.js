import { loadAuthConfig } from '../../config/auth.js';

export function bootstrapOptions(config, secret, env) {
  try {
    return {
      password: secret,
      bcryptCost: loadAuthConfig(config, env).bcryptCost,
    };
  } catch {
    throw Object.assign(new Error('Invalid bootstrap configuration'), {
      code: 'BOOTSTRAP_CONFIG',
    });
  }
}

const known = {
  BOOTSTRAP_CONFIG:
    'Check the authentication configuration in the root .env. The bootstrap and backend must use the same values.',
  BOOTSTRAP_MISMATCH:
    'The password entries did not match. Run the command again.',
  BOOTSTRAP_INPUT:
    'Hidden input is unavailable. Run this command in a local interactive Windows Terminal or PowerShell.',
  BOOTSTRAP_CANCELLED: 'Bootstrap cancelled.',
  SUPER_ACCOUNT_EXISTS:
    'This email already belongs to an account. Confirm ownership before changing existing access.',
  SUPER_BOOTSTRAPPED:
    'A Super Administrator already exists. Use the authorized recovery procedure.',
  SUPER_INELIGIBLE:
    'Choose an existing active, verified administrator for elevation.',
  SUPER_HASH_CONFIG:
    'Check the configured bcrypt cost. Use an integer from 10 to 14.',
};

export function bootstrapFailure(error, stage) {
  if (Object.hasOwn(known, error.code)) return known[error.code];
  if (error.code === 13 || error.code === 18)
    return 'MongoDB denied access. Check permissions to read the database, create required indexes, and write the user and audit records.';
  if (error.name === 'ZodError')
    return 'The password failed validation. Use 12 or more characters and no more than 72 UTF-8 bytes.';
  if (error.name === 'ValidationError')
    return 'MongoDB schema validation failed. Verify the application and database schema versions.';
  if ([85, 86].includes(error.code) || stage === 'indexes')
    return 'Required account or audit indexes could not be initialized. Check index compatibility and createIndex permission.';
  if (error.code === 11000)
    return 'An account or audit write conflicted with a unique index. No administrator was created by this transaction. Inspect the account and audit indexes.';
  if (
    [20, 112, 251].includes(error.code) ||
    error.hasErrorLabel?.('TransientTransactionError') ||
    error.hasErrorLabel?.('UnknownTransactionCommitResult')
  )
    return 'MongoDB could not complete the bootstrap transaction. Check the replica set and retry the idempotent command.';
  if (stage === 'config') return known.BOOTSTRAP_CONFIG;
  if (stage === 'database')
    return 'Could not access the intended MongoDB database. Check the URI database name, connectivity and credentials.';
  if (stage === 'input') return known.BOOTSTRAP_INPUT;
  return 'An unexpected internal error stopped the bootstrap. The command did not report a successful account creation.';
}

export function hiddenPassword(prompt, { stdin, stderr } = process) {
  return new Promise((resolve, reject) => {
    const previous = Boolean(stdin.isRaw);
    let value = '';
    function finish(result, cancelled) {
      stdin.off('data', read);
      stdin.setRawMode(previous);
      stdin.pause();
      stderr.write('\n');
      if (cancelled)
        reject(
          Object.assign(new Error('Cancelled'), {
            code: 'BOOTSTRAP_CANCELLED',
          }),
        );
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
