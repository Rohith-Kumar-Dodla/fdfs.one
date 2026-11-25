import nodemailer from 'nodemailer';

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
};

export function createEmailService(config, logger, transport) {
  const mail =
    transport ??
    (config.smtp &&
      nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        requireTLS: !config.smtp.secure,
        auth: config.smtp.auth,
        connectionTimeout: 4000,
        greetingTimeout: 4000,
        socketTimeout: 8000,
      }));

  if (!mail)
    logger.warn('SMTP is unconfigured. Transactional delivery is unavailable.');

  return async (kind, to, token) => {
    if (!mail) return false;
    const template = templates[kind];
    const url = new URL(template.route, config.webOrigin);
    if (token) url.hash = new URLSearchParams({ token }).toString();

    try {
      await mail.sendMail({
        from: config.smtp?.from,
        to,
        subject: template.subject,
        text: `${template.copy}\n\n${url.href}`,
        html: `<div style="background:#111827;color:#fff;padding:24px;font-family:system-ui"><p style="color:#facc15;font-weight:bold">FDFS.ONE</p><p>${template.copy}</p><a style="color:#facc15" href="${url.href}">${template.action}</a></div>`,
      });
      return true;
    } catch {
      logger.warn({ kind }, 'Transactional email delivery failed');
      return false;
    }
  };
}
