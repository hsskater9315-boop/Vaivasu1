import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Bookmark, Trash2, X } from 'lucide-react';
import { removeSavedMessage } from '../services/firestoreChat';
import type { SavedMessageItem } from '../types/chat';

interface SavedMessagesModalProps {
  open: boolean;
  myUid: string;
  items: SavedMessageItem[];
  onClose: () => void;
  onJumpToRoom: (roomId: string) => void;
  onOpenImage: (imageUrl: string) => void;
}

export function SavedMessagesModal({
  open,
  myUid,
  items,
  onClose,
  onJumpToRoom,
  onOpenImage,
}: SavedMessagesModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Saved messages"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="flex max-h-[82dvh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <Bookmark className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Saved Messages
                  </h2>
                  <p className="text-xs text-slate-500">
                    Private bookmarks only visible to you
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close saved messages"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.length === 0 ? (
                <div className="py-12 text-center">
                  <Bookmark className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-slate-800">No saved messages yet</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Tap the bookmark icon on any message to keep it here.
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {item.senderDisplayName}{' '}
                          <span className="font-normal text-slate-500">in {item.roomName}</span>
                        </p>
                        <p className="font-mono text-[11px] text-slate-400">
                          {new Date(item.createdAtMs).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onJumpToRoom(item.roomId);
                          }}
                          title="Open conversation"
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <span>Open</span>
                          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeSavedMessage(myUid, item.id)}
                          aria-label="Remove saved message"
                          title="Remove bookmark"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {item.content && (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">
                        {item.content}
                      </p>
                    )}

                    {item.imageUrl && item.imageUrl.startsWith('data:image/') && (
                      <button
                        type="button"
                        onClick={() => onOpenImage(item.imageUrl!)}
                        className="mt-2 block overflow-hidden rounded-lg border border-slate-200"
                      >
                        <img
                          src={item.imageUrl}
                          alt="Saved attachment"
                          referrerPolicy="no-referrer"
                          className="max-h-40 w-auto object-cover"
                        />
                      </button>
                    )}

                    {item.audioUrl && item.audioUrl.startsWith('data:audio/') && (
                      <audio
                        controls
                        preload="metadata"
                        src={item.audioUrl}
                        className="mt-2 h-8 w-full max-w-xs"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
