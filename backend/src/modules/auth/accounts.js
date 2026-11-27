import bcrypt from 'bcrypt';
import { AppError } from '../../utils/app-error.js';
import { User } from './models.js';
import { randomToken, tokenHash } from './tokens.js';
import { canonicalGmail, isGmailAddress } from '../../../../shared/gmail.js';

const verificationMs = 24 * 60 * 60 * 1000;
const resetMs = 30 * 60 * 1000;
const cooldownMs = 60 * 1000;

export function accountView(user) {
  return {
    id: user.publicId,
    fullName: user.fullName,
    email: user.email,
    roles: user.roles,
    ...(user.cmsModules?.length && { cmsModules: user.cmsModules }),
    emailVerified: Boolean(user.emailVerifiedAt),
    status: user.status,
    bio: user.bio,
    preferences: { emailUpdates: Boolean(user.preferences?.emailUpdates) },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function challenge(token, lifetime) {
  const now = Date.now();
  return {
    hash: tokenHash(token),
    issuedAt: new Date(now),
    expiresAt: new Date(now + lifetime),
  };
}

const invalidToken = () =>
  new AppError(
    400,
    'INVALID_EMAIL_TOKEN',
    'This link is invalid or has expired. Request a new link.',
  );
const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

export function createAccountService(config, sendEmail) {
  const hashPassword = (value) => bcrypt.hash(value, config.bcryptCost);
  let dummyHash;

  async function accountByEmail(email, select) {
    const lookup = (address) => User.findOne({ email: address }).select(select);
    return (
      (await lookup(email)) ??
      (isGmailAddress(email) ? lookup(canonicalGmail(email)) : null)
    );
  }

  async function sendChallenge(email, field, kind, lifetime, extra = {}) {
    const account = await accountByEmail(email, 'email');
    if (!account) return;
    const token = randomToken();
    const result = await User.updateOne(
      {
        _id: account._id,
        status: 'active',
        ...extra,
        $or: [
          { [field]: { $exists: false } },
          {
            [`${field}.issuedAt`]: { $lte: new Date(Date.now() - cooldownMs) },
          },
        ],
      },
      { $set: { [field]: challenge(token, lifetime) } },
    );
    if (result.modifiedCount === 1) void sendEmail(kind, account.email, token);
  }

  return {
    async register({ email, fullName, password }) {
      const token = randomToken();
      const passwordHash = await hashPassword(password);
      const mailbox = email.split('@')[0].split('').join('\\.?');
      if (
        await User.exists({
          email: new RegExp(
            '^' + mailbox + '(?:\\+[^@]+)?@(?:gmail|googlemail)\\.com$',
            'i',
          ),
        })
      )
        return;
      try {
        await User.create({
          email,
          fullName,
          passwordHash,
          verification: challenge(token, verificationMs),
        });
      } catch (error) {
        if (error.code === 11000 && error.keyPattern?.email) return;
        throw error;
      }
      void sendEmail('verification', email, token);
    },

    async validateCredentials({ email, password }) {
      const user = await accountByEmail(email, '+passwordHash +authVersion');
      const hash =
        user?.passwordHash ??
        (await (dummyHash ??= hashPassword(randomToken())));
      const valid = await bcrypt.compare(password, hash);
      if (!valid || user?.status !== 'active') throw invalidCredentials();
      if (!user.emailVerifiedAt)
        throw new AppError(
          403,
          'EMAIL_NOT_VERIFIED',
          'Verify your email before signing in. You can request a new verification link.',
        );
      return user;
    },

    async verifyEmail(token, password) {
      const now = new Date();
      const filter = {
        status: 'active',
        emailVerifiedAt: null,
        'verification.hash': tokenHash(token),
        'verification.expiresAt': { $gt: now },
      };
      const account = await User.findOne(filter).select('+passwordHash');
      if (!account || !(await bcrypt.compare(password, account.passwordHash)))
        throw invalidToken();
      const { modifiedCount } = await User.updateOne(
        {
          ...filter,
          _id: account._id,
          passwordHash: account.passwordHash,
          'verification.expiresAt': { $gt: new Date() },
        },
        { $set: { emailVerifiedAt: new Date() }, $unset: { verification: 1 } },
      );
      if (!modifiedCount) throw invalidToken();
      if (!account.roles.includes('super_admin'))
        void sendEmail('welcome', account.email);
    },

    resendVerification(email) {
      return sendChallenge(
        email,
        'verification',
        'verification',
        verificationMs,
        { emailVerifiedAt: null },
      );
    },

    forgotPassword(email) {
      return sendChallenge(email, 'passwordReset', 'passwordReset', resetMs);
    },

    async resetPassword(token, password) {
      const passwordHash = await hashPassword(password);
      const user = await User.findOneAndUpdate(
        {
          status: 'active',
          'passwordReset.hash': tokenHash(token),
          'passwordReset.expiresAt': { $gt: new Date() },
        },
        {
          $set: { passwordHash },
          $unset: { passwordReset: 1 },
          $inc: { authVersion: 1 },
        },
      );
      if (!user) throw invalidToken();
      void sendEmail('passwordChanged', user.email);
    },

    async changePassword(user, currentPassword, password) {
      const current = await User.findOne({
        _id: user._id,
        status: 'active',
        authVersion: user.authVersion,
      }).select('+passwordHash');
      if (
        !current ||
        !(await bcrypt.compare(currentPassword, current.passwordHash))
      ) {
        throw new AppError(
          400,
          'INVALID_PASSWORD',
          'The current password is incorrect.',
        );
      }

      const passwordHash = await hashPassword(password);
      const result = await User.updateOne(
        {
          _id: user._id,
          status: 'active',
          authVersion: user.authVersion,
          passwordHash: current.passwordHash,
        },
        {
          $set: { passwordHash },
          $unset: { passwordReset: 1 },
          $inc: { authVersion: 1 },
        },
      );
      if (!result.modifiedCount)
        throw new AppError(
          409,
          'ACCOUNT_CHANGED',
          'Account changed. Sign in again.',
        );
      void sendEmail('passwordChanged', user.email);
    },

    async updateProfile(user, changes) {
      const updated = await User.findOneAndUpdate(
        { _id: user._id, status: 'active', authVersion: user.authVersion },
        { $set: changes },
        { returnDocument: 'after', runValidators: true },
      );
      if (!updated)
        throw new AppError(
          409,
          'ACCOUNT_CHANGED',
          'Account changed. Sign in again.',
        );
      return accountView(updated);
    },
  };
}
