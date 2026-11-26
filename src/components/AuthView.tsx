import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import { ApiError, apiRequest, setAuthToken } from '../api.ts';
import type { AuthStatus, AuthUser, ThemeMode } from '../types.ts';
import { BrandLogo } from './BrandLogo.tsx';

interface AuthViewProps {
  status: AuthStatus;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onAuthenticated: (user: AuthUser) => void;
}

type AuthTab = 'signin' | 'signup';
type ViewMode = 'auth' | 'forgot-verify' | 'forgot-reset' | 'forgot-success';

interface AuthResponse {
  token: string;
  user: AuthUser;
}

interface ForgotVerifyResponse {
  resetToken: string;
  expiresInSeconds: number;
  username: string;
  fullName: string;
}

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function evaluatePassword(pw: string) {
  const hasLength = pw.length >= 8;
  const hasMixedCase = /[a-z]/.test(pw) && /[A-Z]/.test(pw);
  const hasNumberOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw);
  const score = [hasLength, hasMixedCase, hasNumberOrSymbol].filter(Boolean).length;
  const label = score === 0 ? 'Too short' : score === 1 ? 'Weak' : score === 2 ? 'Fair' : 'Strong';
  return { hasLength, hasMixedCase, hasNumberOrSymbol, score, label };
}

const INPUT_BASE =
  'h-10.5 w-full rounded-md border bg-white px-3.5 text-sm text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';
const INPUT_NORMAL =
  'border-slate-300 hover:border-slate-400 focus:border-blue-900 focus:ring-blue-900/12 dark:border-slate-700 dark:hover:border-slate-600 dark:focus:border-blue-400 dark:focus:ring-blue-400/20';
const INPUT_INVALID =
  'border-rose-400 focus:border-rose-600 focus:ring-rose-600/15 dark:border-rose-500/80 dark:focus:border-rose-400 dark:focus:ring-rose-400/20';
const INPUT_VALID =
  'border-emerald-500/80 hover:border-emerald-600 focus:border-blue-900 focus:ring-blue-900/12 dark:border-emerald-500/60 dark:focus:border-blue-400 dark:focus:ring-blue-400/20';

export function AuthView({
  status,
  theme,
  onToggleTheme,
  onAuthenticated,
}: AuthViewProps) {
  const [tab, setTab] = useState<AuthTab>(status.hasUsers ? 'signin' : 'signup');
  const [viewMode, setViewMode] = useState<ViewMode>('auth');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // Sign In state
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberExtended, setRememberExtended] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [signinTouched, setSigninTouched] = useState<{ identifier?: boolean; password?: boolean }>({});

  // Sign Up state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryPin, setRecoveryPin] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showRecoveryPin, setShowRecoveryPin] = useState(false);
  const [signupTouched, setSignupTouched] = useState<Record<string, boolean>>({});

  // Forgot password state
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotPin, setForgotPin] = useState('');
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [verifiedUsername, setVerifiedUsername] = useState('');
  const [resetExpiresSeconds, setResetExpiresSeconds] = useState(0);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetNewPw, setShowResetNewPw] = useState(false);
  const [showResetConfirmPw, setShowResetConfirmPw] = useState(false);
  const [forgotTouched, setForgotTouched] = useState<Record<string, boolean>>({});

  const signinTabRef = useRef<HTMLButtonElement>(null);
  const signupTabRef = useRef<HTMLButtonElement>(null);
  const signinPasswordRef = useRef<HTMLInputElement>(null);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setLockoutSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutSeconds]);

  // Reset token expiry countdown timer
  useEffect(() => {
    if (viewMode !== 'forgot-reset' || resetExpiresSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResetExpiresSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [viewMode, resetExpiresSeconds]);

  // Validation memos
  const signupValidation = useMemo(() => {
    const cleanName = fullName.trim();
    const cleanUser = username.trim();
    const cleanEmail = email.trim();
    const cleanPin = recoveryPin.trim();

    const fullNameValid = cleanName.length >= 2 && cleanName.length <= 100;
    const usernameValid = /^[a-zA-Z0-9_.-]{3,32}$/.test(cleanUser);
    const emailValid = cleanEmail.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    const passwordValid = password.length >= 8 && password.length <= 128;
    const confirmValid = confirmPassword.length > 0 && password === confirmPassword;
    const recoveryPinValid =
      cleanPin.length === 0 || (cleanPin.length >= 4 && cleanPin.length <= 24);

    return {
      fullNameValid,
      usernameValid,
      emailValid,
      passwordValid,
      confirmValid,
      recoveryPinValid,
      allValid:
        fullNameValid &&
        usernameValid &&
        emailValid &&
        passwordValid &&
        confirmValid &&
        recoveryPinValid,
    };
  }, [fullName, username, email, password, confirmPassword, recoveryPin]);

  const signinValidation = useMemo(() => {
    const identifierValid = identifier.trim().length > 0;
    const passwordValid = loginPassword.length > 0;
    return {
      identifierValid,
      passwordValid,
      allValid: identifierValid && passwordValid,
    };
  }, [identifier, loginPassword]);

  const signupStrength = useMemo(() => evaluatePassword(password), [password]);
  const resetStrength = useMemo(() => evaluatePassword(resetNewPassword), [resetNewPassword]);

  const resetConfirmValid =
    resetConfirmPassword.length === 0 || resetNewPassword === resetConfirmPassword;

  const switchTab = (next: AuthTab) => {
    setError(null);
    setViewMode('auth');
    setTab(next);
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, current: AuthTab) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next: AuthTab = current === 'signin' ? 'signup' : 'signin';
      switchTab(next);
      window.requestAnimationFrame(() => {
        (next === 'signin' ? signinTabRef.current : signupTabRef.current)?.focus();
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      switchTab('signin');
      window.requestAnimationFrame(() => signinTabRef.current?.focus());
    } else if (e.key === 'End') {
      e.preventDefault();
      switchTab('signup');
      window.requestAnimationFrame(() => signupTabRef.current?.focus());
    }
  };

  const handleApiError = (err: unknown, fallbackMessage: string) => {
    if (err instanceof ApiError) {
      if (err.status === 429 && err.retryAfterSeconds && err.retryAfterSeconds > 0) {
        setLockoutSeconds(err.retryAfterSeconds);
      }
      setError(err.message);
      return;
    }
    setError(err instanceof Error ? err.message : fallbackMessage);
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSignupTouched({
      fullName: true,
      username: true,
      email: true,
      password: true,
      confirmPassword: true,
      recoveryPin: true,
    });

    if (!signupValidation.fullNameValid) {
      setError('Full name must be between 2 and 100 characters.');
      return;
    }
    if (!signupValidation.usernameValid) {
      setError(
        'Username must be 3–32 characters using letters, numbers, dots, underscores, or hyphens.'
      );
      return;
    }
    if (!signupValidation.emailValid) {
      setError('Enter a valid email address.');
      return;
    }
    if (!signupValidation.passwordValid) {
      setError('Password must be between 8 and 128 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and confirmation password do not match.');
      return;
    }
    if (!signupValidation.recoveryPinValid) {
      setError('Recovery PIN must be between 4 and 24 characters (or leave blank).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<AuthResponse>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: username.trim(),
          email: email.trim(),
          department: department.trim(),
          password,
          recoveryPin: recoveryPin.trim() || undefined,
        }),
      });
      setLockoutSeconds(0);
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      handleApiError(err, 'Unable to create account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSigninTouched({ identifier: true, password: true });

    if (!signinValidation.identifierValid || !signinValidation.passwordValid) {
      setError('Please enter both your username or email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: identifier.trim(),
          password: loginPassword,
          rememberExtended,
        }),
      });
      setLockoutSeconds(0);
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      handleApiError(err, 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const openForgotPassword = () => {
    setError(null);
    setForgotIdentifier(identifier.trim());
    setForgotPin('');
    setForgotTouched({});
    setViewMode('forgot-verify');
  };

  const handleVerifyRecoveryPin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotTouched({ identifier: true, pin: true });

    if (!forgotIdentifier.trim() || forgotPin.trim().length < 4) {
      setError('Enter your username or email and your Recovery PIN (at least 4 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<ForgotVerifyResponse>('/api/auth/forgot-password/verify', {
        method: 'POST',
        body: JSON.stringify({
          identifier: forgotIdentifier.trim(),
          recoveryPin: forgotPin.trim(),
        }),
      });
      setLockoutSeconds(0);
      setResetToken(res.resetToken);
      setVerifiedUsername(res.username);
      setResetExpiresSeconds(res.expiresInSeconds);
      setResetNewPassword('');
      setResetConfirmPassword('');
      setForgotTouched({});
      setViewMode('forgot-reset');
    } catch (err) {
      handleApiError(err, 'Unable to verify Recovery PIN.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotTouched({ newPassword: true, confirmPassword: true });

    if (resetExpiresSeconds <= 0) {
      setError('Your password reset session expired. Please verify your Recovery PIN again.');
      return;
    }
    if (resetNewPassword.length < 8 || resetNewPassword.length > 128) {
      setError('New password must be between 8 and 128 characters.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setError('New password and confirmation password do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<{ message: string }>('/api/auth/forgot-password/reset', {
        method: 'POST',
        body: JSON.stringify({
          resetToken,
          newPassword: resetNewPassword,
        }),
      });
      setLockoutSeconds(0);
      setIdentifier(verifiedUsername || forgotIdentifier.trim());
      setLoginPassword('');
      setResetToken('');
      setForgotPin('');
      setViewMode('forgot-success');
    } catch (err) {
      handleApiError(err, 'Unable to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  const returnToSignInAfterReset = () => {
    setError(null);
    setTab('signin');
    setViewMode('auth');
    window.requestAnimationFrame(() => signinPasswordRef.current?.focus());
  };

  const isLockedOut = lockoutSeconds > 0;

  return (
    <div className="min-h-screen bg-white text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100 lg:grid lg:grid-cols-12">
      {/* Left Institutional Brand & Campus Column */}
      <aside className="relative flex min-h-[260px] flex-col justify-between overflow-hidden bg-slate-900 px-6 py-8 text-white sm:min-h-[300px] sm:px-12 sm:py-10 lg:col-span-5 lg:min-h-screen lg:px-12 lg:py-12">
        <img
          src="/src/assets/images/african_campus_students_1795729406096.jpg"
          alt="Black African students walking along a sunlit campus courtyard surrounded by brick academic buildings"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/92 via-slate-950/45 to-slate-950/80"
          aria-hidden="true"
        />

        <div className="relative z-10 flex items-center justify-between gap-4">
          <BrandLogo
            size="lg"
            theme="dark"
            subtitle="Academic & Financial Portal"
          />
        </div>

        <div className="relative z-10 mt-10 max-w-md sm:mt-14 lg:mt-auto">
          <h1 className="text-2xl font-bold tracking-tight text-white [text-wrap:balance] sm:text-3xl lg:text-4xl">
            Manage academic life in one unified portal.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-200 sm:mt-4">
            Coordinate student admissions, faculty courses, semester enrollments,
            examination transcripts, and KSh fee payments with clarity.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-white/15 pt-4 text-xs font-medium text-slate-300 sm:mt-8 sm:pt-5">
            <span>Students</span>
            <span className="text-slate-500" aria-hidden="true">·</span>
            <span>Lecturers</span>
            <span className="text-slate-500" aria-hidden="true">·</span>
            <span>Courses</span>
            <span className="text-slate-500" aria-hidden="true">·</span>
            <span>Examinations</span>
            <span className="text-slate-500" aria-hidden="true">·</span>
            <span>KSh Tuition</span>
          </div>
        </div>
      </aside>

      {/* Right Interactive Sign Up / Sign In / Recovery Workspace */}
      <main className="flex flex-col justify-between bg-white px-5 py-8 transition-colors duration-200 dark:bg-slate-950 sm:px-10 sm:py-10 lg:col-span-7 lg:px-16 lg:py-10">
        {/* Top Utility Header */}
        <div className="mx-auto flex w-full max-w-[496px] items-center justify-between gap-4 lg:justify-end">
          <div className="lg:hidden">
            <BrandLogo
              size="md"
              theme="auto"
              subtitle="Academic & Financial Registry"
            />
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>

        <div className="mx-auto mt-6 flex w-full max-w-[496px] flex-1 flex-col justify-center lg:mt-4">
          {viewMode === 'auth' && (
            <>
              {/* Editorial Underline Tab Switcher */}
              <div
                className="flex items-center gap-8 border-b border-slate-200 dark:border-slate-800"
                role="tablist"
                aria-label="Authentication mode"
              >
                <button
                  ref={signinTabRef}
                  id="auth-tab-signin"
                  type="button"
                  role="tab"
                  aria-selected={tab === 'signin'}
                  aria-controls="auth-panel-signin"
                  tabIndex={tab === 'signin' ? 0 : -1}
                  onClick={() => switchTab('signin')}
                  onKeyDown={(e) => handleTabKeyDown(e, 'signin')}
                  className={`relative -mb-px inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-900/40 focus-visible:rounded-t-xs dark:focus-visible:ring-blue-400/50 ${
                    tab === 'signin'
                      ? 'border-blue-900 text-slate-900 dark:border-blue-400 dark:text-white'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Sign In</span>
                </button>
                <button
                  ref={signupTabRef}
                  id="auth-tab-signup"
                  type="button"
                  role="tab"
                  aria-selected={tab === 'signup'}
                  aria-controls="auth-panel-signup"
                  tabIndex={tab === 'signup' ? 0 : -1}
                  onClick={() => switchTab('signup')}
                  onKeyDown={(e) => handleTabKeyDown(e, 'signup')}
                  className={`relative -mb-px inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-900/40 focus-visible:rounded-t-xs dark:focus-visible:ring-blue-400/50 ${
                    tab === 'signup'
                      ? 'border-blue-900 text-slate-900 dark:border-blue-400 dark:text-white'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Create Account</span>
                </button>
              </div>
            </>
          )}

          {/* Brute-Force Lockout Countdown Banner */}
          {isLockedOut && (
            <div
              role="status"
              aria-live="polite"
              className="animate-alert-enter mt-5 flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <ShieldAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Temporary security lock active</p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/80">
                  Too many unsuccessful attempts. You can try again in{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {formatCountdown(lockoutSeconds)}
                  </span>
                  .
                </p>
              </div>
            </div>
          )}

          {/* Validation / API Error Banner */}
          {error && (
            <div
              role="alert"
              className="animate-alert-enter mt-5 flex items-start gap-2.5 rounded-md border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-200"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400"
                aria-hidden="true"
              />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* VIEW 1: SIGN IN */}
          {viewMode === 'auth' && tab === 'signin' && (
            <form
              id="auth-panel-signin"
              role="tabpanel"
              aria-labelledby="auth-tab-signin"
              onSubmit={handleSignIn}
              className="animate-panel-enter mt-7 space-y-5"
              noValidate
            >
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] dark:text-white">
                  Sign in to your account
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Enter your registered username or email address and password to continue.
                </p>
              </div>

              <div>
                <label
                  htmlFor="signin-identifier"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Username or Email
                </label>
                <input
                  id="signin-identifier"
                  type="text"
                  required
                  autoComplete="username"
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onBlur={() => setSigninTouched((prev) => ({ ...prev, identifier: true }))}
                  aria-invalid={signinTouched.identifier && !signinValidation.identifierValid}
                  aria-describedby={
                    signinTouched.identifier && !signinValidation.identifierValid
                      ? 'signin-identifier-error'
                      : undefined
                  }
                  placeholder="registry.admin or name@university.ac.ke"
                  className={`mt-1.5 ${INPUT_BASE} ${
                    signinTouched.identifier && !signinValidation.identifierValid
                      ? INPUT_INVALID
                      : INPUT_NORMAL
                  }`}
                />
                {signinTouched.identifier && !signinValidation.identifierValid && (
                  <p
                    id="signin-identifier-error"
                    className="mt-1 text-xs text-rose-700 dark:text-rose-400"
                  >
                    Enter your username or email address.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="signin-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={openForgotPassword}
                    className="rounded-xs text-xs font-semibold text-blue-900 hover:underline focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-blue-400 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <input
                    ref={signinPasswordRef}
                    id="signin-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onBlur={() => setSigninTouched((prev) => ({ ...prev, password: true }))}
                    aria-invalid={signinTouched.password && !signinValidation.passwordValid}
                    aria-describedby={
                      signinTouched.password && !signinValidation.passwordValid
                        ? 'signin-password-error'
                        : undefined
                    }
                    className={`${INPUT_BASE} pr-10 ${
                      signinTouched.password && !signinValidation.passwordValid
                        ? INPUT_INVALID
                        : INPUT_NORMAL
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((v) => !v)}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showLoginPassword}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-400 transition-colors hover:text-slate-700 focus-visible:text-blue-900 focus-visible:outline-none dark:text-slate-500 dark:hover:text-slate-200 dark:focus-visible:text-blue-400"
                  >
                    {showLoginPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {signinTouched.password && !signinValidation.passwordValid && (
                  <p
                    id="signin-password-error"
                    className="mt-1 text-xs text-rose-700 dark:text-rose-400"
                  >
                    Enter your account password.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600 select-none dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={rememberExtended}
                    onChange={(e) => setRememberExtended(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-900 accent-blue-900 focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-1 dark:border-slate-700 dark:bg-slate-900 dark:accent-blue-500"
                  />
                  <span>Keep session active for 24 hours</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting || isLockedOut}
                aria-busy={submitting}
                className="group flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-900 px-5 text-sm font-semibold text-white whitespace-nowrap shadow-xs transition-all duration-150 hover:bg-blue-950 focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950"
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                )}
                <span>
                  {submitting
                    ? 'Verifying credentials...'
                    : isLockedOut
                      ? `Locked (${formatCountdown(lockoutSeconds)})`
                      : 'Sign In'}
                </span>
                {!submitting && !isLockedOut && (
                  <ArrowRight
                    className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                )}
              </button>

              <p className="pt-1 text-center text-xs text-slate-600 dark:text-slate-400">
                New to the portal?{' '}
                <button
                  type="button"
                  onClick={() => switchTab('signup')}
                  className="rounded-xs font-semibold text-blue-900 hover:underline focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-blue-400 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950"
                >
                  Create an account
                </button>
              </p>
            </form>
          )}

          {/* VIEW 2: CREATE ACCOUNT */}
          {viewMode === 'auth' && tab === 'signup' && (
            <form
              id="auth-panel-signup"
              role="tabpanel"
              aria-labelledby="auth-tab-signup"
              onSubmit={handleSignUp}
              className="animate-panel-enter mt-6 space-y-4"
              noValidate
            >
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] dark:text-white">
                  Create your portal account
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {status.hasUsers
                    ? 'Register your staff profile to manage student records, courses, examinations, and tuition ledgers.'
                    : 'Set up the initial administrator account to unlock student records, courses, examinations, and tuition ledgers.'}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="signup-fullname"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Full Name
                  </label>
                  <input
                    id="signup-fullname"
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onBlur={() => setSignupTouched((p) => ({ ...p, fullName: true }))}
                    aria-invalid={signupTouched.fullName && !signupValidation.fullNameValid}
                    aria-describedby={
                      signupTouched.fullName && !signupValidation.fullNameValid
                        ? 'signup-fullname-error'
                        : undefined
                    }
                    className={`mt-1.5 ${INPUT_BASE} ${
                      signupTouched.fullName
                        ? signupValidation.fullNameValid
                          ? INPUT_VALID
                          : INPUT_INVALID
                        : INPUT_NORMAL
                    }`}
                  />
                  {signupTouched.fullName && !signupValidation.fullNameValid && (
                    <p
                      id="signup-fullname-error"
                      className="mt-1 text-xs text-rose-700 dark:text-rose-400"
                    >
                      Enter at least 2 characters.
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <label
                      htmlFor="signup-username"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Username
                    </label>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap dark:text-slate-500">
                      3–32 chars
                    </span>
                  </div>
                  <input
                    id="signup-username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={32}
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onBlur={() => setSignupTouched((p) => ({ ...p, username: true }))}
                    aria-invalid={
                      (username.length > 0 || Boolean(signupTouched.username)) &&
                      !signupValidation.usernameValid
                    }
                    aria-describedby="signup-username-hint"
                    className={`mt-1.5 ${INPUT_BASE} font-mono ${
                      username.length > 0 || signupTouched.username
                        ? signupValidation.usernameValid
                          ? INPUT_VALID
                          : INPUT_INVALID
                        : INPUT_NORMAL
                    }`}
                  />
                  <p
                    id="signup-username-hint"
                    className={`mt-1 text-[11px] ${
                      (username.length > 0 || signupTouched.username) &&
                      !signupValidation.usernameValid
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Letters, numbers, dots, underscores, or hyphens.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="signup-email"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Email Address
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setSignupTouched((p) => ({ ...p, email: true }))}
                    aria-invalid={signupTouched.email && !signupValidation.emailValid}
                    aria-describedby={
                      signupTouched.email && !signupValidation.emailValid
                        ? 'signup-email-error'
                        : undefined
                    }
                    className={`mt-1.5 ${INPUT_BASE} ${
                      signupTouched.email
                        ? signupValidation.emailValid
                          ? INPUT_VALID
                          : INPUT_INVALID
                        : INPUT_NORMAL
                    }`}
                  />
                  {signupTouched.email && !signupValidation.emailValid && (
                    <p
                      id="signup-email-error"
                      className="mt-1 text-xs text-rose-700 dark:text-rose-400"
                    >
                      Enter a valid institutional or personal email.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="signup-department"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Department / Office
                  </label>
                  <input
                    id="signup-department"
                    type="text"
                    list="portal-department-options"
                    autoComplete="organization-title"
                    placeholder="Academic Registry"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className={`mt-1.5 ${INPUT_BASE} ${INPUT_NORMAL}`}
                  />
                  <datalist id="portal-department-options">
                    <option value="Academic Registry" />
                    <option value="Admissions Office" />
                    <option value="Examinations Office" />
                    <option value="Finance & Accounts" />
                    <option value="School of Business and Economics" />
                    <option value="School of Engineering and Technology" />
                    <option value="School of Health Sciences" />
                    <option value="School of Pure and Applied Sciences" />
                    <option value="School of Hospitality and Textile Technology" />
                  </datalist>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="signup-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="signup-password"
                      type={showSignupPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => setSignupTouched((p) => ({ ...p, password: true }))}
                      aria-invalid={signupTouched.password && !signupValidation.passwordValid}
                      className={`${INPUT_BASE} pr-10 ${
                        signupTouched.password && !signupValidation.passwordValid
                          ? INPUT_INVALID
                          : INPUT_NORMAL
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((v) => !v)}
                      aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showSignupPassword}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-400 transition-colors hover:text-slate-700 focus-visible:text-blue-900 focus-visible:outline-none dark:text-slate-500 dark:hover:text-slate-200 dark:focus-visible:text-blue-400"
                    >
                      {showSignupPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="signup-confirm-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Confirm Password
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="signup-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => setSignupTouched((p) => ({ ...p, confirmPassword: true }))}
                      aria-invalid={
                        confirmPassword.length > 0 && password !== confirmPassword
                      }
                      aria-describedby={
                        confirmPassword.length > 0 && password !== confirmPassword
                          ? 'signup-confirm-error'
                          : undefined
                      }
                      className={`${INPUT_BASE} pr-10 ${
                        confirmPassword.length > 0
                          ? password === confirmPassword
                            ? INPUT_VALID
                            : INPUT_INVALID
                          : INPUT_NORMAL
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={
                        showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'
                      }
                      aria-pressed={showConfirmPassword}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-400 transition-colors hover:text-slate-700 focus-visible:text-blue-900 focus-visible:outline-none dark:text-slate-500 dark:hover:text-slate-200 dark:focus-visible:text-blue-400"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && password !== confirmPassword && (
                    <p
                      id="signup-confirm-error"
                      className="mt-1 text-xs text-rose-700 dark:text-rose-400"
                    >
                      Passwords do not match.
                    </p>
                  )}
                </div>
              </div>

              {/* Compact Password Strength & Criteria */}
              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Password requirements
                  </span>
                  <div className="flex items-center gap-2.5">
                    <div className="grid w-20 grid-cols-3 gap-1" aria-hidden="true">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={`h-1.5 rounded-xs transition-colors duration-150 ${
                            signupStrength.score >= step
                              ? signupStrength.score === 3
                                ? 'bg-emerald-600 dark:bg-emerald-500'
                                : 'bg-blue-900 dark:bg-blue-500'
                              : 'bg-slate-200 dark:bg-slate-800'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="font-mono text-[11px] font-medium text-slate-500 tabular-nums dark:text-slate-400">
                      {signupStrength.score}/3 · {signupStrength.label}
                    </span>
                  </div>
                </div>
                <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <li className="inline-flex items-center gap-1.5">
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 ${
                        signupStrength.hasLength
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={
                        signupStrength.hasLength
                          ? 'font-medium text-slate-900 dark:text-slate-100'
                          : ''
                      }
                    >
                      8+ characters
                    </span>
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 ${
                        signupStrength.hasMixedCase
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={
                        signupStrength.hasMixedCase
                          ? 'font-medium text-slate-900 dark:text-slate-100'
                          : ''
                      }
                    >
                      Upper &amp; lowercase
                    </span>
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 ${
                        signupStrength.hasNumberOrSymbol
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={
                        signupStrength.hasNumberOrSymbol
                          ? 'font-medium text-slate-900 dark:text-slate-100'
                          : ''
                      }
                    >
                      Number or symbol
                    </span>
                  </li>
                </ul>
              </div>

              {/* Optional Recovery PIN for Self-Service Reset */}
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor="signup-recovery-pin"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Recovery PIN
                  </label>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap dark:text-slate-500">
                    Optional · 4–24 chars
                  </span>
                </div>
                <div className="relative mt-1.5">
                  <input
                    id="signup-recovery-pin"
                    type={showRecoveryPin ? 'text' : 'password'}
                    maxLength={24}
                    autoComplete="off"
                    value={recoveryPin}
                    onChange={(e) => setRecoveryPin(e.target.value)}
                    onBlur={() => setSignupTouched((p) => ({ ...p, recoveryPin: true }))}
                    placeholder="Enables self-service password reset"
                    aria-invalid={!signupValidation.recoveryPinValid}
                    aria-describedby="signup-pin-hint"
                    className={`${INPUT_BASE} pr-10 font-mono ${
                      !signupValidation.recoveryPinValid ? INPUT_INVALID : INPUT_NORMAL
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRecoveryPin((v) => !v)}
                    aria-label={showRecoveryPin ? 'Hide recovery PIN' : 'Show recovery PIN'}
                    aria-pressed={showRecoveryPin}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-400 transition-colors hover:text-slate-700 focus-visible:text-blue-900 focus-visible:outline-none dark:text-slate-500 dark:hover:text-slate-200 dark:focus-visible:text-blue-400"
                  >
                    {showRecoveryPin ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <p
                  id="signup-pin-hint"
                  className={`mt-1 text-[11px] ${
                    !signupValidation.recoveryPinValid
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {!signupValidation.recoveryPinValid
                    ? 'Recovery PIN must be 4–24 characters if provided.'
                    : 'Recommended: allows you to reset your password anytime without an admin.'}
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting || isLockedOut}
                aria-busy={submitting}
                className="group flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-900 px-5 text-sm font-semibold text-white whitespace-nowrap shadow-xs transition-all duration-150 hover:bg-blue-950 focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950"
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                )}
                <span>
                  {submitting ? 'Creating Account...' : 'Create Account & Continue'}
                </span>
                {!submitting && (
                  <ArrowRight
                    className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                )}
              </button>

              <p className="pt-1 text-center text-xs text-slate-600 dark:text-slate-400">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => switchTab('signin')}
                  className="rounded-xs font-semibold text-blue-900 hover:underline focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-blue-400 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950"
                >
                  Sign in to your account
                </button>
              </p>
            </form>
          )}

          {/* VIEW 3: FORGOT PASSWORD STEP 1 - VERIFY IDENTITY */}
          {viewMode === 'forgot-verify' && (
            <form
              onSubmit={handleVerifyRecoveryPin}
              className="animate-panel-enter space-y-5"
              noValidate
            >
              <div>
                <button
                  type="button"
                  onClick={() => switchTab('signin')}
                  className="inline-flex items-center gap-1.5 rounded-xs text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-slate-400 dark:hover:text-white dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Back to Sign In</span>
                </button>
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] dark:text-white">
                  Reset your password
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Verify your account with your username or email and your Recovery PIN to set a new password.
                </p>
              </div>

              <div>
                <label
                  htmlFor="forgot-identifier"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Username or Email
                </label>
                <input
                  id="forgot-identifier"
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  onBlur={() => setForgotTouched((p) => ({ ...p, identifier: true }))}
                  aria-invalid={forgotTouched.identifier && !forgotIdentifier.trim()}
                  className={`mt-1.5 ${INPUT_BASE} ${
                    forgotTouched.identifier && !forgotIdentifier.trim()
                      ? INPUT_INVALID
                      : INPUT_NORMAL
                  }`}
                />
              </div>

              <div>
                <label
                  htmlFor="forgot-pin"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Recovery PIN
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="forgot-pin"
                    type={showForgotPin ? 'text' : 'password'}
                    required
                    maxLength={24}
                    autoComplete="off"
                    value={forgotPin}
                    onChange={(e) => setForgotPin(e.target.value)}
                    onBlur={() => setForgotTouched((p) => ({ ...p, pin: true }))}
                    aria-invalid={forgotTouched.pin && forgotPin.trim().length < 4}
                    className={`${INPUT_BASE} pr-10 font-mono ${
                      forgotTouched.pin && forgotPin.trim().length < 4
                        ? INPUT_INVALID
                        : INPUT_NORMAL
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowForgotPin((v) => !v)}
                    aria-label={showForgotPin ? 'Hide recovery PIN' : 'Show recovery PIN'}
                    aria-pressed={showForgotPin}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-400 transition-colors hover:text-slate-700 focus-visible:text-blue-900 focus-visible:outline-none dark:text-slate-500 dark:hover:text-slate-200 dark:focus-visible:text-blue-400"
                  >
                    {showForgotPin ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Recovery PINs can be configured during registration or inside Settings &gt; Security &amp; Sessions.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting || isLockedOut}
                aria-busy={submitting}
                className="group flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-900 px-5 text-sm font-semibold text-white whitespace-nowrap shadow-xs transition-all duration-150 hover:bg-blue-950 focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950"
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                )}
                <span>
                  {submitting
                    ? 'Verifying Recovery PIN...'
                    : isLockedOut
                      ? `Locked (${formatCountdown(lockoutSeconds)})`
                      : 'Verify & Continue'}
                </span>
                {!submitting && !isLockedOut && (
                  <ArrowRight
                    className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                )}
              </button>
            </form>
          )}

          {/* VIEW 4: FORGOT PASSWORD STEP 2 - CHOOSE NEW PASSWORD */}
          {viewMode === 'forgot-reset' && (
            <form
              onSubmit={handleResetPassword}
              className="animate-panel-enter space-y-5"
              noValidate
            >
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setViewMode('forgot-verify');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xs text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-slate-400 dark:hover:text-white dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Back</span>
                </button>
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] dark:text-white">
                  Choose a new password
                </h2>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-l-2 border-emerald-600 pl-3 text-xs text-slate-600 dark:border-emerald-500 dark:text-slate-400">
                  <span>
                    Verified account:{' '}
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      @{verifiedUsername}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    Window: {formatCountdown(resetExpiresSeconds)}
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="reset-new-password"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  New Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="reset-new-password"
                    type={showResetNewPw ? 'text' : 'password'}
                    required
                    autoFocus
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    onBlur={() => setForgotTouched((p) => ({ ...p, newPassword: true }))}
                    className={`${INPUT_BASE} pr-10 ${
                      forgotTouched.newPassword && resetNewPassword.length < 8
                        ? INPUT_INVALID
                        : INPUT_NORMAL
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetNewPw((v) => !v)}
                    aria-label={showResetNewPw ? 'Hide new password' : 'Show new password'}
                    aria-pressed={showResetNewPw}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-400 transition-colors hover:text-slate-700 focus-visible:text-blue-900 focus-visible:outline-none dark:text-slate-500 dark:hover:text-slate-200 dark:focus-visible:text-blue-400"
                  >
                    {showResetNewPw ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="reset-confirm-password"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Confirm New Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="reset-confirm-password"
                    type={showResetConfirmPw ? 'text' : 'password'}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    onBlur={() => setForgotTouched((p) => ({ ...p, confirmPassword: true }))}
                    aria-invalid={!resetConfirmValid}
                    className={`${INPUT_BASE} pr-10 ${
                      resetConfirmPassword.length > 0
                        ? resetConfirmValid
                          ? INPUT_VALID
                          : INPUT_INVALID
                        : INPUT_NORMAL
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmPw((v) => !v)}
                    aria-label={
                      showResetConfirmPw ? 'Hide confirmation password' : 'Show confirmation password'
                    }
                    aria-pressed={showResetConfirmPw}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-400 transition-colors hover:text-slate-700 focus-visible:text-blue-900 focus-visible:outline-none dark:text-slate-500 dark:hover:text-slate-200 dark:focus-visible:text-blue-400"
                  >
                    {showResetConfirmPw ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {!resetConfirmValid && (
                  <p className="mt-1 text-xs text-rose-700 dark:text-rose-400">
                    Passwords do not match.
                  </p>
                )}
              </div>

              {/* Password requirements meter */}
              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Password strength
                  </span>
                  <div className="flex items-center gap-2.5">
                    <div className="grid w-20 grid-cols-3 gap-1" aria-hidden="true">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={`h-1.5 rounded-xs transition-colors duration-150 ${
                            resetStrength.score >= step
                              ? resetStrength.score === 3
                                ? 'bg-emerald-600 dark:bg-emerald-500'
                                : 'bg-blue-900 dark:bg-blue-500'
                              : 'bg-slate-200 dark:bg-slate-800'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="font-mono text-[11px] font-medium text-slate-500 tabular-nums dark:text-slate-400">
                      {resetStrength.score}/3 · {resetStrength.label}
                    </span>
                  </div>
                </div>
                <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <li className="inline-flex items-center gap-1.5">
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 ${
                        resetStrength.hasLength
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                      aria-hidden="true"
                    />
                    <span>8+ characters</span>
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 ${
                        resetStrength.hasMixedCase
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                      aria-hidden="true"
                    />
                    <span>Upper &amp; lowercase</span>
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 ${
                        resetStrength.hasNumberOrSymbol
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                      aria-hidden="true"
                    />
                    <span>Number or symbol</span>
                  </li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={submitting || resetExpiresSeconds <= 0}
                aria-busy={submitting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-900 px-5 text-sm font-semibold text-white whitespace-nowrap shadow-xs transition-all duration-150 hover:bg-blue-950 focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>{submitting ? 'Updating Password...' : 'Update Password'}</span>
              </button>
            </form>
          )}

          {/* VIEW 5: FORGOT PASSWORD STEP 3 - SUCCESS */}
          {viewMode === 'forgot-success' && (
            <div className="animate-panel-enter space-y-5 rounded-lg border border-slate-200 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Password reset complete
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Your password for{' '}
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    @{verifiedUsername || forgotIdentifier.trim()}
                  </span>{' '}
                  has been updated and all prior sessions were signed out.
                </p>
              </div>
              <button
                type="button"
                onClick={returnToSignInAfterReset}
                className="group flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-900 px-5 text-sm font-semibold text-white whitespace-nowrap shadow-xs transition-all duration-150 hover:bg-blue-950 focus-visible:ring-2 focus-visible:ring-blue-900 focus-visible:ring-offset-2 focus-visible:outline-none dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-slate-950"
              >
                <span>Return to Sign In</span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
        </div>

        <footer className="mx-auto mt-8 flex w-full max-w-[496px] flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>&copy; {new Date().getFullYear()} University Students Information Management System</span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Session &amp; Brute-Force Protected
          </span>
        </footer>
      </main>
    </div>
  );
}
