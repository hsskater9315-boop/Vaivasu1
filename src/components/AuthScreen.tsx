import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Eye,
  EyeOff,
  Flame,
  MessageSquare,
  Phone,
  Timer,
  Video,
} from 'lucide-react';
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
    ? 'Claim your handle'
    : mode === 'login'
      ? 'Welcome back'
      : 'Join ForVasu';

  const subheading = needsGoogleUsernameSetup
    ? 'Pick a unique username ID so friends can find and follow you.'
    : mode === 'login'
      ? 'Sign in to continue your streaks, stories, and live chats.'
      : 'Create your handle in seconds — snaps, stories & real-time calls.';

  return (
    <div className="min-h-dvh bg-[#f4f6f9] text-slate-900 flex flex-col justify-between px-4 py-6 sm:px-8 lg:px-12">
      {/* Top Bar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-[#FFEC1F] shadow-sm">
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#FFEC1F] ring-2 ring-[#f4f6f9]" />
          </div>
          <div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900">
              ForVasu
            </span>
          </div>
        </div>
        <PWAInstallButton />
      </header>

      {/* Main Split Studio */}
      <main className="mx-auto my-auto w-full max-w-6xl py-6 lg:py-10">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Desktop Product Showcase */}
          <section className="hidden lg:col-span-7 lg:block">
            <h1 className="font-display text-4xl xl:text-5xl font-bold tracking-tight text-slate-900 leading-[1.1]">
              Snaps, stories, and instant chats{' '}
              <span className="relative inline-block">
                <span className="relative z-10">for real friends.</span>
                <span
                  aria-hidden="true"
                  className="absolute right-0 bottom-1 left-0 h-3 bg-[#FFEC1F]/80 -z-0 rounded-sm"
                />
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-slate-600 leading-relaxed">
              Send view-once snaps that burn after opening, share 24-hour status stories, build daily
              chat streaks, and hop onto encrypted audio or video calls.
            </p>

            {/* Realistic Tactile Chat Preview Stack */}
            <div className="mt-8 grid grid-cols-12 gap-4 max-w-xl">
              {/* Mini Story & Chat Preview Card */}
              <div className="col-span-7 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-[#FFEC1F]">
                      HM
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Hmxerr</p>
                      <p className="text-[11px] text-emerald-600 font-medium">Online · 14d streak</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                      <Video className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </div>
                </div>

                <div className="mt-3.5 space-y-2.5">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-xs bg-slate-100 px-3.5 py-2 text-xs text-slate-800">
                    Check out the new 24h stories &amp; voice notes!
                  </div>
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-xs bg-blue-600 px-3.5 py-2 text-xs text-white">
                    Sending a view-once snap right now 🔥
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-xl bg-[#FFEC1F] px-3 py-2 text-xs font-bold text-slate-950 shadow-xs">
                    <Flame className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
                    <span>Tap to View Snap</span>
                  </div>
                </div>
              </div>

              {/* Side Highlight Cards */}
              <div className="col-span-5 flex flex-col gap-4">
                <div className="rounded-2xl border border-slate-200/90 bg-slate-900 p-4 text-white shadow-[0_14px_35px_rgba(15,23,42,0.12)]">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFEC1F] text-slate-950">
                    <Camera className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <p className="mt-3 font-display text-sm font-bold">24h Stories &amp; Notes</p>
                  <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                    Share quick status thoughts and photo stories visible only to accepted friends.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="font-display text-xs font-bold text-slate-900">
                      Disappearing Chats
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                    Toggle 24-hour auto-destruct timers or burn-on-open view-once snaps anytime.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Right Auth Card */}
          <section className="mx-auto w-full max-w-md lg:col-span-5 lg:max-w-none">
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="w-full rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-[0_20px_50px_rgba(15,23,42,0.07)]"
            >
              <div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={heading}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                  >
                    <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                      {heading}
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-slate-500">{subheading}</p>
                  </motion.div>
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
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
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
                    className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'login'}
                      onClick={() => handleModeSwitch('login')}
                      className={`min-h-[40px] rounded-xl text-xs font-semibold transition-all ${
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
                      className={`min-h-[40px] rounded-xl text-xs font-semibold transition-all ${
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
                        <label
                          htmlFor="auth-display-name"
                          className="block text-xs font-semibold text-slate-700"
                        >
                          Display Name <span className="font-normal text-slate-400">(optional)</span>
                        </label>
                        <input
                          id="auth-display-name"
                          type="text"
                          maxLength={32}
                          autoComplete="name"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Your name"
                          className="mt-1.5 block w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:outline-none"
                        />
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="auth-username"
                        className="block text-xs font-semibold text-slate-700"
                      >
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
                        className="mt-1.5 block w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="auth-password"
                        className="block text-xs font-semibold text-slate-700"
                      >
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
                          className="block w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/70 pl-3.5 pr-11 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:outline-none"
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
                      whileTap={{ scale: 0.985 }}
                      className="mt-2 flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
                      <ArrowRight className="h-4 w-4 text-[#FFEC1F]" aria-hidden="true" />
                    </motion.button>
                  </form>

                  <div className="my-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      or
                    </span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  <motion.button
                    type="button"
                    disabled={submitting}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => void handleGoogleLogin()}
                    className="flex w-full min-h-[46px] items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-xs transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
                    <label
                      htmlFor="setup-display-name"
                      className="block text-xs font-semibold text-slate-700"
                    >
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
                      className="mt-1.5 block w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="setup-username"
                      className="block text-xs font-semibold text-slate-700"
                    >
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
                      className="mt-1.5 block w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:outline-none"
                    />
                  </div>

                  <motion.button
                    type="submit"
                    disabled={submitting}
                    whileTap={{ scale: 0.985 }}
                    className="mt-2 flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>{submitting ? 'Saving...' : 'Start Messaging'}</span>
                    <ArrowRight className="h-4 w-4 text-[#FFEC1F]" aria-hidden="true" />
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
          </section>
        </div>
      </main>

      {/* Developer attribution footer */}
      <footer className="mx-auto flex w-full max-w-6xl items-center justify-center gap-1.5 text-xs text-slate-500 font-medium">
        <span>Developers:</span>
        <span className="font-semibold text-slate-800">Himanshu</span>
        <span>&amp;</span>
        <span className="font-semibold text-slate-800">hmxerr</span>
      </footer>
    </div>
  );
}
