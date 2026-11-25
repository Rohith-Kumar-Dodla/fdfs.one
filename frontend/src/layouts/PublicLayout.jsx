import { useEffect, useRef } from 'react';
import {
  Link,
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigation,
} from 'react-router';
import { SiteHeader } from '../components/common/SiteHeader.jsx';
import { ToastViewport } from '../components/common/ToastViewport.jsx';
import { Container } from '../components/ui/surfaces.jsx';
import { Spinner } from '../components/ui/states.jsx';

export function PublicLayout() {
  const main = useRef(null);
  const { pathname, hash } = useLocation();
  const navigation = useNavigation();
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
    <div className="flex min-h-dvh flex-col">
      <Link
        to="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded-control focus:bg-accent focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </Link>
      <SiteHeader />
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
        <Outlet />
      </main>
      <footer className="border-t border-line bg-nav">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-7">
          <Link to="/" className="font-bold tracking-tight">
            FDFS<span className="text-accent">.ONE</span>
          </Link>
          <small className="text-sm text-muted">
            Film, culture and community.
          </small>
        </Container>
      </footer>
      <ToastViewport />
      <ScrollRestoration />
    </div>
  );
}
