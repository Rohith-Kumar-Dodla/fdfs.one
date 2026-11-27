import { PublicFooter } from '../components/common/PublicFooter.jsx';
import { useEffect, useRef } from 'react';
import {
  Link,
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigation,
} from 'react-router';
import { legalSections } from '../../../shared/site.js';
import { SiteMetadata, useSiteSettings } from '../features/site/public.jsx';
import {
  AnalyticsPreferences,
  RealtimeProvider,
} from '../features/operations/Realtime.jsx';
import { AnnouncementBanners } from '../features/operations/Notices.jsx';
import { SiteHeader } from '../components/common/SiteHeader.jsx';
import { ToastViewport } from '../components/common/ToastViewport.jsx';
import { Container, SectionHeading } from '../components/ui/surfaces.jsx';
import { Spinner } from '../components/ui/states.jsx';

export function PublicLayout() {
  const main = useRef(null);
  const { pathname, hash } = useLocation();
  const navigation = useNavigation();
  const settings = useSiteSettings();
  const admin = /^\/admin(?:\/|$)/.test(pathname);
  const accountAccess =
    /^\/(?:login|register|forgot-password|reset-password|verify-email|verification-pending|account|support)(?:\/|$)/.test(
      pathname,
    );
  const maintenance = settings.maintenance && !admin && !accountAccess;
  const previousPath = useRef(pathname);

  useEffect(() => {
    const changedPage = previousPath.current !== pathname;
    previousPath.current = pathname;

    if (hash) {
      document.getElementById(hash.slice(1))?.focus({ preventScroll: true });
    } else if (changedPage) {
      main.current.focus({ preventScroll: true });
    }
  }, [pathname, hash]);

  return (
    <RealtimeProvider>
      <div className="flex min-h-dvh flex-col">
        <Link
          to="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded-control focus:bg-accent focus:px-4 focus:py-2 focus:text-ink"
        >
          Skip to content
        </Link>
        <SiteMetadata path={pathname} settings={settings} />
        {!admin && <SiteHeader settings={settings} />}
        {!admin && <AnnouncementBanners />}
        <main
          ref={main}
          id="main-content"
          tabIndex={-1}
          className="flex-1 focus:outline-none"
        >
          {navigation.state === 'loading' && (
            <Container className="pt-4">
              <Spinner label="Loading page" />
            </Container>
          )}
          {maintenance ? (
            <Container className="grid justify-items-start gap-4 py-16">
              <SectionHeading as="h1">Website maintenance</SectionHeading>
              <p className="text-muted">Please check back shortly.</p>
              <Link className="text-accent underline" to="/login">
                Sign in
              </Link>
            </Container>
          ) : (
            <Outlet />
          )}
        </main>
        {admin ? (
          <footer className="border-t border-line bg-nav">
            <Container className="flex flex-wrap items-center justify-between gap-3 py-7">
              <Link to="/" className="font-bold tracking-tight">
                {settings.name === 'FDFS.ONE' ? (
                  <>
                    FDFS<span className="text-accent">.ONE</span>
                  </>
                ) : (
                  settings.name
                )}
              </Link>
              <Link
                to="/support"
                className="inline-flex min-h-11 items-center text-accent underline"
              >
                Support
              </Link>
              <AnalyticsPreferences />
              <small className="text-sm text-muted">
                {settings.footer ?? settings.description}
              </small>
              {(settings.contact ||
                settings.supportEmail ||
                settings.links.length > 0 ||
                settings.socials.length > 0 ||
                Object.keys(settings.legal).length > 0) && (
                <div className="grid w-full gap-2 wrap-anywhere text-sm">
                  {settings.contact && <p>{settings.contact}</p>}
                  {settings.supportEmail && (
                    <a
                      className="text-accent underline"
                      href={'mailto:' + settings.supportEmail}
                    >
                      {settings.supportEmail}
                    </a>
                  )}
                  <nav
                    className="flex flex-wrap gap-x-4 gap-y-2"
                    aria-label="Footer"
                  >
                    {[...settings.links, ...settings.socials].map(
                      ({ url, label }, index) => (
                        <a
                          className="inline-flex min-h-11 items-center text-accent underline"
                          key={url + index}
                          href={url}
                        >
                          {label}
                        </a>
                      ),
                    )}
                    {Object.keys(legalSections)
                      .filter((key) => settings.legal[key])
                      .map((key) => (
                        <Link
                          className="inline-flex min-h-11 items-center text-accent underline"
                          key={key}
                          to={'/legal/' + key}
                        >
                          {legalSections[key]}
                        </Link>
                      ))}
                  </nav>
                </div>
              )}
            </Container>
          </footer>
        ) : (
          <PublicFooter settings={settings} />
        )}
        <ToastViewport />
        <ScrollRestoration />
      </div>
    </RealtimeProvider>
  );
}
