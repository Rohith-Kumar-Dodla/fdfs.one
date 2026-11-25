import { AppError } from '../../utils/app-error.js';
import { unauthorized } from './tokens.js';

export function requireAuthentication(sessions) {
  return async (req, res, next) => {
    const value = req.get('Authorization');
    const token = /^Bearer (\S+)$/i.exec(value ?? '')?.[1];
    if (!token) throw unauthorized();
    req.auth = await sessions.authenticate(token);
    next();
  };
}

export function requireActiveAccount(req, res, next) {
  if (!req.auth) throw unauthorized();
  if (req.auth.user.status !== 'active') {
    throw new AppError(
      403,
      'ACCOUNT_RESTRICTED',
      'This account is restricted.',
    );
  }
  next();
}

export function requireVerifiedEmail(req, res, next) {
  if (!req.auth) throw unauthorized();
  if (!req.auth.user.emailVerifiedAt) {
    throw new AppError(
      403,
      'EMAIL_NOT_VERIFIED',
      'Verify your email to continue.',
    );
  }
  next();
}

export function requireRoles(...allowed) {
  return (req, res, next) => {
    if (!req.auth) throw unauthorized();
    if (!allowed.some((role) => req.auth.user.roles.includes(role))) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission.');
    }
    next();
  };
}

export function requireOwner(getOwnerId) {
  return async (req, res, next) => {
    if (!req.auth) throw unauthorized();
    if (String(await getOwnerId(req)) !== String(req.auth.user._id)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission.');
    }
    next();
  };
}
