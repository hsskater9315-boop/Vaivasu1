import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Search, UserCheck, UserPlus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  searchUsersByHandle,
  sendOrAutoAcceptFriendRequest,
} from '../services/firestoreChat';
import type {
  FriendRequestItem,
  PublicUser,
  Room,
  UserSearchResult,
} from '../types/chat';
import { Avatar } from './Avatar';

interface AddFriendModalProps {
  open: boolean;
  currentUser: PublicUser;
  rooms: Room[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  blockedUsers: PublicUser[];
  onClose: () => void;
  onAcceptRequest: (requestId: string) => Promise<void>;
  onOpenChat: (roomId: string) => void;
  onViewProfile?: (userId: string) => void;
}

export function AddFriendModal({
  open,
  currentUser,
  rooms,
  incomingRequests,
  outgoingRequests,
  blockedUsers,
  onClose,
  onAcceptRequest,
  onOpenChat,
  onViewProfile,
}: AddFriendModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const blockedIds = useMemo(() => new Set(blockedUsers.map((u) => u.id)), [blockedUsers]);
  const incomingBySenderId = useMemo(() => {
    const map = new Map<string, FriendRequestItem>();
    for (const r of incomingRequests) map.set(r.senderId, r);
    return map;
  }, [incomingRequests]);
  const outgoingByReceiverId = useMemo(() => {
    const map = new Map<string, FriendRequestItem>();
    for (const r of outgoingRequests) map.set(r.receiverId, r);
    return map;
  }, [outgoingRequests]);
  const roomByOtherUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rooms) {
      if (r.otherUser) map.set(r.otherUser.id, r.id);
    }
    return map;
  }, [rooms]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const clean = query.trim().replace(/^@+/, '');
    if (clean.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const list = await searchUsersByHandle({
          queryText: query,
          myUid: currentUser.id,
          blockedIds,
          incomingBySenderId,
          outgoingByReceiverId,
          roomByOtherUserId,
        });
        if (!cancelled) {
          setResults(list);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : '';
          if (msg.toLowerCase().includes('quota exceeded')) {
            setError('Daily database quota exceeded. Please try again later.');
          } else {
            setError('Could not search users right now.');
          }
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    open,
    query,
    currentUser.id,
    blockedIds,
    incomingBySenderId,
    outgoingByReceiverId,
    roomByOtherUserId,
  ]);

  async function handleCopyHandle() {
    try {
      await navigator.clipboard.writeText(currentUser.username);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 2000);
    } catch {
      setError('Could not copy username.');
    }
  }

  async function handleSendRequest(item: UserSearchResult) {
    setBusyUserId(item.user.id);
    setError(null);
    try {
      const res = await sendOrAutoAcceptFriendRequest({
        myUid: currentUser.id,
        targetUser: item.user,
        incomingBySenderId,
      });

      if (res.status === 'accepted' && res.room) {
        const updated: UserSearchResult = {
          ...item,
          relationship: 'accepted',
          roomId: res.room.id,
        };
        setResults((prev) => prev.map((r) => (r.user.id === item.user.id ? updated : r)));
        onOpenChat(res.room.id);
        onClose();
      } else {
        const updated: UserSearchResult = {
          ...item,
          relationship: 'pending_sent',
          requestId: res.requestId,
        };
        setResults((prev) => prev.map((r) => (r.user.id === item.user.id ? updated : r)));
      }
    } catch {
      setError('Could not send add request. User may have blocked requests.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleAccept(item: UserSearchResult) {
    if (!item.requestId) return;
    setBusyUserId(item.user.id);
    setError(null);
    try {
      await onAcceptRequest(item.requestId);
      onClose();
    } catch {
      setError('Could not accept request.');
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-friend-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="add-friend-title" className="text-lg font-semibold text-slate-900">
                Add Friend
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500">Your Username ID</p>
                <p className="truncate font-mono text-sm font-medium text-slate-900">
                  @{currentUser.username}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyHandle()}
                className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                {copiedId ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-4">
              <label htmlFor="search-user-input" className="sr-only">
                Search by username or user ID
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="search-user-input"
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search username or user ID..."
                  className="block w-full min-h-[42px] rounded-xl border border-slate-300 bg-white py-2 pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-3 text-xs font-medium text-red-600">
                {error}
              </p>
            )}

            <div className="mt-4 max-h-72 overflow-y-auto">
              {query.trim().replace(/^@+/, '').length < 2 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Type at least 2 characters of a username or paste a user ID.
                </p>
              ) : searching ? (
                <div className="space-y-2 py-2">
                  <div className="h-12 rounded-xl bg-slate-100" />
                  <div className="h-12 rounded-xl bg-slate-100" />
                </div>
              ) : results.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No users found.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {results.map((item, idx) => {
                    const isBusy = busyUserId === item.user.id;
                    return (
                      <motion.li
                        key={item.user.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.16, delay: Math.min(idx * 0.03, 0.18) }}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (onViewProfile) {
                              onViewProfile(item.user.id);
                              onClose();
                            }
                          }}
                          className="flex flex-1 items-center gap-3 min-w-0 text-left hover:opacity-80 transition-opacity"
                        >
                          <Avatar
                            name={item.user.displayName}
                            color={item.user.avatarColor}
                            avatarUrl={item.user.avatarUrl}
                            size="md"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {item.user.displayName}
                            </p>
                            <p className="truncate font-mono text-xs text-slate-500">
                              @{item.user.username}
                            </p>
                          </div>
                        </button>

                        <div className="shrink-0">
                          {item.relationship === 'accepted' && item.roomId ? (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenChat(item.roomId!);
                                onClose();
                              }}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <UserCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                              <span>Chat</span>
                            </button>
                          ) : item.relationship === 'pending_sent' ? (
                            <span className="inline-flex min-h-[36px] items-center px-3 py-1.5 text-xs font-medium text-slate-500">
                              Requested
                            </span>
                          ) : item.relationship === 'pending_received' ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleAccept(item)}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Accept</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleSendRequest(item)}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{isBusy ? 'Adding...' : 'Add'}</span>
                            </button>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
