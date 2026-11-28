import { escapeMarkup, pageTitle } from '../shared/public-pages.js';

const web = 'https://fdfs-one-staging.vercel.app';
const api = 'https://fdfs-api-6tvg.onrender.com/api/v1';
const entries = {
  cinema: (slug) => '/films/' + slug + '?classification=independent',
  originals: (slug) => '/films/' + slug + '?classification=original',
  podcasts: (slug) => '/podcasts/episodes/' + slug,
  live: (slug) => '/live/' + slug,
  movies: (slug) => '/movies/' + slug,
  talent: (slug) => '/talent/' + slug,
  reviews: (slug) => '/reviews/entry/' + slug,
};
const headers = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
};

function view(section, row) {
  const person = section === 'talent';
  const review = section === 'reviews';
  const title = person
    ? row.displayName
    : review
      ? row.target?.title
      : row.title;
  if (typeof title !== 'string' || !title.trim()) return null;
  const artwork = [
    row.poster?.url,
    row.thumbnail?.url,
    row.profileImage?.url,
  ].find((value) => {
    const url = typeof value === 'string' ? URL.parse(value) : null;
    return (
      url?.origin === 'https://res.cloudinary.com' &&
      url.pathname.includes('/image/upload/')
    );
  });
  return {
    title: pageTitle(review ? 'Community review of ' + title : title),
    description: review
      ? 'Read a community review and discussion for ' + title + '.'
      : (row.synopsis ?? row.summary ?? row.introduction),
    image: artwork,
    type: review ? 'article' : 'website',
  };
}

function inject(shell, canonical, metadata) {
  const tags = [
    '<link rel="canonical" href="' + escapeMarkup(canonical) + '">',
    '<meta name="twitter:card" content="' +
      (metadata.image ? 'summary_large_image' : 'summary') +
      '">',
  ];
  const description =
    typeof metadata.description === 'string'
      ? metadata.description.replace(/\s+/g, ' ').trim().slice(0, 220)
      : '';
  for (const [name, value] of Object.entries({
    title: metadata.title,
    description,
    image: metadata.image,
    url: canonical,
    type: metadata.type,
    site_name: 'FDFS.ONE',
  })) {
    if (!value) continue;
    tags.push(
      '<meta property="og:' + name + '" content="' + escapeMarkup(value) + '">',
    );
    if (['title', 'description', 'image'].includes(name))
      tags.push(
        '<meta name="twitter:' +
          name +
          '" content="' +
          escapeMarkup(value) +
          '">',
      );
  }
  if (description)
    shell = shell.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      () =>
        '<meta name="description" content="' + escapeMarkup(description) + '">',
    );
  return shell
    .replace(
      /<title>[^<]*<\/title>/,
      () => '<title>' + escapeMarkup(metadata.title) + '</title>',
    )
    .replace('</head>', () => tags.join('\n') + '\n</head>');
}

export async function servePublicPage(request, fetcher = fetch) {
  const { searchParams } = new URL(request.url);
  const route = searchParams.getAll('route');
  const match =
    /^\/(cinema|originals|podcasts|live|movies|talent|reviews)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(
      route[0] ?? '',
    );
  if (
    route.length !== 1 ||
    !match ||
    match[2].length > 100 ||
    (match[1] === 'reviews' &&
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(match[2]))
  )
    return new Response('Page not found', { status: 404, headers });
  const [, section, slug] = match;
  const get = (url) =>
    fetcher(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  const [shell, detail] = await Promise.all([
    get(web + '/_pages/spa.html')
      .then(async (response) => (response.ok ? await response.text() : ''))
      .catch(() => ''),
    get(api + entries[section](slug))
      .then(async (response) => ({
        status: response.status,
        body: response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : null,
      }))
      .catch(() => null),
  ]);
  const respond = (body, status) =>
    new Response(request.method === 'HEAD' ? null : body, { status, headers });
  if (!shell.includes('<div id="root"></div>'))
    return respond('This page is temporarily unavailable.', 503);
  if (detail?.status === 404 && detail.body?.success === false)
    return respond(
      shell.replace(
        '<title>FDFS.ONE</title>',
        '<title>Page unavailable | FDFS.ONE</title>',
      ),
      404,
    );
  const metadata =
    detail?.status === 200 &&
    detail.body?.success === true &&
    detail.body.data &&
    view(section, detail.body.data);
  return metadata
    ? respond(inject(shell, web + route[0], metadata), 200)
    : respond(shell, 503);
}

export default {
  fetch(request) {
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, {
        status: 405,
        headers: { ...headers, Allow: 'GET, HEAD' },
      });
    return servePublicPage(request);
  },
};
