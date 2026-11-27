import { useEffect, useRef } from 'react';
import { GlobalSearchButton } from '../../features/discovery/SearchButton.jsx';
import { Menu, X } from 'lucide-react';
import { Link, matchPath, useLocation } from 'react-router';
import { NotificationsLink } from '../../features/operations/Notices.jsx';
import { useAuthStore } from '../../features/auth/state.js';
import { AccountNavigation } from '../../features/auth/AccountNavigation.jsx';
import { modules } from '../../routes/modules.js';
import { useUiStore } from '../../stores/ui.js';
import { IconButton } from '../ui/Button.jsx';
import { Container } from '../ui/surfaces.jsx';

const links = [{ label: 'Home', path: '/' }, ...modules];
const mobileNavigationId = 'mobile-navigation';

function NavigationLinks({ pathname, onNavigate, mobile, hiddenModules }) {
  return (
    <ul className={mobile ? 'grid gap-1 py-3' : 'flex items-center gap-1'}>
      {links
        .filter(({ path }) => !hiddenModules.includes(path))
        .map(({ label, path, detailPath }) => {
          const active =
            matchPath({ path, end: path === '/' }, pathname) ||
            (detailPath && matchPath(detailPath, pathname));

          return (
            <li key={path}>
              <Link
                to={path}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={`flex min-h-11 items-center rounded-control px-2.5 text-sm font-semibold transition-colors hover:bg-surface hover:text-foreground ${active ? 'bg-accent/10 text-accent' : 'text-muted'}`}
              >
                {label}
              </Link>
            </li>
          );
        })}
    </ul>
  );
}

export function SiteHeader({
  settings = { name: 'FDFS.ONE', hiddenModules: [] },
}) {
  const { pathname, key } = useLocation();
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
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
    <header
      className="sticky top-0 z-30 border-b border-line/70 bg-nav"
      onKeyDown={handleEscape}
    >
      <Container className="flex min-h-16 max-w-[112rem]! items-center justify-between gap-2 lg:gap-3">
        <Link
          to="/"
          aria-label={settings.name + ' home'}
          className="max-w-48 min-w-0 wrap-anywhere text-[1.35rem] leading-none font-extrabold tracking-[-0.065em]"
          onClick={() => setOpen(false)}
        >
          {settings.logo?.url ? (
            <img
              src={settings.logo.url}
              alt=""
              className="max-h-10 max-w-36 object-contain"
            />
          ) : settings.name === 'FDFS.ONE' ? (
            <>
              FDFS<span className="text-accent">.ONE</span>
            </>
          ) : (
            settings.name
          )}
        </Link>
        <nav aria-label="Primary" className="hidden lg:block">
          <NavigationLinks
            pathname={pathname}
            hiddenModules={settings.hiddenModules}
          />
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <div className={signedIn ? 'block' : 'hidden lg:block'}>
            <AccountNavigation
              allowRegistration={
                settings.registrationOpen !== false && !settings.maintenance
              }
            />
          </div>
          {pathname !== '/' && !settings.maintenance && <GlobalSearchButton />}
          {signedIn && (
            <NotificationsLink
              className="relative grid size-11 shrink-0 place-items-center rounded-control text-foreground hover:bg-surface"
              icon
            />
          )}
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
        </div>
      </Container>
      <div
        id={mobileNavigationId}
        hidden={!open}
        className="border-t border-line lg:hidden"
      >
        <Container as="nav" aria-label="Mobile primary">
          <NavigationLinks
            pathname={pathname}
            hiddenModules={settings.hiddenModules}
            onNavigate={() => setOpen(false)}
            mobile
          />
          {!signedIn && (
            <div className="border-t border-line py-3">
              <AccountNavigation
                allowRegistration={
                  settings.registrationOpen !== false && !settings.maintenance
                }
                onNavigate={() => setOpen(false)}
              />
            </div>
          )}
        </Container>
      </div>
    </header>
  );
}
