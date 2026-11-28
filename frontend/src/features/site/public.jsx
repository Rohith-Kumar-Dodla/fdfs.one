import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import {
  legalSections,
  legalServiceInformation,
  siteDefaults,
} from '../../../../shared/site.js';
import { pageTitle, publicPages } from '../../../../shared/public-pages.js';
import { usePageMetadata } from '../../hooks/use-page-metadata.js';
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
  const page = Object.hasOwn(publicPages, path) ? publicPages[path] : undefined;
  const home = path === '/';
  usePageMetadata(
    page && {
      title: home ? settings.seoTitle || settings.name : pageTitle(page[0]),
      description: home
        ? settings.seoDescription ||
          (settings.description !== siteDefaults.description
            ? settings.description
            : page[1])
        : page[1],
      path,
      image: settings.socialImage?.url,
      structured: home
        ? { '@type': 'WebSite', name: settings.name }
        : undefined,
    },
  );
  useEffect(() => {
    if (!settings.favicon?.url) return;
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = settings.favicon.url;
    document.head.append(link);
    return () => link.remove();
  }, [settings.favicon?.url]);
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
