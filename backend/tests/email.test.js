import { expect, it, vi } from 'vitest';
import { brandedMail, createMailTransport } from '../src/services/email.js';
import { loadAuthConfig } from '../src/config/auth.js';

const from = 'sender@example.test';
const to = 'fixture@gmail.com';
const provider = { from, fromName: 'FDFS.ONE', apiKey: 'fixture-key' };
const message = {
  to,
  subject: 'Verify your email',
  text: 'Welcome',
  html: '<p>Welcome</p>',
};

it('uses Brevo HTTPS and retries a short throttle once with the same idempotency key', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { 'retry-after': '0' } }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 201 }));
  await expect(
    createMailTransport({ brevo: provider }, fetcher).sendMail(message),
  ).resolves.toEqual({ accepted: [to] });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const [[url, request], [, retry]] = fetcher.mock.calls;
  expect(url).toBe('https://api.brevo.com/v3/smtp/email');
  expect(request.headers['api-key']).toBe(provider.apiKey);
  expect(request.body).toBe(retry.body);
  expect(JSON.parse(request.body)).toMatchObject({
    sender: { email: from, name: 'FDFS.ONE' },
    to: [{ email: to }],
    htmlContent: message.html,
    textContent: message.text,
    headers: { IdempotencyKey: expect.any(String) },
  });
});

it('keeps transport failures sanitized and backs off after a quota or rate response', async () => {
  const throttled = vi
    .fn()
    .mockResolvedValue(
      new Response(null, { status: 429, headers: { 'retry-after': '3600' } }),
    );
  const transport = createMailTransport({ brevo: provider }, throttled);
  await expect(transport.sendMail(message)).rejects.toMatchObject({
    responseCode: 454,
  });
  await expect(transport.sendMail(message)).rejects.toMatchObject({
    responseCode: 454,
  });
  expect(throttled).toHaveBeenCalledTimes(1);
  const rejected = vi
    .fn()
    .mockResolvedValue(new Response('private response', { status: 401 }));
  await expect(
    createMailTransport({ brevo: provider }, rejected).sendMail(message),
  ).rejects.toMatchObject({
    responseCode: 550,
    message: 'Email provider rejected the request',
  });
  const timedOut = vi
    .fn()
    .mockRejectedValue(new Error('contains private data'));
  await expect(
    createMailTransport({ brevo: provider }, timedOut).sendMail(message),
  ).rejects.toThrow('Email provider outcome is unknown');
  expect(timedOut).toHaveBeenCalledTimes(1);
});

it('requires a verified-sender address configuration and escapes branded template text', () => {
  const config = {
    NODE_ENV: 'production',
    CORS_ORIGINS: ['https://example.test'],
  };
  const env = {
    JWT_ACCESS_SECRET: 'test-signing-phrase'.repeat(3),
    APP_WEB_URL: 'https://example.test',
    EMAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'test',
    EMAIL_FROM: from,
  };
  expect(loadAuthConfig(config, env).brevo.fromName).toBe('FDFS.ONE');
  expect(() =>
    loadAuthConfig(config, { ...env, BREVO_API_KEY: undefined }),
  ).toThrow('BREVO_API_KEY');
  const email = brandedMail({
    subject: 'Event',
    copy: '<script>fixture</script>',
    action: 'Watch',
    url: 'https://example.test/live/fixture',
  });
  expect(email.html).toContain('&lt;script&gt;fixture&lt;/script&gt;');
  expect(email.text).toContain('https://example.test/live/fixture');
});
