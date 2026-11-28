import nodemailer from 'nodemailer';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';

const templates = {
  passwordReset: {
    subject: 'Reset your FDFS.ONE password',
    copy: 'Use this one-time link to reset your password. The link expires in 30 minutes.',
    action: 'Reset password',
    route: '/reset-password',
  },
  passwordChanged: {
    subject: 'Your FDFS.ONE password changed',
    copy: 'Your password changed and previous sessions were signed out. If you did not make this change, use password recovery.',
    action: 'Open password recovery',
    route: '/forgot-password',
  },
  welcome: {
    subject: 'Welcome to FDFS.ONE',
    copy: 'Your email is verified. Explore independent films, originals, podcasts, live events, reviews and talent.',
    action: 'Explore FDFS.ONE',
    route: '/',
  },
};

export const emailConfigured = (config) => Boolean(config.brevo || config.smtp);
export const mailFrom = (config) => config.brevo?.from ?? config.smtp?.from;

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (letter) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        letter
      ],
  );

export function brandedMail({ subject, copy, action, url, code, footer }) {
  const body = code
    ? `<p style="font-size:16px;line-height:1.55">Use the following verification code to complete your registration:</p><p style="display:inline-block;background:#facc15;color:#111827;padding:12px 18px;border-radius:8px;font-size:30px;font-weight:bold;letter-spacing:0.18em;margin:8px 0">${escapeHtml(code)}</p>${footer.map((line) => `<p style="font-size:16px;line-height:1.55">${escapeHtml(line)}</p>`).join('')}`
    : `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#facc15;color:#111827;padding:12px 18px;border-radius:8px;font-weight:bold;text-decoration:none">${escapeHtml(action)}</a></p>`;
  return {
    subject,
    text: code
      ? [
          copy,
          'Use the following verification code to complete your registration:',
          code,
          ...footer,
          'FDFS.ONE\nWhere Passion Meets Talent',
        ].join('\n\n')
      : copy + '\n\n' + url,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#111827;color:#fff;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto"><tr><td style="padding:28px 20px"><p style="color:#facc15;font-weight:bold">FDFS.ONE</p><h1 style="color:#facc15;font-size:26px">${escapeHtml(subject)}</h1><p style="font-size:16px;line-height:1.55">${escapeHtml(copy)}</p>${body}<p style="color:#d1d5db;font-size:13px">Where Passion Meets Talent</p></td></tr></table></body></html>`,
  };
}

function accountMail(config, kind, token) {
  if (kind === 'verification')
    return brandedMail({
      subject: 'Verify your Gmail — FDFS.ONE',
      copy: 'Welcome to FDFS.ONE!',
      code: token,
      footer: [
        'This code expires in 10 minutes.',
        'If you did not request this verification, you can safely ignore this email.',
        'Never share your verification code with anyone.',
      ],
    });
  const template = templates[kind];
  const url = new URL(template.route, config.webOrigin);
  if (token) url.hash = new URLSearchParams({ token }).toString();
  return brandedMail({ ...template, url: url.href });
}

function deliveryKey(messageId) {
  if (!messageId) return randomUUID();
  const hash = createHash('sha256').update(messageId).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}
const rateLimited = (providerStatus) =>
  Object.assign(new Error('Email provider rate limit'), {
    responseCode: 454,
    providerStatus,
  });

const brevoErrorCodes = new Set([
  'account_under_validation',
  'invalid_parameter',
  'missing_parameter',
  'not_enough_credits',
  'permission_denied',
  'unauthorized',
]);

function brevoTransport(config, fetcher) {
  let blockedUntil = 0;
  return {
    async sendMail({ to, subject, text, html, messageId, tag }) {
      if (Date.now() < blockedUntil) throw rateLimited();
      const body = JSON.stringify({
        sender: { email: config.from, name: config.fromName },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
        headers: { IdempotencyKey: deliveryKey(messageId) },
        ...(tag && { tags: [tag] }),
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetcher('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          redirect: 'error',
          headers: {
            'api-key': config.apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body,
          signal: AbortSignal.timeout(5000),
        }).catch(() => {
          throw new Error('Email provider outcome is unknown');
        });
        if (response.status === 201) {
          const payload = await response.json().catch(() => null);
          return {
            accepted: [to],
            providerStatus: 201,
            ...(typeof payload?.messageId === 'string' && {
              providerMessageFingerprint: createHash('sha256')
                .update(payload.messageId)
                .digest('hex')
                .slice(0, 16),
            }),
          };
        }
        const payload = await response.json().catch(() => null);
        if (
          response.status === 400 &&
          payload?.code === 'duplicate_parameter' &&
          messageId
        )
          return { accepted: [to] };
        if (response.status === 429) {
          const seconds = Number(response.headers.get('retry-after') || NaN);
          if (attempt === 0 && seconds >= 0 && seconds <= 2) {
            await wait(Math.max(250, seconds * 1000));
            continue;
          }
          blockedUntil =
            Date.now() +
            Math.max(
              60000,
              Number.isFinite(seconds) ? Math.min(seconds, 86400) * 1000 : 0,
            );
          throw rateLimited(429);
        }
        if (response.status === 402 || payload?.code === 'not_enough_credits') {
          blockedUntil = Date.now() + 3600000;
          throw rateLimited(response.status);
        }
        if (response.status >= 500)
          throw Object.assign(new Error('Email provider outcome is unknown'), {
            providerStatus: response.status,
          });
        throw Object.assign(new Error('Email provider rejected the request'), {
          responseCode: 550,
          providerStatus: response.status,
          ...(brevoErrorCodes.has(payload?.code) && {
            providerCode: payload.code,
          }),
        });
      }
    },
  };
}

export function createMailTransport(config, fetcher = fetch) {
  if (config.brevo) return brevoTransport(config.brevo, fetcher);
  return (
    config.smtp &&
    nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      requireTLS: !config.smtp.secure,
      auth: config.smtp.auth,
      dnsTimeout: 4000,
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 8000,
    })
  );
}

export function createEmailService(config, logger, transport) {
  const mail = transport ?? createMailTransport(config);

  if (!mail) logger.warn('Transactional email is unconfigured.');

  return async (kind, to, token, { requestId } = {}) => {
    if (!mail) return false;
    const log = { kind, requestId, provider: config.brevo ? 'brevo' : 'smtp' };

    try {
      const result = await mail.sendMail({
        from: mailFrom(config),
        to,
        ...accountMail(config, kind, token),
        ...(kind === 'verification' && { tag: 'gmail-verification' }),
      });
      if (result?.accepted?.includes(to)) {
        if (kind === 'verification')
          logger.info?.(
            {
              ...log,
              providerStatus: result.providerStatus,
              providerMessageFingerprint: result.providerMessageFingerprint,
            },
            'Verification email accepted by provider',
          );
        return true;
      }
      logger.warn(log, 'Transactional email was not accepted');
      return false;
    } catch (error) {
      logger.warn(
        {
          ...log,
          providerStatus: error?.providerStatus,
          providerCode: error?.providerCode,
        },
        'Transactional email delivery failed',
      );
      return false;
    }
  };
}
