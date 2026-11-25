import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '../../utils/app-error.js';

export const randomToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token) =>
  createHash('sha256').update(token).digest('hex');
export const unauthorized = () =>
  new AppError(401, 'AUTH_REQUIRED', 'Please sign in to continue.');

export function issueAccessToken(config, user, session) {
  return jwt.sign({ sid: session.publicId }, config.accessSecret, {
    algorithm: 'HS256',
    subject: user.publicId,
    issuer: config.issuer,
    audience: config.audience,
    jwtid: randomUUID(),
    expiresIn: config.accessTtl,
  });
}

export function verifyAccessToken(config, token) {
  let payload;
  try {
    payload = jwt.verify(token, config.accessSecret, {
      algorithms: ['HS256'],
      issuer: config.issuer,
      audience: config.audience,
      maxAge: config.accessTtl,
    });
  } catch {
    throw unauthorized();
  }

  if (
    !payload ||
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string' ||
    typeof payload.exp !== 'number'
  )
    throw unauthorized();
  return payload;
}

export function readRefreshToken(token) {
  if (typeof token !== 'string') return null;
  const match =
    /^([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(
      token,
    );
  if (!match) return null;
  return { publicId: match[1], hash: tokenHash(match[2]) };
}
