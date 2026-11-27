import { AppError } from '../../utils/app-error.js';
import {
  beginAccountWrite,
  requireCurrentAccount,
} from './account-mutations.js';
import { Session, User } from './models.js';
import {
  issueAccessToken,
  randomToken,
  readRefreshToken,
  tokenHash,
  unauthorized,
  verifyAccessToken,
} from './tokens.js';

const overlapMs = 5000;
const maxRotations = 8192;
const active = (now) => ({ revokedAt: null, expiresAt: { $gt: now } });

export function createSessionService(config) {
  function credentials(user, session, secret) {
    return {
      accessToken: issueAccessToken(config, user, session),
      sessionId: session.publicId,
      refreshToken: `${session.publicId}.${secret}`,
      expiresAt: session.expiresAt,
    };
  }

  return {
    async open(user, userAgent = '') {
      const release = beginAccountWrite(user.publicId);
      try {
        await requireCurrentAccount(user);
        const secret = randomToken();
        const now = new Date();
        const session = await Session.create({
          userId: user._id,
          authVersion: user.authVersion,
          refreshHash: tokenHash(secret),
          userAgent: userAgent.slice(0, 240),
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + config.sessionMs),
        });
        return credentials(user, session, secret);
      } finally {
        release();
      }
    },

    async authenticate(token) {
      const { sub, sid } = verifyAccessToken(config, token);
      const user = await User.findOne({ publicId: sub }).select('+authVersion');
      if (!user || user.status === 'deleted') throw unauthorized();
      if (!user.emailVerifiedAt)
        throw new AppError(
          403,
          'EMAIL_NOT_VERIFIED',
          'Verify your email to continue.',
        );
      const session = await Session.findOne({
        publicId: sid,
        userId: user._id,
        authVersion: user.authVersion,
        ...active(new Date()),
      });
      if (!session) throw unauthorized();
      return { user, session };
    },

    async refresh(token) {
      const parsed = readRefreshToken(token);
      if (!parsed) throw unauthorized();
      const { publicId, hash } = parsed;
      const now = new Date();
      const filter = { publicId, ...active(now) };
      const session =
        await Session.findOne(filter).select('+refreshHash +used');
      if (!session) throw unauthorized();
      if (session.refreshHash !== hash) {
        const used = session.used.find((entry) => entry.hash === hash);
        if (!used) throw unauthorized();
        if (now.getTime() - used.usedAt.getTime() < overlapMs) {
          throw new AppError(
            409,
            'REFRESH_IN_PROGRESS',
            'The session was just refreshed. Try again.',
          );
        }
        await Session.updateOne(filter, { $set: { revokedAt: now } });
        throw unauthorized();
      }

      const user = await User.findById(session.userId).select('+authVersion');
      if (
        !user ||
        user.status !== 'active' ||
        !user.emailVerifiedAt ||
        user.authVersion !== session.authVersion
      )
        throw unauthorized();
      if (session.used.length >= maxRotations) {
        await Session.updateOne(filter, { $set: { revokedAt: now } });
        throw unauthorized();
      }

      const secret = randomToken();
      const updated = await Session.findOneAndUpdate(
        { ...filter, refreshHash: hash },
        {
          $set: { refreshHash: tokenHash(secret), lastSeenAt: now },
          $push: { used: { hash, usedAt: now } },
        },
        { returnDocument: 'after' },
      );
      if (!updated)
        throw new AppError(
          409,
          'REFRESH_IN_PROGRESS',
          'The session changed. Try again.',
        );
      return credentials(user, updated, secret);
    },

    async close(token) {
      const parsed = readRefreshToken(token);
      if (!parsed) return;
      const { publicId, hash } = parsed;
      await Session.updateOne(
        {
          publicId,
          ...active(new Date()),
          $or: [{ refreshHash: hash }, { 'used.hash': hash }],
        },
        { $set: { revokedAt: new Date() } },
      );
    },

    async closeAll(user) {
      await User.updateOne(
        { _id: user._id, authVersion: user.authVersion },
        { $inc: { authVersion: 1 } },
      );
    },

    async list(user, current) {
      const sessions = await Session.find({
        userId: user._id,
        authVersion: user.authVersion,
        ...active(new Date()),
      }).sort({ lastSeenAt: -1 });
      return sessions.map(
        ({ publicId, userAgent, lastSeenAt, createdAt, expiresAt }) => ({
          id: publicId,
          userAgent,
          lastSeenAt,
          createdAt,
          expiresAt,
          current: publicId === current.publicId,
        }),
      );
    },

    async revoke(user, publicId) {
      const { matchedCount } = await Session.updateOne(
        {
          userId: user._id,
          authVersion: user.authVersion,
          publicId,
          ...active(new Date()),
        },
        { $set: { revokedAt: new Date() } },
      );
      if (!matchedCount)
        throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.');
    },
  };
}
