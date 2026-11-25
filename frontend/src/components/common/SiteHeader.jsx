import { useEffect, useRef } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, matchPath, useLocation } from 'react-router';
import { AccountNavigation } from '../../features/auth/AccountNavigation.jsx';
import { modules } from '../../routes/modules.js';
import { useUiStore } from '../../stores/ui.js';
import { IconButton } from '../ui/Button.jsx';
import { Container } from '../ui/surfaces.jsx';

const links = [{ label: 'Home', path: '/' }, ...modules];
const mobileNavigationId = 'mobile-navigation';

function NavigationLinks({ pathname, onNavigate, mobile }) {
  return (
    <ul className={mobile ? 'grid gap-1 py-3' : 'flex items-center gap-1'}>
      {links.map(({ label, path, detailPath }) => {
        const active =
          matchPath({ path, end: path === '/' }, pathname) ||
          (detailPath && matchPath(detailPath, pathname));

        return (
          <li key={path}>
            <Link
              to={path}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={`flex min-h-11 items-center rounded-control px-3 text-sm font-semibold transition-colors hover:bg-surface hover:text-foreground ${active ? 'bg-accent/10 text-accent' : 'text-muted'}`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SiteHeader() {
  const { pathname, key } = useLocation();
  const open = useUiStore((state) => state.mobileMenuOpen);
  const setOpen = useUiStore((state) => state.setMobileMenuOpen);
  const toggle = useRef(null);

  useEffect(() => {
    setOpen(false);
  }, [key, setOpen]);

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia('(min-width: 64rem)');
    const closeAtDesktop = (event) => {
      if (event.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeAtDesktop);
    return () => desktop.removeEventListener('change', closeAtDesktop);
  }, [open, setOpen]);

  function handleEscape(event) {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      toggle.current.focus();
    }
  }

  return (
    <header className="border-b border-line bg-nav" onKeyDown={handleEscape}>
      <Container className="flex min-h-[4.5rem] items-center justify-between gap-4">
        <Link
          to="/"
          aria-label="FDFS.ONE home"
          className="shrink-0 text-[1.35rem] leading-none font-extrabold tracking-[-0.065em]"
          onClick={() => setOpen(false)}
        >
          FDFS<span className="text-accent">.ONE</span>
        </Link>
        <nav aria-label="Primary" className="hidden lg:block">
          <NavigationLinks pathname={pathname} />
        </nav>
        <div className="hidden lg:block">
          <AccountNavigation />
        </div>
        <IconButton
          ref={toggle}
          className="lg:hidden"
          label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls={mobileNavigationId}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <X aria-hidden="true" className="size-6" />
          ) : (
            <Menu aria-hidden="true" className="size-6" />
          )}
        </IconButton>
      </Container>
      <div
        id={mobileNavigationId}
        hidden={!open}
        className="border-t border-line lg:hidden"
      >
        <Container as="nav" aria-label="Mobile primary">
          <NavigationLinks
            pathname={pathname}
            onNavigate={() => setOpen(false)}
            mobile
          />
          <div className="border-t border-line py-3">
            <AccountNavigation mobile onNavigate={() => setOpen(false)} />
          </div>
        </Container>
      </div>
    </header>
  );
}
