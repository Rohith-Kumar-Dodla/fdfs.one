import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import {
  unavailableMetadata,
  usePageMetadata,
} from '../src/hooks/use-page-metadata.js';

it('reuses a static canonical and avoids publishing protected artwork URLs in metadata', () => {
  const canonical = document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = window.location.origin + '/cinema';
  document.head.append(canonical);
  const { rerender, unmount } = renderHook(
    ({ value }) => usePageMetadata(value),
    {
      initialProps: {
        value: {
          title: 'Fixture film',
          description: 'Public film description.',
          path: '/cinema/fixture-film',
          image: 'https://i.ytimg.com/vi/protected-fixture/default.jpg',
          structured: { '@type': 'Movie', name: 'Fixture film' },
        },
      },
    },
  );
  try {
    expect(document.title).toBe('Fixture film');
    expect(document.head.querySelectorAll('link[rel=canonical]')).toHaveLength(
      1,
    );
    expect(canonical.getAttribute('href')).toMatch(/\/cinema\/fixture-film$/);
    expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
    expect(
      document.head.querySelector('script[type="application/ld+json"]')
        .textContent,
    ).toContain('Fixture film');
    expect(document.head.textContent).not.toContain('protected-fixture');
    rerender({ value: unavailableMetadata });
    expect(document.head.querySelector('link[rel=canonical]')).toBeNull();
    expect(document.head.querySelector('meta[name=robots]').content).toContain(
      'noindex',
    );
    expect(
      document.head.querySelector('script[type="application/ld+json"]'),
    ).toBeNull();
  } finally {
    unmount();
    canonical.remove();
  }
});
