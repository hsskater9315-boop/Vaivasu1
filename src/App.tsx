import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { MessageSquare, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AuthScreen } from './components/AuthScreen';
import { ChatWorkspace } from './components/ChatWorkspace';
import { auth } from './firebase';
import { useOnlineStatus } from './hooks/usePWAInstall';
import {
  fetchPublicUser,
  subscribePublicUser,
  updateMyPresence,
} from './services/firestoreChat';
import type { PublicUser } from './types/chat';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<PublicUser | null>(() => {
    try {
      const cached = localStorage.getItem('forvasu_local_profile');
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  });
  const [checkingSession, setCheckingSession] = useState(true);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      setFirebaseUser(fbUser);
      if (!fbUser) {
        setCheckingSession(false);
        return;
      }

      try {
        const existing = await fetchPublicUser(fbUser.uid);
        if (existing) {
          setProfile(existing);
          try {
            localStorage.setItem('forvasu_local_profile', JSON.stringify(existing));
          } catch {}
        }
        unsubProfile = subscribePublicUser(fbUser.uid, (updated) => {
          if (updated) {
            setProfile(updated);
            try {
              localStorage.setItem('forvasu_local_profile', JSON.stringify(updated));
            } catch {}
          }
        });
      } catch {
        // Keep cached profile if offline or fetch fails
      } finally {
        setCheckingSession(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      localStorage.removeItem('forvasu_local_profile');
    } catch {}
    if (firebaseUser) {
      await updateMyPresence(firebaseUser.uid, false).catch(() => {});
    }
    try {
      await signOut(auth);
    } catch {
      // ignore
    } finally {
      setProfile(null);
    }
  }, [firebaseUser]);

  return (
    <>
      <AnimatePresence mode="wait">
        {checkingSession && !profile ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center px-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white"
            >
              <MessageSquare className="h-6 w-6" aria-hidden="true" />
            </motion.div>
            <p className="mt-3 text-sm font-medium text-slate-600">Loading ForVasu...</p>
          </motion.div>
        ) : !profile ? (
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <AuthScreen
              firebaseUser={firebaseUser}
              onProfileCreated={(createdUser) => {
                try {
                  localStorage.setItem('forvasu_local_profile', JSON.stringify(createdUser));
                } catch {}
                setProfile(createdUser);
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="h-full"
          >
            <ChatWorkspace
              currentUser={profile}
              onUserUpdated={(updatedUser) => {
                setProfile(updatedUser);
              }}
              onSignOut={() => {
                void handleSignOut();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900 shadow-sm"
            role="status"
          >
            <WifiOff className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
            <span>Offline mode — waiting for connection</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
