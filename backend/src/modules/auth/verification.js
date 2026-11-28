import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '../../utils/app-error.js';
import { User } from './models.js';

const codeMs = 10 * 60_000;
const windowMs = 30 * 60_000;
const cooldownMs = 60_000;
const sessionSeconds = 60 * 60;
const maxRequests = 3;
const maxAttempts = 5;

const signIn = () =>
  new AppError(
    401,
    'VERIFICATION_SIGN_IN_REQUIRED',
    'Sign in to continue verification.',
  );

function pendingFilter(publicId, authVersion) {
  return {
    publicId,
    authVersion: authVersion === 0 ? { $in: [0, null] } : authVersion,
    status: 'active',
    emailVerifiedAt: null,
    roles: { $ne: 'super_admin' },
  };
}

function dates(account, now) {
  const requests =
    account.emailVerification?.requests ??
    (account.verification?.issuedAt ? [account.verification.issuedAt] : []);
  return requests.map(Number).filter((at) => at + windowMs > now);
}

function verificationState(account, now) {
  const local = account.email.split('@')[0];
  const { code, delivery } = account.emailVerification ?? {};
  const requests = dates(account, now);
  const windowFull = requests.length >= maxRequests;
  const retryAt = Math.max(
    (requests.at(-1) ?? 0) + cooldownMs,
    windowFull ? requests[0] + windowMs : 0,
  );
  return {
    maskedEmail: local[0] + '•••@' + account.email.split('@')[1],
    serverTime: now,
    retryAt: retryAt > now ? retryAt : null,
    remainingRequests: maxRequests - requests.length,
    expiresAt: code?.expiresAt?.getTime() ?? null,
    attemptsExhausted: (code?.attempts ?? 0) >= maxAttempts,
    delivery:
      delivery === 'pending' && (requests.at(-1) ?? 0) + cooldownMs <= now
        ? 'failed'
        : (delivery ?? 'none'),
  };
}

export function createVerificationService(config, sendEmail) {
  const key = (label) =>
    createHmac('sha256', config.accessSecret)
      .update('fdfs:email-verification:' + label)
      .digest();
  const sessionKey = key('session:v1');
  const digestKey = key('code:v1');
  const audience = config.audience + ':email-verification';
  const digest = (account, id, code) =>
    createHmac('sha256', digestKey)
      .update(JSON.stringify([account.publicId, id, code]))
      .digest();

  async function pending(filter) {
    const account = await User.findOne(filter).select(
      '+emailVerification +verification',
    );
    if (!account) throw signIn();
    return account;
  }

  function identity(user) {
    if (user.emailVerifiedAt || user.roles.includes('super_admin'))
      throw signIn();
    return pendingFilter(user.publicId, user.authVersion);
  }

  function state(account) {
    return verificationState(account, Date.now());
  }

  async function issue(filter, requestId, initial = false) {
    let account = await pending(filter);
    const now = Date.now();
    const current = verificationState(account, now);
    if (initial && (account.emailVerification?.requestId || current.retryAt))
      return { state: current };
    if (current.retryAt) return { state: current, limited: true };

    const sendId = randomUUID();
    const previous = account.emailVerification;
    // Reserve the sending slot before contacting the provider. Update the
    // active code only after acceptance so a failed resend preserves it.
    const { modifiedCount } = await User.updateOne(
      {
        ...filter,
        'emailVerification.requestId': previous?.requestId ?? null,
      },
      {
        $set: {
          'emailVerification.requestId': sendId,
          'emailVerification.delivery': 'pending',
          'emailVerification.requests': [...dates(account, now), now].map(
            (at) => new Date(at),
          ),
        },
      },
    );
    if (!modifiedCount)
      return { state: state(await pending(filter)), limited: !initial };

    let code;
    do {
      code = String(randomInt(1_000_000)).padStart(6, '0');
    } while (
      previous?.code &&
      digest(account, previous.code.id, code).toString('hex') ===
        previous.code.digest
    );

    const accepted = await sendEmail('verification', account.email, code, {
      requestId,
    });
    await User.updateOne(
      {
        ...filter,
        'emailVerification.requestId': sendId,
      },
      {
        $set: {
          'emailVerification.delivery': accepted ? 'accepted' : 'failed',
          ...(accepted && {
            'emailVerification.code': {
              id: sendId,
              digest: digest(account, sendId, code).toString('hex'),
              expiresAt: new Date(Date.now() + codeMs),
              attempts: 0,
            },
          }),
        },
        ...(accepted && { $unset: { verification: 1 } }),
      },
    );
    account = await pending(filter);
    return { state: state(account), failed: !accepted };
  }

  return {
    issue,
    identity,
    async status(filter) {
      return state(await pending(filter));
    },
    ticket(user) {
      identity(user);
      return {
        refreshToken: jwt.sign({ version: user.authVersion }, sessionKey, {
          algorithm: 'HS256',
          subject: user.publicId,
          issuer: config.issuer,
          audience,
          expiresIn: sessionSeconds,
        }),
        expiresAt: new Date(Date.now() + sessionSeconds * 1000),
      };
    },
    fromTicket(ticket) {
      try {
        const claims = jwt.verify(ticket, sessionKey, {
          algorithms: ['HS256'],
          issuer: config.issuer,
          audience,
          maxAge: sessionSeconds,
        });
        if (typeof claims.sub === 'string' && Number.isInteger(claims.version))
          return pendingFilter(claims.sub, claims.version);
      } catch {
        // Expired and invalid verification tickets both require fresh password proof.
      }
      throw signIn();
    },
    async verify(filter, candidate, requestId) {
      const account = await pending(filter);
      const code = account.emailVerification?.code;
      if (!code || code.expiresAt.getTime() <= Date.now())
        throw new AppError(
          400,
          'VERIFICATION_CODE_EXPIRED',
          'This code has expired. Request a new code.',
          state(account),
        );
      if (code.attempts >= maxAttempts)
        throw new AppError(
          400,
          'VERIFICATION_ATTEMPTS_EXHAUSTED',
          'Too many incorrect codes. Request a new code.',
          state(account),
        );

      const valid = timingSafeEqual(
        Buffer.from(code.digest, 'hex'),
        digest(account, code.id, candidate),
      );
      const result = await User.updateOne(
        {
          ...filter,
          'emailVerification.code.id': code.id,
          'emailVerification.code.expiresAt': { $gt: new Date(Date.now()) },
          'emailVerification.code.attempts': { $lt: maxAttempts },
        },
        valid
          ? {
              $set: { emailVerifiedAt: new Date(Date.now()) },
              $unset: { emailVerification: 1, verification: 1 },
            }
          : {
              $inc: { 'emailVerification.code.attempts': 1 },
            },
      );
      if (valid && result.modifiedCount) {
        await sendEmail('welcome', account.email, undefined, { requestId });
        return;
      }
      const latest = state(await pending(filter));
      if (latest.attemptsExhausted)
        throw new AppError(
          400,
          'VERIFICATION_ATTEMPTS_EXHAUSTED',
          'Too many incorrect codes. Request a new code.',
          latest,
        );
      if (!latest.expiresAt || latest.expiresAt <= latest.serverTime)
        throw new AppError(
          400,
          'VERIFICATION_CODE_EXPIRED',
          'This code has expired. Request a new code.',
          latest,
        );
      throw new AppError(
        400,
        'INVALID_VERIFICATION_CODE',
        'That code is incorrect. Check the most recent email and try again.',
        latest,
      );
    },
  };
}
