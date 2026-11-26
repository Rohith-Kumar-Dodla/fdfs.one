import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router';
import { accountKeys, accounts } from './api.js';
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
  const target =
    ['/account', '/account/settings'].includes(state?.from) ||
    (typeof state?.from === 'string' &&
      /^\/(?:submissions\/new|creator\/films(?:\/new|\/[a-f0-9-]{36}\/correction)?)(?:\?|$)/.test(
        state.from,
      ))
      ? state.from
      : '/account';

  return (
    <AuthPage
      title="Sign in"
      description="Sign in to manage your FDFS.ONE account."
    >
      <AuthForm
        fields={[{ ...emailField, autoComplete: 'username' }, passwordField]}
        schema={forms.login}
        action="Sign in"
        submit={async (values) => {
          await accounts.login(values);
          navigate(target, { replace: true });
        }}
      />
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link to="/forgot-password" className={linkClass}>
          Forgot password?
        </Link>
        <Link to="/register" className={linkClass}>
          Create an account
        </Link>
      </div>
    </AuthPage>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  return (
    <AuthPage title="Create an account">
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
          navigate('/verification-pending', { replace: true });
        }}
      />
      <Link to="/login" className={linkClass}>
        Already have an account? Sign in
      </Link>
    </AuthPage>
  );
}

export function VerificationPendingPage() {
  return (
    <AuthPage
      title="Check your email"
      description="If the address is eligible, you’ll receive a verification link. You can sign in while you wait."
    >
      <AuthForm
        fields={[emailField]}
        schema={forms.email}
        action="Resend verification email"
        submit={accounts.resendVerification}
      />
      <Link to="/login" className={linkClass}>
        Sign in
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
  const token = useEmailToken();
  const client = useQueryClient();
  const [verified, setVerified] = useState(false);

  return (
    <AuthPage title="Verify your email">
      {token && !verified && (
        <AuthForm
          fields={[passwordField]}
          schema={forms.verify}
          action="Verify email"
          submit={async ({ password }) => {
            await accounts.verifyEmail({ token, password });
            await client.invalidateQueries({ queryKey: accountKeys.all });
            setVerified(true);
          }}
        />
      )}
      {!token && (
        <p role="alert" className="text-danger-text">
          Open the verification link from your email or request a new one.
        </p>
      )}
      {verified && (
        <p role="status" className="text-success">
          Your email is verified.
        </p>
      )}
      {verified ? (
        <Link to="/account" className={linkClass}>
          Go to your account
        </Link>
      ) : (
        <Link to="/verification-pending" className={linkClass}>
          Request a new link
        </Link>
      )}
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
