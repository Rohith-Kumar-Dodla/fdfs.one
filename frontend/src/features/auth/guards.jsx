import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { accountKeys, accounts, initializeAuth } from './api.js';
import { useAuthStore } from './state.js';
import { buttonClasses } from '../../components/ui/Button.jsx';
import { ErrorState, Spinner } from '../../components/ui/states.jsx';
import { Container } from '../../components/ui/surfaces.jsx';

export function useAccount() {
  const generation = useAuthStore((state) => state.generation);
  const status = useAuthStore((state) => state.status);
  return useQuery({
    queryKey: accountKeys.me(generation),
    queryFn: ({ signal }) =>
      accounts.me({ signal }).then((response) => response.data),
    enabled: status === 'authenticated',
  });
}

export function AccountGuard({ verified = false, roles }) {
  const status = useAuthStore((state) => state.status);
  const destination = useLocation();
  const user = useAccount();

  if (status === 'guest')
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: destination.pathname + destination.search }}
      />
    );
  if (status === 'unavailable')
    return (
      <Container className="py-12">
        <ErrorState
          title="Could not restore your session"
          description="Check your connection and try again."
          onRetry={initializeAuth}
        />
      </Container>
    );
  if (status === 'checking' || user.isPending)
    return (
      <Container className="py-12">
        <Spinner label="Checking your account" />
      </Container>
    );
  if (user.isError)
    return (
      <Container className="py-12">
        <ErrorState
          title="Could not load your account"
          description={user.error.message}
          onRetry={() => void user.refetch()}
        />
      </Container>
    );
  if (
    roles &&
    (user.data.status !== 'active' ||
      !roles.some((role) => user.data.roles.includes(role)))
  )
    return (
      <Container className="grid justify-items-start gap-4 py-12">
        <ErrorState
          title="Access restricted"
          description="Your account does not have permission to open this page."
        />
        <Link to="/account" className={buttonClasses('outline')}>
          Back to account
        </Link>
      </Container>
    );

  if (verified && !user.data.emailVerified)
    return <Navigate to="/verification-pending" replace />;
  return <Outlet context={user.data} />;
}
