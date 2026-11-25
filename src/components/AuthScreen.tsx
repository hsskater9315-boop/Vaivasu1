import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { AlertCircle, ArrowRight, Eye, EyeOff, MessageSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { auth } from '../firebase';
import {
  claimUsernameAndCreateProfile,
  formatFirebaseAuthError,
  loginWithUsernamePassword,
  registerWithUsernamePassword,
  suggestUsername,
  SYNTHETIC_EMAIL_DOMAIN,
  validateUsernameInput,
} from '../services/firestoreChat';
import type { PublicUser } from '../types/chat';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthScreenProps {
  firebaseUser: FirebaseUser | null;
  onProfileCreated: (user: PublicUser) => void;
}

type AuthMode = 'login' | 'signup';

export function AuthScreen({ firebaseUser, onProfileCreated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSyntheticPasswordSession = Boolean(
    firebaseUser?.email?.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`),
  );
  const needsGoogleUsernameSetup = Boolean(firebaseUser && !isSyntheticPasswordSession);

  useEffect(() => {
    if (firebaseUser && !isSyntheticPasswordSession) {
      setUsername((prev) => prev || suggestUsername(firebaseUser.displayName, firebaseUser.email));
      setDisplayName((prev) => prev || (firebaseUser.displayName || '').slice(0, 32));
      setError(null);
    }
  }, [firebaseUser, isSyntheticPasswordSession]);

  function handleModeSwitch(nextMode: AuthMode) {
    if (submitting) return;
    setMode(nextMode);
    setError(null);
  }

  async function handlePasswordAuth(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const check = validateUsernameInput(username);
    if (!check.valid) {
      setError(check.error || 'Invalid username.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const profile = await loginWithUsernamePassword({
          username: check.clean,
          password,
        });
        if (profile) {
          onProfileCreated(profile);
        }
      } else {
        const profile = await registerWithUsernamePassword({
          username: check.clean,
          password,
          displayName,
        });
        onProfileCreated(profile);
      }
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClaimUsername(e: FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    setError(null);

    const check = validateUsernameInput(username);
    if (!check.valid) {
      setError(check.error || 'Invalid username.');
      return;
    }

    const trimmedName = displayName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 32) {
      setError('Display name must be 2 to 32 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const profile = await claimUsernameAndCreateProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: trimmedName,
        username: check.clean,
      });
      onProfileCreated(profile);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const heading = needsGoogleUsernameSetup
    ? 'Create Username'
    : mode === 'login'
      ? 'Log In'
      : 'Create Account';

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col items-center justify-center px-4 py-8">
      <div className="fixed top-4 right-4 z-20">
        <PWAInstallButton />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 sm:p-8"
      >
        <div className="flex flex-col items-center text-center">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.16 }}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white"
          >
            <MessageSquare className="h-6 w-6" aria-hidden="true" />
          </motion.div>
          <span className="mt-3 font-display text-xl font-bold tracking-tight text-slate-900">
            ForVasu
          </span>
          <AnimatePresence mode="wait">
            <motion.h1
              key={heading}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="mt-4 text-xl font-semibold tracking-tight text-slate-900"
            >
              {heading}
            </motion.h1>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {!needsGoogleUsernameSetup ? (
          <div className="mt-6">
            <div
              role="tablist"
              aria-label="Account mode"
              className="grid grid-cols-2 rounded-xl bg-slate-100 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => handleModeSwitch('login')}
                className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                onClick={() => handleModeSwitch('signup')}
                className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                  mode === 'signup'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handlePasswordAuth} className="mt-5 space-y-3.5" noValidate>
              {mode === 'signup' && (
                <div>
                  <label htmlFor="auth-display-name" className="block text-xs font-semibold text-slate-600">
                    Display Name (optional)
                  </label>
                  <input
                    id="auth-display-name"
                    type="text"
                    maxLength={32}
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="mt-1.5 block w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-username" className="block text-xs font-semibold text-slate-600">
                  Username ID
                </label>
                <input
                  id="auth-username"
                  type="text"
                  maxLength={24}
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. vasu_01"
                  className="mt-1.5 block w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-600">
                  Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    maxLength={128}
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="block w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 pl-3.5 pr-11 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={submitting}
                whileTap={{ scale: 0.98 }}
                className="mt-1 flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>
                  {submitting
                    ? mode === 'login'
                      ? 'Logging in...'
                      : 'Creating account...'
                    : mode === 'login'
                      ? 'Log In'
                      : 'Create Account'}
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </motion.button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">or</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <motion.button
              type="button"
              disabled={submitting}
              whileTap={{ scale: 0.98 }}
              onClick={() => void handleGoogleLogin()}
              className="flex w-full min-h-[46px] items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-xs transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.09.73-2.49 1.16-4.22 1.16-3.24 0-5.98-2.19-6.96-5.13H1.03v3.14C3.04 21.14 7.21 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.04 14.02A7.18 7.18 0 0 1 4.66 12c0-.7.13-1.38.38-2.02V6.84H1.03A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.03 5.16l4.01-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.51-3.51C18.07 1.19 15.3 0 12 0 7.21 0 3.04 2.86 1.03 6.84l4.01 3.14c.98-2.94 3.72-5.23 6.96-5.23Z"
                />
              </svg>
              <span>Continue with Google</span>
            </motion.button>
          </div>
        ) : (
          <form onSubmit={handleClaimUsername} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="setup-display-name" className="block text-xs font-semibold text-slate-600">
                Display Name
              </label>
              <input
                id="setup-display-name"
                type="text"
                maxLength={32}
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="mt-1.5 block w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="setup-username" className="block text-xs font-semibold text-slate-600">
                Username ID
              </label>
              <input
                id="setup-username"
                type="text"
                maxLength={24}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. vasu_01"
                className="mt-1.5 block w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
              />
            </div>

            <motion.button
              type="submit"
              disabled={submitting}
              whileTap={{ scale: 0.98 }}
              className="mt-2 flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{submitting ? 'Saving...' : 'Start Messaging'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </motion.button>

            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="block w-full text-center text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Use another account
            </button>
          </form>
        )}
      </motion.div>

      {/* Developer attribution footer */}
      <footer className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500 font-medium">
        <span>Developers:</span>
        <span className="font-semibold text-slate-800">Himanshu</span>
        <span>&amp;</span>
        <span className="font-semibold text-slate-800">hmxerr</span>
      </footer>
    </div>
  );
}
