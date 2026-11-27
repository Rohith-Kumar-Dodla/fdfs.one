import { PublicFooter } from '../components/common/PublicFooter.jsx';
import { useEffect, useRef } from 'react';
import {
  Link,
  Navigate,
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigation,
} from 'react-router';
import { SiteMetadata, useSiteSettings } from '../features/site/public.jsx';
import { RealtimeProvider } from '../features/operations/Realtime.jsx';
import { AnnouncementBanners } from '../features/operations/Notices.jsx';
import { SiteHeader } from '../components/common/SiteHeader.jsx';
import { ToastViewport } from '../components/common/ToastViewport.jsx';
import { Container, SectionHeading } from '../components/ui/surfaces.jsx';
import { ErrorState, Spinner } from '../components/ui/states.jsx';
import { useAuthStore } from '../features/auth/state.js';
import { useAccount } from '../features/auth/guards.jsx';
import { Welcome } from '../features/auth/Welcome.jsx';

export function PublicLayout() {
  const main = useRef(null);
  const { pathname, hash } = useLocation();
  const navigation = useNavigation();
  const settings = useSiteSettings();
  const admin = /^\/admin(?:\/|$)/.test(pathname);
  const status = useAuthStore((state) => state.status);
  const account = useAccount();
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
      main.current?.focus({ preventScroll: true });
    }
  }, [pathname, hash]);

  if (!admin) {
    if (
      status === 'checking' ||
      (status === 'authenticated' && account.isPending)
    )
      return <Spinner label="Checking your account" />;
    if (status === 'authenticated' && account.isError)
      return (
        <ErrorState
          title="Could not load your account"
          onRetry={() => void account.refetch()}
        />
      );
    if (account.data?.roles.includes('super_admin'))
      return <Navigate to="/admin" replace />;
  }

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
          {!admin && navigation.state === 'loading' && (
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
        {!admin && <PublicFooter settings={settings} />}
        {!admin && <Welcome />}
        <ToastViewport />
        <ScrollRestoration />
      </div>
    </RealtimeProvider>
  );
}
