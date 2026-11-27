import { AppError } from '../../utils/app-error.js';

export const isCookieAuthPath = (path) =>
  /^\/api\/v1\/auth\/(login|refresh|logout|account)\/?$/i.test(path);

export function webSessionCookies(config) {
  const name = config.secure ? '__Secure-fdfs_refresh' : 'fdfs_refresh';
  const options = {
    httpOnly: true,
    secure: config.secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
  };

  return {
    protect(req, res, next) {
      if (
        req.get('Origin') !== config.webOrigin ||
        req.get('X-FDFS-CSRF') !== '1'
      ) {
        throw new AppError(
          403,
          'UNTRUSTED_AUTH_REQUEST',
          'This authentication request was blocked.',
        );
      }
      next();
    },
    read(req) {
      const prefix = `${name}=`;
      const cookies = (req.get('Cookie') ?? '')
        .split(';')
        .map((item) => item.trim())
        .filter((item) => item.startsWith(prefix));
      return cookies.length === 1 ? cookies[0].slice(prefix.length) : null;
    },
    set(res, credentials) {
      res.cookie(name, credentials.refreshToken, {
        ...options,
        expires: credentials.expiresAt,
        maxAge: Math.max(0, credentials.expiresAt.getTime() - Date.now()),
      });
    },
    clear(res) {
      res.clearCookie(name, options);
    },
  };
}
