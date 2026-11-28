import { useEffect } from 'react';

export const unavailableMetadata = {
  title: 'Page unavailable | FDFS.ONE',
  noIndex: true,
};

export function usePageMetadata(metadata) {
  const { title, description, path, image, type, noIndex, structured } =
    metadata ?? {};
  const structuredText = structured ? JSON.stringify(structured) : undefined;
  useEffect(() => {
    if (!title) return;
    const previousTitle = document.title;
    const rollback = [];
    const set = (tag, key, label, attr, value) => {
      const existing = document.head.querySelector(
        tag + '[' + key + '="' + label + '"]',
      );
      if (!value) {
        if (existing) {
          existing.remove();
          rollback.push(() => document.head.append(existing));
        }
        return;
      }
      const element = existing ?? document.createElement(tag);
      const previous = element.getAttribute(attr);
      element.setAttribute(key, label);
      element.setAttribute(attr, value);
      if (!existing) document.head.append(element);
      rollback.push(() => {
        if (!existing) element.remove();
        else if (previous === null) element.removeAttribute(attr);
        else element.setAttribute(attr, previous);
      });
    };
    const origin = window.location.origin;
    const canonical =
      path?.startsWith('/') && !path.startsWith('//')
        ? new URL(path, origin).href
        : undefined;
    const summary =
      typeof description === 'string'
        ? description.replace(/\s+/g, ' ').trim().slice(0, 220)
        : '';
    const url = typeof image === 'string' ? URL.parse(image) : null;
    const poster =
      url?.origin === 'https://res.cloudinary.com' ? url.href : undefined;
    document.title = title;
    if (summary) set('meta', 'name', 'description', 'content', summary);
    set('link', 'rel', 'canonical', 'href', canonical);
    set('meta', 'property', 'og:url', 'content', canonical);
    set('meta', 'property', 'og:type', 'content', type ?? 'website');
    set('meta', 'property', 'og:site_name', 'content', 'FDFS.ONE');
    set('meta', 'property', 'og:title', 'content', title);
    set('meta', 'property', 'og:description', 'content', summary);
    set('meta', 'property', 'og:image', 'content', poster);
    set(
      'meta',
      'name',
      'twitter:card',
      'content',
      poster ? 'summary_large_image' : 'summary',
    );
    set('meta', 'name', 'twitter:title', 'content', title);
    set('meta', 'name', 'twitter:description', 'content', summary);
    set('meta', 'name', 'twitter:image', 'content', poster);
    if (noIndex) set('meta', 'name', 'robots', 'content', 'noindex, nofollow');
    if (structuredText && canonical) {
      const node = document.createElement('script');
      node.type = 'application/ld+json';
      node.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        ...JSON.parse(structuredText),
        url: canonical,
        ...(poster && { image: poster }),
      });
      document.head.append(node);
      rollback.push(() => node.remove());
    }
    return () => {
      document.title = previousTitle;
      for (const restore of rollback.reverse()) restore();
    };
  }, [title, description, path, image, type, noIndex, structuredText]);
}
