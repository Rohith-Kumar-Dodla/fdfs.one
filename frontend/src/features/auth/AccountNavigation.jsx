import { can } from '../../../../shared/admin.js';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { roleLabels, staffRoles } from '../../../../shared/admin.js';
import { Link, useNavigate } from 'react-router';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { accounts, protectedRequest } from './api.js';
import { useAuthStore } from './state.js';
import { useUiStore } from '../../stores/ui.js';
import { useAccount } from './guards.jsx';
import { communityChannel } from './Welcome.jsx';

function AccountFeatureLinks({ onNavigate }) {
  const { data: account } = useAccount();
  if (!account?.emailVerified) return null;
  return (
    <>
      <Link
        to="/submissions"
        className={buttonClasses('ghost')}
        onClick={onNavigate}
      >
        My submissions
      </Link>
      {account.roles.includes('creator') && (
        <Link
          to="/creator/films"
          className={buttonClasses('ghost')}
          onClick={onNavigate}
        >
          My films
        </Link>
      )}
      {account.roles.includes('organizer') && (
        <Link
          to="/organizer/live"
          className={buttonClasses('ghost')}
          onClick={onNavigate}
        >
          My live events
        </Link>
      )}
      {(can(account, 'dashboard') || can(account, 'support')) && (
        <Link
          to="/admin"
          className={buttonClasses('ghost')}
          onClick={onNavigate}
        >
          Administration
        </Link>
      )}
    </>
  );
}

export function useSignOut(onSuccess) {
  const showToast = useUiStore((state) => state.showToast);
  const [working, setWorking] = useState(false);
  const navigate = useNavigate();
  async function logout() {
    setWorking(true);
    try {
      await accounts.logout();
      onSuccess?.();
      showToast('Signed out.');
      navigate('/', { replace: true });
    } catch (error) {
      showToast(error.message);
    } finally {
      setWorking(false);
    }
  }
  return { logout, working };
}

const destinations = [
  ['/account', 'My Profile'],
  ['/dashboard', 'My Dashboard'],
  ['/dashboard/watchlist', 'Watchlist'],
  ['/dashboard/history', 'Watch History'],
  ['/account/reviews', 'My Reviews'],
  ['/account/settings', 'Settings'],
  ['/support', 'Support'],
];

export function AccountNavigation({
  onNavigate,
  administrator = false,
  allowRegistration = true,
}) {
  const status = useAuthStore((state) => state.status);
  const { data: account } = useAccount();
  const details = useRef(null);
  const image = useQuery({
    queryKey: ['profile-image', account?.id],
    enabled: Boolean(account?.emailVerified),
    queryFn: ({ signal }) =>
      protectedRequest({ url: '/users/me/image', signal }).then(
        ({ data }) => data?.image ?? null,
      ),
  });

  function close() {
    if (details.current) details.current.open = false;
    onNavigate?.();
  }
  const { logout, working } = useSignOut(close);
  if (status === 'checking') return null;
  if (status !== 'authenticated') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/login"
          className={buttonClasses('ghost')}
          onClick={onNavigate}
        >
          Sign in
        </Link>
        {allowRegistration && (
          <Link
            to="/register"
            className={buttonClasses('primary')}
            onClick={onNavigate}
          >
            Register
          </Link>
        )}
      </div>
    );
  }

  const name = account?.fullName ?? '';
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  const role = staffRoles.find((key) => account?.roles.includes(key));
  return (
    <details
      className="relative"
      ref={details}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && details.current.open) {
          event.stopPropagation();
          details.current.open = false;
          details.current.querySelector('summary').focus();
        }
      }}
    >
      <summary
        aria-label="Account menu"
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control"
      >
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-accent font-bold text-ink">
          {image.data?.url ? (
            <img
              src={image.data.url}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            initials || 'F'
          )}
        </span>
        {administrator && (
          <span className="hidden max-w-48 text-left sm:block">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block truncate text-xs text-muted">
              {roleLabels[role]}
            </span>
          </span>
        )}
      </summary>
      <div className="absolute right-0 z-30 mt-2 grid max-h-[calc(100dvh-5rem)] min-w-48 overflow-y-auto rounded-panel border border-line bg-nav p-2">
        {!account?.roles.includes('super_admin') &&
          destinations.map(([to, label]) => (
            <Link
              key={to}
              to={to}
              className={buttonClasses('ghost', 'justify-start!')}
              onClick={close}
            >
              {label}
            </Link>
          ))}
        {!account?.roles.includes('super_admin') && (
          <>
            <AccountFeatureLinks onNavigate={close} />
            <a
              href={communityChannel}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses('ghost', 'justify-start!')}
              onClick={close}
            >
              WhatsApp Community
            </a>
          </>
        )}
        <Button
          variant="ghost"
          className="justify-start!"
          onClick={logout}
          loading={working}
        >
          Sign out
        </Button>
      </div>
    </details>
  );
}
