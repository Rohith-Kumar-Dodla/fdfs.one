import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import {
  legalSections,
  legalServiceInformation,
  siteDefaults,
} from '../../../../shared/site.js';
import { apiClient } from '../../api/client.js';
import { Container, SectionHeading } from '../../components/ui/surfaces.jsx';

export function useSiteSettings() {
  const query = useQuery({
    queryKey: ['site-settings'],
    queryFn: ({ signal }) =>
      apiClient.get('/site/settings', { signal }).then((result) => result.data),
    meta: { public: true },
    refetchInterval: 60000,
  });
  return typeof query.data?.name === 'string'
    ? { ...siteDefaults, ...query.data }
    : siteDefaults;
}

export function useHomepageHero(enabled = true) {
  const query = useQuery({
    queryKey: ['site-homepage'],
    enabled,
    queryFn: ({ signal }) =>
      apiClient.get('/site/homepage', { signal }).then((result) => result.data),
    meta: { public: true },
    refetchInterval: 60000,
  });
  return query.data?.hero;
}

export function SiteMetadata({ path, settings }) {
  useEffect(() => {
    const created = [];
    function add(tag, attributes) {
      const el = document.createElement(tag);
      Object.entries(attributes).forEach(([key, value]) =>
        el.setAttribute(key, value),
      );
      document.head.append(el);
      created.push(el);
    }
    if (settings.favicon?.url)
      add('link', { rel: 'icon', href: settings.favicon.url });
    if (settings.socialImage?.url)
      add('meta', { property: 'og:image', content: settings.socialImage.url });
    const description = document.querySelector('meta[name=description]');
    const original = description?.getAttribute('content');
    const title = document.title;
    const defaultTitle =
      settings.seoTitle ||
      (settings.name !== siteDefaults.name && settings.name);
    const defaultDescription =
      settings.seoDescription ||
      (settings.description !== siteDefaults.description &&
        settings.description);
    if (path === '/') {
      if (defaultTitle) document.title = defaultTitle;
      if (defaultDescription)
        description?.setAttribute('content', defaultDescription);
    }
    return () => {
      created.forEach((el) => el.remove());
      if (defaultTitle && document.title === defaultTitle)
        document.title = title;
      if (
        defaultDescription &&
        original &&
        description.getAttribute('content') === defaultDescription
      )
        description.setAttribute('content', original);
    };
  }, [
    path,
    settings.favicon?.url,
    settings.socialImage?.url,
    settings.seoTitle,
    settings.seoDescription,
    settings.name,
    settings.description,
  ]);
  return null;
}

export function LegalPage() {
  const { kind } = useParams();
  const settings = useSiteSettings();
  const title = Object.hasOwn(legalSections, kind)
    ? legalSections[kind]
    : undefined;
  return (
    <Container className="grid gap-4 py-10">
      <SectionHeading as="h1">
        {typeof title === 'string' ? title : 'Page unavailable'}
      </SectionHeading>
      <p className="whitespace-pre-wrap wrap-anywhere">
        {(title && (settings.legal[kind] || legalServiceInformation[kind])) ||
          'This information has not been published.'}
      </p>
      {kind === 'copyright' && settings.supportOpen && (
        <Link
          to="/support/new"
          className="w-fit text-sm font-semibold text-accent"
        >
          Report a copyright concern
        </Link>
      )}
    </Container>
  );
}
