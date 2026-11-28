import { expect, it, vi } from 'vitest';
import { servePublicPage } from '../../api/public-page.js';
import { requireNamedDatabase } from '../src/config/env.js';

const web = 'https://fdfs-one-staging.vercel.app';
const shell =
  '<html><head><title>FDFS.ONE</title><meta name="description" content="Welcome"></head><body><div id="root"></div></body></html>';
const request = (route, init) =>
  new Request(
    web + '/api/public-page?route=' + encodeURIComponent(route),
    init,
  );
const fixture = (body, status = 200) =>
  vi.fn(async (url) =>
    url === web + '/_pages/spa.html'
      ? new Response(shell)
      : Response.json(body, { status }),
  );

it('renders a safe public detail head and forwards no browser credentials', async () => {
  const fetcher = fixture({
    success: true,
    data: {
      title: 'Film "A & B"',
      synopsis: 'A public description',
      poster: {
        url: 'https://res.cloudinary.com/example/image/upload/poster.webp',
      },
      mainVideo: { providerVideoId: 'unreleased-fixture' },
    },
  });
  const response = await servePublicPage(
    request('/cinema/sample', { headers: { Cookie: 'fixture=private' } }),
    fetcher,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const html = await response.text();
  expect(html).toContain('Film &quot;A &amp; B&quot; | FDFS.ONE');
  expect(html).toContain(web + '/cinema/sample');
  expect(html).toContain('og:image');
  expect(html).not.toContain('unreleased-fixture');
  expect(fetcher.mock.calls.every(([, options]) => !options.headers)).toBe(
    true,
  );
});

it('distinguishes missing public detail from an unavailable provider', async () => {
  const missing = await servePublicPage(
    request('/podcasts/removed'),
    fixture({ success: false }, 404),
  );
  expect(missing.status).toBe(404);
  expect(await missing.text()).toContain('<div id="root"></div>');
  const unavailable = await servePublicPage(
    request('/live/future'),
    fixture({}, 503),
  );
  expect(unavailable.status).toBe(503);
  expect(await unavailable.text()).not.toContain('rel="canonical"');
  const fetcher = fixture({});
  expect(
    (await servePublicPage(request('/account/settings'), fetcher)).status,
  ).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
});

it('refuses a mismatched deployment database without disclosing connection information', () => {
  expect(() =>
    requireNamedDatabase('mongodb://127.0.0.1/fdfs_staging', 'fdfs_staging'),
  ).not.toThrow();
  expect(() =>
    requireNamedDatabase('mongodb://127.0.0.1/fdfs', 'fdfs_staging'),
  ).toThrow('MONGODB_URI does not match MONGODB_EXPECTED_DATABASE.');
});
