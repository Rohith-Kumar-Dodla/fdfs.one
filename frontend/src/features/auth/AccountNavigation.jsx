import { can } from '../../../../shared/admin.js';
import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { NotificationsLink } from '../operations/Notices.jsx';
import { accounts } from './api.js';
import { useAuthStore } from './state.js';
import { useUiStore } from '../../stores/ui.js';
import { useAccount } from './guards.jsx';

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

export function AccountNavigation({
  onNavigate,
  mobile = false,
  allowRegistration = true,
}) {
  const status = useAuthStore((state) => state.status);
  const showToast = useUiStore((state) => state.showToast);
  const details = useRef(null);
  const [working, setWorking] = useState(false);
  const navigate = useNavigate();

  function close() {
    if (details.current) details.current.open = false;
    onNavigate?.();
  }

  async function logout() {
    setWorking(true);
    try {
      await accounts.logout();
      close();
      showToast('Signed out.');
      navigate('/', { replace: true });
    } catch (error) {
      showToast(error.message);
    } finally {
      setWorking(false);
    }
  }

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

  return (
    <details
      className="relative"
      ref={details}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && details.current.open) {
          event.stopPropagation();
          details.current.open = false;
          details.current.querySelector('summary').focus();
        }
      }}
    >
      <summary className={buttonClasses('outline', 'cursor-pointer list-none')}>
        Account <ChevronDown aria-hidden="true" className="size-4" />
      </summary>
      <div
        className={`z-20 mt-2 grid min-w-40 justify-items-start gap-1 rounded-panel border border-line bg-nav p-2 ${mobile ? '' : 'absolute right-0'}`}
      >
        <Link to="/account" className={buttonClasses('ghost')} onClick={close}>
          Profile
        </Link>
        <Link
          to="/account/settings"
          className={buttonClasses('ghost')}
          onClick={close}
        >
          Settings
        </Link>
        <NotificationsLink
          onNavigate={close}
          className={buttonClasses('ghost')}
        />
        <Link
          to="/support/tickets"
          onClick={close}
          className={buttonClasses('ghost')}
        >
          My support tickets
        </Link>
        <Link
          to="/account/reviews"
          onClick={close}
          className={buttonClasses('ghost')}
        >
          My reviews and ratings
        </Link>
        <AccountFeatureLinks onNavigate={close} />
        <Button variant="ghost" onClick={logout} loading={working}>
          Sign out
        </Button>
      </div>
    </details>
  );
}
