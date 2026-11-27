import { useQuery } from '@tanstack/react-query';
import { LockKeyhole } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { buttonClasses } from '../../components/ui/Button.jsx';
import { ErrorState, Spinner } from '../../components/ui/states.jsx';
import { protectedRequest } from '../auth/api.js';
import { useAccount } from '../auth/guards.jsx';
import { useAuthStore } from '../auth/state.js';
import { FilmImage } from '../films/FilmImage.jsx';
import { useSiteSettings } from '../site/public.jsx';

export function PlaybackGate({
  module,
  slug,
  artwork,
  children,
  id = 'playback',
}) {
  const { pathname, search } = useLocation();
  const settings = useSiteSettings();
  const status = useAuthStore((state) => state.status);
  const generation = useAuthStore((state) => state.generation);
  const account = useAccount();
  const enabled =
    status === 'authenticated' &&
    account.data?.status === 'active' &&
    account.data?.emailVerified;
  const query = useQuery({
    queryKey: ['playback', generation, module, slug],
    enabled: Boolean(enabled),
    gcTime: 0,
    refetchInterval: 30000,
    queryFn: ({ signal }) =>
      protectedRequest({
        url: '/playback/' + module + '/' + encodeURIComponent(slug),
        signal,
      }).then(({ data }) => data),
  });
  if (enabled && query.isSuccess) return children(query.data);
  const checking =
    status === 'checking' ||
    (status === 'authenticated' && account.isPending) ||
    (enabled && query.isPending);
  return (
    <>
      <section
        id={id}
        tabIndex={-1}
        className="relative isolate grid min-w-0 scroll-mt-24 items-center overflow-hidden rounded-panel border border-line bg-nav"
      >
        <div className="absolute inset-0 -z-10 opacity-30 [&>*]:h-full">
          <FilmImage image={artwork} landscape eager />
        </div>
        <div className="grid min-h-56 content-center justify-items-center gap-3 p-5 text-center sm:min-h-72">
          {checking ? (
            <Spinner label="Checking playback access" />
          ) : enabled ? (
            <ErrorState
              title="Playback is unavailable"
              onRetry={() => void query.refetch()}
            />
          ) : (
            <>
              <LockKeyhole aria-hidden="true" className="size-7 text-accent" />
              <h2 className="text-xl font-bold">
                {status === 'authenticated'
                  ? 'Verify your email to watch'
                  : 'Sign in to watch'}
              </h2>
              <p className="max-w-md text-sm text-muted">
                Playback is available to active members with a verified email
                address.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {status === 'authenticated' ? (
                  <Link to="/verification-pending" className={buttonClasses()}>
                    Verify Email
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/login"
                      state={{ from: pathname + search + '#playback' }}
                      className={buttonClasses()}
                    >
                      Sign In
                    </Link>
                    {settings.registrationOpen && (
                      <Link to="/register" className={buttonClasses('outline')}>
                        Create Account
                      </Link>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
