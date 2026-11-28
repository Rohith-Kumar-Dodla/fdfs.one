import { URL } from 'node:url';
import {
  escapeMarkup,
  pageTitle,
  publicPages,
} from '../shared/public-pages.js';

export function publicPageShells(siteOrigin) {
  return {
    name: 'fdfs-public-page-shells',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const shell = bundle['index.html'];
        if (shell?.type !== 'asset') return;
        const original = String(shell.source);
        this.emitFile({
          type: 'asset',
          fileName: '_pages/spa.html',
          source: original,
        });
        for (const [path, [title, description]] of Object.entries(
          publicPages,
        )) {
          const canonical = siteOrigin && new URL(path, siteOrigin).href;
          const metadata = [
            '<meta property="og:type" content="website">',
            '<meta property="og:site_name" content="FDFS.ONE">',
            '<meta name="twitter:card" content="summary">',
            ...[
              ['title', pageTitle(title)],
              ['description', description],
            ].flatMap(([key, value]) => [
              '<meta property="og:' +
                key +
                '" content="' +
                escapeMarkup(value) +
                '">',
              '<meta name="twitter:' +
                key +
                '" content="' +
                escapeMarkup(value) +
                '">',
            ]),
            ...(canonical
              ? [
                  '<link rel="canonical" href="' +
                    escapeMarkup(canonical) +
                    '">',
                  '<meta property="og:url" content="' +
                    escapeMarkup(canonical) +
                    '">',
                ]
              : []),
          ].join('\n    ');
          const html = original
            .replace(
              /<title>[^<]*<\/title>/,
              '<title>' + escapeMarkup(pageTitle(title)) + '</title>',
            )
            .replace(
              /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
              '<meta name="description" content="' +
                escapeMarkup(description) +
                '">',
            )
            .replace('</head>', '  ' + metadata + '\n  </head>');
          if (path === '/') shell.source = html;
          else
            this.emitFile({
              type: 'asset',
              fileName: '_pages' + path + '.html',
              source: html,
            });
        }
      },
    },
  };
}
