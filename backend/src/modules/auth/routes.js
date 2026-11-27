import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createEmailService, emailConfigured } from '../../services/email.js';
import { User } from './models.js';
import { AppError } from '../../utils/app-error.js';
import { sendError, sendSuccess } from '../../utils/responses.js';
import { validate } from '../../middlewares/validate.js';
import { accountView, createAccountService } from './accounts.js';
import {
  requireActiveAccount,
  requireAuthentication,
} from './authorization.js';
import { webSessionCookies } from './cookies.js';
import { schemas } from './schemas.js';
import { createSessionService } from './sessions.js';

function authLimiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(req, res) {
      return sendError(res, {
        status: 429,
        code: 'AUTH_RATE_LIMIT',
        message: 'Too many attempts. Try again later.',
      });
    },
  });
}

const body = (res) => res.locals.validated.body;
const access = ({ accessToken, sessionId }) => ({ accessToken, sessionId });
const emailResponse = (res) =>
  sendSuccess(
    res,
    {},
    {
      status: 202,
      message:
        'Request received. If the account is eligible, check your inbox for next steps. If no email arrives, try again later.',
    },
  );

export function createAuthRoutes(
  config,
  logger,
  { available, mailTransport } = {},
) {
  const auth = Router();
  const users = Router();
  const cookie = webSessionCookies(config);
  const accounts = createAccountService(
    config,
    createEmailService(config, logger, mailTransport),
  );
  const sessions = createSessionService(config);
  const protectedRoute = [
    requireAuthentication(sessions),
    requireActiveAccount,
  ];
  const emailLimiter = authLimiter(10);
  const passwordLimiter = authLimiter(12);
  const emailAvailable = (req, res, next) => {
    if (!emailConfigured(config) && !mailTransport)
      return sendError(res, {
        status: 503,
        code: 'EMAIL_UNAVAILABLE',
        message: 'Account email is temporarily unavailable. Try again later.',
      });
    next();
  };

  for (const router of [auth, users]) {
    router.use((req, res, next) => {
      res.set('Cache-Control', 'no-store');
      if (available && !available()) {
        return sendError(res, {
          status: 503,
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Accounts are temporarily unavailable.',
        });
      }
      next();
    });
  }

  auth.post(
    '/register',
    emailLimiter,
    emailAvailable,
    validate(schemas.register),
    async (req, res) => {
      await accounts.register(body(res));
      return emailResponse(res);
    },
  );

  auth.post(
    '/login',
    cookie.protect,
    passwordLimiter,
    validate(schemas.login),
    async (req, res) => {
      const user = await accounts.validateCredentials(body(res));
      // Replace a browser's previous session only after the supplied password succeeds.
      await sessions.close(cookie.read(req));
      const credentials = await sessions.open(user, req.get('User-Agent'));
      cookie.set(res, credentials);
      return sendSuccess(res, access(credentials));
    },
  );

  auth.post(
    '/refresh',
    cookie.protect,
    authLimiter(60),
    validate(schemas.empty),
    async (req, res) => {
      try {
        const credentials = await sessions.refresh(cookie.read(req));
        cookie.set(res, credentials);
        return sendSuccess(res, access(credentials));
      } catch (error) {
        if (error instanceof AppError && error.status === 401)
          cookie.clear(res);
        throw error;
      }
    },
  );

  auth.post(
    '/logout',
    cookie.protect,
    validate(schemas.empty),
    async (req, res) => {
      await sessions.close(cookie.read(req));
      cookie.clear(res);
      return sendSuccess(res, {}, { message: 'Signed out.' });
    },
  );

  auth.post(
    '/logout-all',
    ...protectedRoute,
    validate(schemas.empty),
    async (req, res) => {
      await sessions.closeAll(req.auth.user);
      return sendSuccess(res, {}, { message: 'All sessions were signed out.' });
    },
  );

  function me(req, res) {
    return sendSuccess(res, accountView(req.auth.user));
  }

  auth.get('/me', ...protectedRoute, me);
  users.get('/me', ...protectedRoute, me);
  users.post(
    '/me/welcome',
    ...protectedRoute,
    validate(schemas.welcome),
    async (req, res) => {
      const user = req.auth.user;
      if (user.roles.includes('super_admin'))
        return sendSuccess(res, { show: false });
      const filter = {
        _id: user._id,
        status: 'active',
        roles: { $ne: 'super_admin' },
        emailVerifiedAt: { $type: 'date' },
      };
      const present = body(res).action === 'present';
      const field = present ? 'welcomePresentedAt' : 'welcomeAcknowledgedAt';
      const updated = await User.updateOne(
        {
          ...filter,
          [field]: null,
          ...(!present && { welcomePresentedAt: { $type: 'date' } }),
        },
        { $set: { [field]: new Date() } },
        { timestamps: false },
      );
      return sendSuccess(res, {
        show: present && Boolean(updated.modifiedCount),
      });
    },
  );
  users.patch(
    '/me',
    ...protectedRoute,
    validate(schemas.profile),
    async (req, res) => {
      return sendSuccess(
        res,
        await accounts.updateProfile(req.auth.user, body(res)),
      );
    },
  );

  auth.post(
    '/verify-email',
    passwordLimiter,
    validate(schemas.verify),
    async (req, res) => {
      const { token, password } = body(res);
      await accounts.verifyEmail(token, password);
      return sendSuccess(res, {}, { message: 'Email verified.' });
    },
  );

  auth.post(
    '/resend-verification',
    emailLimiter,
    emailAvailable,
    validate(schemas.email),
    async (req, res) => {
      await accounts.resendVerification(body(res).email);
      return emailResponse(res);
    },
  );

  auth.post(
    '/forgot-password',
    emailLimiter,
    emailAvailable,
    validate(schemas.email),
    async (req, res) => {
      await accounts.forgotPassword(body(res).email);
      return emailResponse(res);
    },
  );

  auth.post(
    '/reset-password',
    passwordLimiter,
    validate(schemas.reset),
    async (req, res) => {
      const { token, password } = body(res);
      await accounts.resetPassword(token, password);
      return sendSuccess(
        res,
        {},
        { message: 'Password reset. Sign in again.' },
      );
    },
  );

  auth.post(
    '/change-password',
    ...protectedRoute,
    passwordLimiter,
    validate(schemas.change),
    async (req, res) => {
      const { currentPassword, password } = body(res);
      await accounts.changePassword(req.auth.user, currentPassword, password);
      return sendSuccess(
        res,
        {},
        { message: 'Password changed. Sign in again.' },
      );
    },
  );

  auth.get('/sessions', ...protectedRoute, async (req, res) => {
    return sendSuccess(
      res,
      await sessions.list(req.auth.user, req.auth.session),
    );
  });

  auth.delete(
    '/sessions/:sessionId',
    ...protectedRoute,
    validate(schemas.session),
    async (req, res) => {
      await sessions.revoke(
        req.auth.user,
        res.locals.validated.params.sessionId,
      );
      return sendSuccess(res, {}, { message: 'Session revoked.' });
    },
  );

  return { auth, users };
}
