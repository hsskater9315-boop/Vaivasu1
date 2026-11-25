import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (!showIOSGuide) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowIOSGuide(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showIOSGuide]);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        onClick={() => void install()}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Install App</span>
      </motion.button>
    );
  }

  if (isIOS) {
    return (
      <>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Share className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
          <span>Install App</span>
        </motion.button>

        <AnimatePresence>
          {showIOSGuide && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
              onClick={() => setShowIOSGuide(false)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ios-install-title"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 6 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 id="ios-install-title" className="text-base font-semibold text-slate-900">
                    Install ForVasu on iPhone / iPad
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowIOSGuide(false)}
                    aria-label="Close instructions"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <ol className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>
                    1. Tap the <strong className="text-slate-900">Share</strong> button in Safari.
                  </li>
                  <li>
                    2. Scroll down and tap{' '}
                    <strong className="text-slate-900">Add to Home Screen</strong>.
                  </li>
                </ol>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="mt-5 w-full min-h-[40px] rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Got it
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return null;
}
