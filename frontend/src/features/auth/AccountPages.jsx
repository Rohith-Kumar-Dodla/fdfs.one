import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Checkbox } from '../../components/ui/fields.jsx';
import {
  EmptyState,
  ErrorState,
  Spinner,
} from '../../components/ui/states.jsx';
import {
  Badge,
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import { accountKeys, accounts } from './api.js';
import {
  AuthForm,
  fullNameField,
  newPasswordField,
  passwordField,
} from './Form.jsx';
import { forms } from './schemas.js';
import { useAuthStore } from './state.js';
import { ProfileImageSettings } from '../media/Images.jsx';

const bioField = { name: 'bio', label: 'Biography', type: 'textarea' };

export function AccountProfilePage() {
  const user = useOutletContext();
  const generation = useAuthStore((state) => state.generation);
  const client = useQueryClient();

  return (
    <Container className="grid max-w-copy! gap-6 py-12">
      <SectionHeading as="h1">Account profile</SectionHeading>
      <Card className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-all text-sm text-muted">{user.email}</p>
          <Badge tone={user.emailVerified ? 'success' : 'warning'}>
            {user.emailVerified ? 'Email verified' : 'Email unverified'}
          </Badge>
        </div>
        {!user.emailVerified && (
          <Link
            to="/verification-pending"
            className="text-sm font-semibold text-accent"
          >
            Verify your email
          </Link>
        )}
        <AuthForm
          fields={[fullNameField, bioField]}
          schema={forms.profile}
          action="Save profile"
          defaultValues={{ fullName: user.fullName, bio: user.bio }}
          submit={async (values) => {
            const { data } = await accounts.updateProfile(values);
            client.setQueryData(accountKeys.me(generation), data);
            return { message: 'Profile saved.' };
          }}
        />
      </Card>
      <div className="flex flex-wrap gap-2">
        <Link to="/account/reviews" className={buttonClasses('outline')}>
          My reviews and ratings
        </Link>
        <Link to="/account/settings" className={buttonClasses('outline')}>
          Account settings
        </Link>
      </div>
    </Container>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function Sessions({ generation }) {
  const client = useQueryClient();
  const key = accountKeys.sessions(generation);
  const sessions = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      accounts.sessions({ signal }).then(({ data }) => data),
  });
  const [action, setAction] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  async function revoke() {
    setPending(true);
    setError('');
    setMessage('');
    try {
      if (action === 'all') await accounts.logoutAll();
      else await accounts.revoke(action.id);

      if (action === 'all' || action.current) {
        await accounts.endCurrentSession();
        navigate('/login', { replace: true });
      } else {
        await client.invalidateQueries({ queryKey: key });
        setMessage('Session revoked.');
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
      setAction(null);
    }
  }

  return (
    <Card
      as="section"
      aria-labelledby="sessions-heading"
      className="grid min-w-0 grid-cols-1 gap-4"
    >
      <h2 id="sessions-heading" className="text-xl font-semibold">
        Active sessions
      </h2>
      {sessions.isPending && <Spinner label="Loading sessions" />}
      {sessions.isError && (
        <ErrorState
          title="Could not load sessions"
          description={sessions.error.message}
          onRetry={() => void sessions.refetch()}
        />
      )}
      {sessions.data?.length === 0 && <EmptyState title="No active sessions" />}
      {sessions.data?.length > 0 && (
        <ul className="divide-y divide-line">
          {sessions.data.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0 flex-1 basis-52">
                <p className="text-sm font-semibold wrap-anywhere">
                  {session.userAgent || 'Unknown device'}
                </p>
                <p className="text-sm text-muted">
                  Last active {dateFormat.format(new Date(session.lastSeenAt))}
                </p>
                {session.current && (
                  <Badge tone="accent">Current session</Badge>
                )}
              </div>
              <Button variant="outline" onClick={() => setAction(session)}>
                Revoke session
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button variant="outline" onClick={() => setAction('all')}>
          Sign out all sessions
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      )}
      <Dialog
        open={Boolean(action)}
        onClose={() => {
          if (!pending) setAction(null);
        }}
        title={
          action === 'all' ? 'Sign out all sessions?' : 'Revoke this session?'
        }
      >
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setAction(null)}
          >
            Cancel
          </Button>
          <Button loading={pending} onClick={revoke}>
            Confirm
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

export function AccountSettingsPage() {
  const user = useOutletContext();
  const client = useQueryClient();
  const generation = useAuthStore((state) => state.generation);
  const navigate = useNavigate();

  return (
    <Container className="grid max-w-copy! grid-cols-1 gap-6 py-12">
      <SectionHeading as="h1">Account settings</SectionHeading>
      <Card
        as="section"
        aria-labelledby="profile-image-heading"
        className="grid min-w-0 gap-4"
      >
        <h2 id="profile-image-heading" className="text-xl font-semibold">
          Profile image
        </h2>
        <ProfileImageSettings key={user.id} account={user} />
      </Card>
      <Card
        as="section"
        aria-labelledby="preferences-heading"
        className="grid gap-4"
      >
        <h2 id="preferences-heading" className="text-xl font-semibold">
          Email preferences
        </h2>
        <AuthForm
          fields={[]}
          schema={forms.preferences}
          action="Save preferences"
          defaultValues={{ emailUpdates: user.preferences.emailUpdates }}
          submit={async (preferences) => {
            const { data } = await accounts.updateProfile({ preferences });
            client.setQueryData(accountKeys.me(generation), data);
            return { message: 'Preferences saved.' };
          }}
        >
          {({ register, isSubmitting }) => (
            <label className="flex items-center gap-3 text-sm">
              <Checkbox {...register('emailUpdates')} disabled={isSubmitting} />
              Email me FDFS.ONE updates
            </label>
          )}
        </AuthForm>
      </Card>
      <Card
        as="section"
        aria-labelledby="password-heading"
        className="grid gap-4"
      >
        <h2 id="password-heading" className="text-xl font-semibold">
          Change password
        </h2>
        <p className="text-sm text-muted">
          Changing your password signs out all your sessions.
        </p>
        <AuthForm
          fields={[
            {
              ...passwordField,
              name: 'currentPassword',
              label: 'Current password',
            },
            newPasswordField,
          ]}
          schema={forms.change}
          action="Change password"
          submit={async (values) => {
            await accounts.changePassword(values);
            await accounts.endCurrentSession();
            navigate('/login', { replace: true });
          }}
        />
      </Card>
      <Sessions generation={generation} />
    </Container>
  );
}
