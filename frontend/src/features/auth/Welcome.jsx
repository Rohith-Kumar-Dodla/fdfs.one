import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { protectedRequest } from './api.js';
import { useAccount } from './guards.jsx';
import { useAuthStore } from './state.js';

export const communityChannel =
  'https://whatsapp.com/channel/0029Vb9Q7ifDuMRnKEWYpG0O';
const benefits = [
  'Movie discussions and updates.',
  'Casting opportunities.',
  'Filmmaking and creative collaborations.',
  'Exclusive announcements.',
  'Short films, podcasts and live events.',
];

const pathWithPlayback =
  /^\/(?:cinema|originals|podcasts|live|movies)\/[^/]+\/?$/;
const authPage =
  /^\/(?:login|register|forgot-password|reset-password|verify-email|verification-pending)(?:\/|$)/;

export function Welcome() {
  const { pathname } = useLocation();
  const { data: account } = useAccount();
  const pending = useAuthStore((state) => state.welcomePending);
  const generation = useAuthStore((state) => state.generation);
  const enabled = Boolean(
    pending &&
    account?.emailVerified &&
    account.status === 'active' &&
    !account.roles.includes('super_admin') &&
    !pathWithPlayback.test(pathname) &&
    !authPage.test(pathname),
  );
  const welcome = useQuery({
    queryKey: ['welcome', generation],
    enabled,
    retry: false,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const { data } = await protectedRequest({
        method: 'post',
        url: '/users/me/welcome',
        data: { action: 'present' },
        signal,
      });
      return data.show;
    },
  });
  function acknowledge() {
    useAuthStore.setState({ welcomePending: false });
    void protectedRequest({
      method: 'post',
      url: '/users/me/welcome',
      data: { action: 'acknowledge' },
    }).catch(() => {});
  }
  return (
    <Dialog
      open={enabled && welcome.data === true}
      onClose={acknowledge}
      title="Welcome to FDFS.ONE"
      className="bg-nav text-foreground [&_h2]:text-accent"
    >
      <div className="grid min-w-0 gap-4 wrap-anywhere">
        <p className="text-lg font-semibold text-accent">
          Where Passion Meets Talent
        </p>
        <p>
          Discover independent cinema, exclusive originals, podcasts, live
          events, movie reviews and talented personalities — all in one place.
        </p>
        <div className="grid min-w-0 gap-2">
          <h3 className="text-lg font-semibold text-accent">
            Be Part of Our Community
          </h3>
          <p>
            Connect with cinema enthusiasts and discover creative opportunities
            through our official WhatsApp channel.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {benefits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={communityChannel}
            target="_blank"
            rel="noopener noreferrer"
            className={
              buttonClasses('outline') +
              ' bg-green-800! text-white! hover:bg-green-700!'
            }
            onClick={acknowledge}
          >
            Join Our WhatsApp Channel
          </a>
          <Button variant="outline" onClick={acknowledge}>
            Maybe Later
          </Button>
        </div>
        <p className="text-sm font-semibold text-accent">
          One Community. Endless Possibilities.
        </p>
      </div>
    </Dialog>
  );
}
