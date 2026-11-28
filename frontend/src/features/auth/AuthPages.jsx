import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { MailCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { useSiteSettings } from '../site/public.jsx';
import { accounts } from './api.js';
import { useAuthStore } from './state.js';
import {
  AuthForm,
  AuthPage,
  emailField,
  fullNameField,
  newPasswordField,
  passwordField,
} from './Form.jsx';
import { forms } from './schemas.js';

const linkClass =
  'font-semibold text-accent hover:text-accent-hover hover:underline';

export function LoginPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const settings = useSiteSettings();
  const target =
    ['/account', '/account/settings'].includes(state?.from) ||
    (typeof state?.from === 'string' &&
      /^\/(?:dashboard(?:\/[a-z-]+)?|talent\/[a-z0-9-]+|admin(?:\/[a-z0-9-]+)*|submissions\/new|creator\/films(?:\/new|\/[a-f0-9-]{36}\/correction)?|organizer\/live(?:\/new|\/[a-f0-9-]{36}(?:\/correction)?)?|account\/reviews|reviews(?:\/[a-z0-9-]+)?|(?:movies|cinema|originals|podcasts|live)\/[a-z0-9]+(?:-[a-z0-9]+)*)(?:[?#]|$)/.test(
        state.from,
      ))
      ? state.from
      : '/';

  const administrator = /^\/admin(?:\/|\?|$)/.test(target);
  return (
    <AuthPage
      title="Sign in"
      description={
        administrator
          ? 'Sign in to FDFS.ONE Administration.'
          : 'Sign in to manage your FDFS.ONE account.'
      }
    >
      {state?.verified && (
        <p role="status" className="text-success">
          Your Gmail is verified. You can sign in now.
        </p>
      )}
      <AuthForm
        fields={[{ ...emailField, autoComplete: 'username' }, passwordField]}
        schema={forms.login}
        action="Sign in"
        submit={async (values) => {
          try {
            await accounts.login(values);
          } catch (error) {
            if (error.code !== 'EMAIL_NOT_VERIFIED') throw error;
            navigate('/verify-email', { replace: true });
            return;
          }
          const { data: account } = await accounts.me();
          if (account.emailVerified && !account.roles.includes('super_admin'))
            useAuthStore.setState({ welcomePending: true });
          navigate(account.roles.includes('super_admin') ? '/admin' : target, {
            replace: true,
          });
        }}
      />
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link to="/forgot-password" className={linkClass}>
          Forgot password?
        </Link>
        {!administrator &&
          settings.registrationOpen &&
          !settings.maintenance && (
            <Link to="/register" className={linkClass}>
              Create an account
            </Link>
          )}
      </div>
    </AuthPage>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const settings = useSiteSettings();
  if (!settings.registrationOpen || settings.maintenance)
    return (
      <AuthPage title="Registration is currently closed">
        <Link to="/login" className={linkClass}>
          Sign in
        </Link>
      </AuthPage>
    );
  return (
    <AuthPage
      title="Create an account"
      description="A verified Gmail address is required to join FDFS.ONE."
    >
      <AuthForm
        fields={[
          fullNameField,
          emailField,
          { ...newPasswordField, label: 'Password' },
        ]}
        schema={forms.register}
        action="Create account"
        submit={async (values) => {
          await accounts.register(values);
          try {
            await accounts.beginVerification({
              email: values.email,
              password: values.password,
            });
            navigate('/verify-email', { replace: true });
          } catch (error) {
            if (error.status !== 401) throw error;
            navigate('/login', { replace: true });
          }
        }}
      />
      <Link to="/login" className={linkClass}>
        Already have an account? Sign in
      </Link>
    </AuthPage>
  );
}

function useEmailToken() {
  const { hash, pathname, search } = useLocation();
  const [token] = useState(() =>
    new URLSearchParams(hash.slice(1)).get('token'),
  );
  useEffect(() => {
    if (window.location.hash === hash && token) {
      window.history.replaceState(window.history.state, '', pathname + search);
    }
  }, [hash, pathname, search, token]);
  return /^[A-Za-z0-9_-]{43}$/.test(token ?? '') ? token : null;
}

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(null);
  const [now, setNow] = useState(Date.now);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  function update(data) {
    const receivedAt = Date.now();
    setSnapshot({ data, receivedAt });
    setNow(receivedAt);
  }

  const data = snapshot?.data;
  const serverNow = data
    ? data.serverTime + Math.max(0, now - snapshot.receivedAt)
    : null;
  const waiting =
    Math.max(0, Math.ceil((data?.retryAt - serverNow) / 1000)) || 0;
  const expires =
    Math.max(0, Math.ceil((data?.expiresAt - serverNow) / 1000)) || 0;
  const refreshState =
    !data || data.delivery === 'pending' || (Boolean(data.retryAt) && !waiting);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!refreshState) return;
    const controller = new AbortController();
    let timer;
    async function load() {
      try {
        const result = await accounts.verificationStatus({
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        update(result.data);
        if (result.data.delivery === 'pending')
          timer = window.setTimeout(load, 3000);
      } catch (failure) {
        if (!controller.signal.aborted) {
          if (failure.status === 401) setSnapshot(null);
          setError(failure.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [refreshState]);

  async function resend() {
    setError(null);
    setSending(true);
    try {
      const result = await accounts.resendVerification();
      update(result.data);
    } catch (failure) {
      if (failure.details?.serverTime) update(failure.details);
      if (failure.status === 401) setSnapshot(null);
      if (
        failure.code !== 'VERIFICATION_SEND_LIMIT' &&
        failure.code !== 'VERIFICATION_DELIVERY_FAILED'
      )
        setError(failure.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthPage title="Verify your Gmail">
      <div className="flex items-center gap-3 font-semibold text-accent">
        <MailCheck aria-hidden="true" className="size-6" />
        FDFS.ONE
      </div>
      {loading && <p role="status">Loading verification status…</p>}
      {error && (
        <p role="alert" className="text-danger-text">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="grid gap-2 text-sm text-muted">
            <p className="break-all">Gmail address {data.maskedEmail}</p>
            {data.delivery === 'accepted' && (
              <p role="status">
                A six-digit verification code was sent. Check your Gmail inbox.
              </p>
            )}
            {data.delivery === 'pending' && (
              <p role="status">Sending your code…</p>
            )}
            {data.delivery === 'failed' && (
              <p role="alert" className="text-danger-text">
                We could not confirm that the verification email was sent.
                {expires > 0 && ' You can still use your previous code.'}
              </p>
            )}
            {data.delivery === 'none' && (
              <p>Request a verification code to continue.</p>
            )}
            <p>
              Codes expire after 10 minutes. Check Spam and Promotions if the
              email is missing.
            </p>
            {data.expiresAt && expires <= 0 && (
              <p>Your code has expired. Request a new one.</p>
            )}
            {data.attemptsExhausted && (
              <p>Too many incorrect codes. Request a new one.</p>
            )}
          </div>
          <AuthForm
            fields={[
              {
                name: 'code',
                label: 'Six-digit verification code',
                inputMode: 'numeric',
                autoComplete: 'one-time-code',
                maxLength: 6,
              },
            ]}
            schema={forms.verify}
            action="Verify Email"
            disabled={!expires || data.attemptsExhausted}
            submit={async (values) => {
              try {
                await accounts.verifyEmail(values);
                navigate('/login', {
                  replace: true,
                  state: { verified: true },
                });
              } catch (failure) {
                if (failure.details?.serverTime) update(failure.details);
                throw failure;
              }
            }}
          />
          <div className="grid gap-2 text-sm text-muted">
            {!data.remainingRequests && waiting > 0 && (
              <p>
                You have reached the maximum number of verification email
                requests. Please try again after the displayed waiting period.
              </p>
            )}
            {waiting > 0 && (
              <p>
                Try again in {Math.floor(waiting / 60)}m{' '}
                {String(waiting % 60).padStart(2, '0')}s.
              </p>
            )}
            <p>
              {data.remainingRequests} verification email{' '}
              {data.remainingRequests === 1 ? 'request' : 'requests'} remaining
              in this window.
            </p>
            <Button
              variant="outline"
              className="w-fit"
              disabled={Boolean(waiting) || !data.remainingRequests}
              loading={sending}
              onClick={resend}
            >
              Resend Verification Code
            </Button>
          </div>
        </>
      )}
      <Link to="/login" className={linkClass}>
        Back to Sign In
      </Link>
    </AuthPage>
  );
}

export function ForgotPasswordPage() {
  return (
    <AuthPage
      title="Forgot password"
      description="Enter the email address for your FDFS.ONE account."
    >
      <AuthForm
        fields={[emailField]}
        schema={forms.email}
        action="Send reset link"
        submit={accounts.forgotPassword}
      />
      <Link to="/login" className={linkClass}>
        Back to sign in
      </Link>
    </AuthPage>
  );
}

export function ResetPasswordPage() {
  const token = useEmailToken();
  const [completed, setCompleted] = useState(false);
  return (
    <AuthPage title="Reset password">
      {token && !completed && (
        <AuthForm
          fields={[newPasswordField]}
          schema={forms.reset}
          action="Reset password"
          submit={async ({ password }) => {
            await accounts.resetPassword({ token, password });
            setCompleted(true);
          }}
        />
      )}
      {completed && (
        <p role="status" className="text-success">
          Password reset. Sign in with your new password.
        </p>
      )}
      {!token && (
        <p role="alert" className="text-danger-text">
          Open the reset link from your email or request a new one.
        </p>
      )}
      {completed ? (
        <Link to="/login" className={linkClass}>
          Sign in
        </Link>
      ) : (
        <Link to="/forgot-password" className={linkClass}>
          Request a reset link
        </Link>
      )}
    </AuthPage>
  );
}
