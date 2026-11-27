import nodemailer from 'nodemailer';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';

const templates = {
  verification: {
    subject: 'Verify your FDFS.ONE email',
    copy: 'Verify your email address to take part in the FDFS.ONE community.',
    action: 'Verify email',
    route: '/verify-email',
  },
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

export function brandedMail({ subject, copy, action, url }) {
  return {
    subject,
    text: copy + '\n\n' + url,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#111827;color:#fff;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto"><tr><td style="padding:28px 20px"><p style="color:#facc15;font-weight:bold">FDFS.ONE</p><h1 style="color:#facc15;font-size:26px">${escapeHtml(subject)}</h1><p style="font-size:16px;line-height:1.55">${escapeHtml(copy)}</p><p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#facc15;color:#111827;padding:12px 18px;border-radius:8px;font-weight:bold;text-decoration:none">${escapeHtml(action)}</a></p><p style="color:#d1d5db;font-size:13px">Where Passion Meets Talent</p></td></tr></table></body></html>`,
  };
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
const rateLimited = () =>
  Object.assign(new Error('Email provider rate limit'), { responseCode: 454 });

function brevoTransport(config, fetcher) {
  let blockedUntil = 0;
  return {
    async sendMail({ to, subject, text, html, messageId }) {
      if (Date.now() < blockedUntil) throw rateLimited();
      const body = JSON.stringify({
        sender: { email: config.from, name: config.fromName },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
        headers: { IdempotencyKey: deliveryKey(messageId) },
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
          await response.body?.cancel();
          return { accepted: [to] };
        }
        if (response.status === 400) {
          const payload = await response.json().catch(() => null);
          if (payload?.code === 'duplicate_parameter' && messageId)
            return { accepted: [to] };
        } else await response.body?.cancel();
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
          throw rateLimited();
        }
        if (response.status === 402) {
          blockedUntil = Date.now() + 3600000;
          throw rateLimited();
        }
        if (response.status >= 500)
          throw new Error('Email provider outcome is unknown');
        throw Object.assign(new Error('Email provider rejected the request'), {
          responseCode: 550,
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

  return async (kind, to, token) => {
    if (!mail) return false;
    const template = templates[kind];
    const url = new URL(template.route, config.webOrigin);
    if (token) url.hash = new URLSearchParams({ token }).toString();

    try {
      const result = await mail.sendMail({
        from: mailFrom(config),
        to,
        ...brandedMail({ ...template, url: url.href }),
      });
      if (result?.accepted?.length) return true;
      logger.warn({ kind }, 'Transactional email was not accepted');
      return false;
    } catch {
      logger.warn({ kind }, 'Transactional email delivery failed');
      return false;
    }
  };
}
