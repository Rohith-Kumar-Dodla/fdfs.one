import { AppError } from '../../utils/app-error.js';
import { User } from './models.js';
import { unauthorized } from './tokens.js';

// The backend runs as a single instance. A deletion drains admitted writes
// before sweeping the account and rejects new writes until the sweep commits.
const accounts = new Map();

function stateFor(id) {
  if (!accounts.has(id)) accounts.set(id, { writes: 0 });
  return accounts.get(id);
}

function deleting() {
  return new AppError(
    409,
    'ACCOUNT_DELETION_IN_PROGRESS',
    'Account deletion is in progress.',
  );
}

export async function requireCurrentAccount(user) {
  if (
    !(await User.exists({
      _id: user._id,
      authVersion: user.authVersion || { $in: [0, null] },
      status: user.status,
    }))
  )
    throw unauthorized();
}

export function beginAccountWrite(id) {
  const state = stateFor(id);
  if (state.deleting) throw deleting();
  state.writes++;
  return () => {
    if (--state.writes) return;
    if (state.deleting) state.drained?.();
    else accounts.delete(id);
  };
}

export async function duringAccountDeletion(id, remove) {
  const state = stateFor(id);
  if (state.deleting) throw deleting();
  state.deleting = true;
  try {
    if (state.writes)
      await new Promise((resolve) => {
        state.drained = resolve;
      });
    return await remove();
  } finally {
    accounts.delete(id);
  }
}
