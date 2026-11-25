import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  Check,
  Copy,
  Grid3X3,
  MessageSquare,
  Pencil,
  ShieldOff,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  isDeveloperUser,
  loadUserProfileData,
  MAX_AVATAR_DATA_URL_LENGTH,
  sendOrAutoAcceptFriendRequest,
  unblockUser,
  updateMyAvatar,
  updateMyProfile,
} from '../services/firestoreChat';
import type { FriendRequestItem, PublicUser, Room, UserProfileData } from '../types/chat';
import { Avatar, VerifiedBadge } from './Avatar';

interface ProfileModalProps {
  targetUserId: string | null;
  currentUser: PublicUser;
  rooms: Room[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  blockedUsers: PublicUser[];
  onlineUserIds: Set<string>;
  myFriendRoomByUserId: Record<string, string>;
  onClose: () => void;
  onSelectProfile: (userId: string) => void;
  onOpenChat: (roomId: string) => void;
  onOpenImage: (imageUrl: string) => void;
  onUserUpdated: (user: PublicUser) => void;
  onUnblocked: (targetUserId: string) => void;
  onAcceptRequest: (requestId: string) => Promise<void>;
  onFriendAdded: (user: PublicUser, status: 'pending' | 'accepted', requestId?: string, room?: Room) => void;
}

type ProfileTab = 'photos' | 'friends' | 'blocked';

export function ProfileModal({
  targetUserId,
  currentUser,
  rooms,
  incomingRequests,
  outgoingRequests,
  blockedUsers,
  onlineUserIds,
  myFriendRoomByUserId,
  onClose,
  onSelectProfile,
  onOpenChat,
  onOpenImage,
  onUserUpdated,
  onUnblocked,
  onAcceptRequest,
  onFriendAdded,
}: ProfileModalProps) {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('photos');

  // Edit mode state (own profile)
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [busyFriendBtn, setBusyFriendBtn] = useState(false);
  const [isFollowingDev, setIsFollowingDev] = useState(false);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const fetchProfile = useCallback(
    async (userId: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await loadUserProfileData({
          targetUserId: userId,
          myUid: currentUser.id,
          myRooms: rooms,
          incomingBySenderId,
          outgoingByReceiverId,
        });
        setProfile(data);
        setEditName(data.user.displayName);
        setEditBio(data.user.bio ?? '');
      } catch (err) {
        setError(err instanceof Error && !err.message.startsWith('{') ? err.message : 'Could not load profile.');
        setProfile(null);
      } finally {
        setLoading(false);
      }
    },
    [currentUser.id, rooms, incomingBySenderId, outgoingByReceiverId],
  );

  useEffect(() => {
    if (!targetUserId) {
      setProfile(null);
      setEditing(false);
      setError(null);
      return;
    }
    setEditing(false);
    setActiveTab('photos');
    try {
      const stored = localStorage.getItem(`forvasu_following_${targetUserId}`);
      setIsFollowingDev(stored === 'true');
    } catch {}
    void fetchProfile(targetUserId);
  }, [targetUserId, fetchProfile]);

  useEffect(() => {
    if (!targetUserId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [targetUserId, onClose]);

  const displayedUser =
    profile && profile.isSelf ? { ...profile.user, ...currentUser } : profile?.user ?? null;

  async function handleCopyUsername(username: string) {
    try {
      await navigator.clipboard.writeText(username);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy username.');
    }
  }

  async function uploadAvatarDataUrl(dataUrl: string | null) {
    setUploadingPhoto(true);
    setError(null);
    try {
      const updatedUser = await updateMyAvatar(currentUser.id, dataUrl);
      onUserUpdated(updatedUser);
      setProfile((prev) => (prev ? { ...prev, user: { ...prev.user, ...updatedUser } } : prev));
    } catch (err) {
      setError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Could not update profile photo.',
      );
    } finally {
      setUploadingPhoto(false);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setError('Please select a PNG, JPG, WEBP, or GIF image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!rawUrl) return;

      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          void uploadAvatarDataUrl(rawUrl);
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        let croppedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (croppedDataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
          croppedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
        }
        void uploadAvatarDataUrl(croppedDataUrl);
      };
      img.onerror = () => {
        setError('Could not read the selected image.');
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    const trimmedName = editName.trim();
    const trimmedBio = editBio.trim();
    if (trimmedName.length < 2 || trimmedName.length > 32) {
      setError('Display name must be 2 to 32 characters.');
      return;
    }
    if (trimmedBio.length > 160) {
      setError('Bio must be 160 characters or fewer.');
      return;
    }

    setSavingProfile(true);
    setError(null);
    try {
      const updatedUser = await updateMyProfile(currentUser.id, trimmedName, trimmedBio);
      onUserUpdated(updatedUser);
      setProfile((prev) => (prev ? { ...prev, user: { ...prev.user, ...updatedUser } } : prev));
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Could not save profile.',
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleUnblock(userId: string) {
    setUnblockingId(userId);
    setError(null);
    try {
      await unblockUser(currentUser.id, userId);
      onUnblocked(userId);
    } catch {
      setError('Could not unblock user.');
    } finally {
      setUnblockingId(null);
    }
  }

  async function handleSendAddRequest() {
    if (!profile || busyFriendBtn) return;
    setBusyFriendBtn(true);
    setError(null);
    try {
      const res = await sendOrAutoAcceptFriendRequest({
        myUid: currentUser.id,
        targetUser: profile.user,
        incomingBySenderId,
      });
      if (res.status === 'accepted' && res.room) {
        onFriendAdded(profile.user, 'accepted', undefined, res.room);
        void fetchProfile(profile.user.id);
      } else {
        onFriendAdded(profile.user, 'pending', res.requestId);
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                relationship: 'pending_sent',
                requestId: res.requestId,
              }
            : prev,
        );
      }
    } catch {
      setError('Could not send request.');
    } finally {
      setBusyFriendBtn(false);
    }
  }

  async function handleAcceptIncoming() {
    if (!profile?.requestId || busyFriendBtn) return;
    setBusyFriendBtn(true);
    setError(null);
    try {
      await onAcceptRequest(profile.requestId);
      await fetchProfile(profile.user.id);
    } catch {
      setError('Could not accept request.');
    } finally {
      setBusyFriendBtn(false);
    }
  }

  return (
    <AnimatePresence>
      {targetUserId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5">
          {displayedUser ? (
            <button
              type="button"
              onClick={() => void handleCopyUsername(displayedUser.username)}
              className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-900 hover:text-blue-600"
              title="Copy username"
            >
              <span id="profile-modal-title">@{displayedUser.username}</span>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              )}
            </button>
          ) : (
            <h2 id="profile-modal-title" className="text-sm font-semibold text-slate-900">
              Profile
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-6">
                <div className="h-20 w-20 rounded-full bg-slate-100 shrink-0" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-5 w-32 rounded bg-slate-100" />
                  <div className="h-4 w-48 rounded bg-slate-100" />
                </div>
              </div>
              <div className="h-14 w-full rounded-xl bg-slate-100" />
            </div>
          ) : error && !profile ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-red-600">{error}</p>
            </div>
          ) : profile && displayedUser ? (
            <>
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-5 sm:gap-6">
                  <div className="relative shrink-0">
                    {displayedUser.avatarUrl ? (
                      <img
                        src={displayedUser.avatarUrl}
                        alt={displayedUser.displayName}
                        referrerPolicy="no-referrer"
                        className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border border-slate-200 object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full text-xl sm:text-2xl font-bold text-white select-none"
                        style={{ backgroundColor: displayedUser.avatarColor }}
                      >
                        {displayedUser.displayName
                          .split(/[\s._-]+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase() ?? '')
                          .join('') || displayedUser.displayName.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    {profile.isSelf && (
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={uploadingPhoto}
                          onClick={() => fileInputRef.current?.click()}
                          aria-label="Change profile photo"
                          title="Change profile photo"
                          className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex flex-1 items-center justify-around gap-2 sm:gap-4 text-center">
                    {displayedUser && isDeveloperUser(displayedUser.username) && (
                      <div className="rounded-xl px-2.5 py-2">
                        <span className="block font-display text-xl font-bold text-blue-600 tabular-nums">
                          {isFollowingDev ? '1,421' : '1,420'}
                        </span>
                        <span className="block text-xs font-medium text-slate-500">
                          Followers
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setActiveTab('friends')}
                      className="group rounded-xl px-3 py-2 hover:bg-slate-50 transition-colors"
                    >
                      <span className="block font-display text-xl font-bold text-slate-900 tabular-nums">
                        {profile.friendsCount}
                      </span>
                      <span className="block text-xs font-medium text-slate-500 group-hover:text-slate-900">
                        {profile.friendsCount === 1 ? 'Friend' : 'Friends'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('photos')}
                      className="group rounded-xl px-3 py-2 hover:bg-slate-50 transition-colors"
                    >
                      <span className="block font-display text-xl font-bold text-slate-900 tabular-nums">
                        {profile.sharedImagesCount}
                      </span>
                      <span className="block text-xs font-medium text-slate-500 group-hover:text-slate-900">
                        {profile.sharedImagesCount === 1 ? 'Photo' : 'Photos'}
                      </span>
                    </button>
                  </div>
                </div>

                {editing && profile.isSelf ? (
                  <form onSubmit={handleSaveProfile} className="mt-4 space-y-3">
                    <div>
                      <label
                        htmlFor="edit-profile-name"
                        className="block text-xs font-semibold text-slate-600"
                      >
                        Name
                      </label>
                      <input
                        id="edit-profile-name"
                        type="text"
                        maxLength={32}
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="mt-1 block w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="edit-profile-bio"
                          className="block text-xs font-semibold text-slate-600"
                        >
                          Bio
                        </label>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {editBio.trim().length}/160
                        </span>
                      </div>
                      <textarea
                        id="edit-profile-bio"
                        rows={3}
                        maxLength={160}
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        placeholder="Write a short bio about yourself..."
                        className="mt-1 block w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {displayedUser.avatarUrl ? (
                        <button
                          type="button"
                          disabled={uploadingPhoto}
                          onClick={() => void uploadAvatarDataUrl(null)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Remove Photo</span>
                        </button>
                      ) : (
                        <span />
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={savingProfile}
                          onClick={() => {
                            setEditing(false);
                            setEditName(displayedUser.displayName);
                            setEditBio(displayedUser.bio ?? '');
                            setError(null);
                          }}
                          className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingProfile}
                          className="min-h-[38px] rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {savingProfile ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="mt-4">
                    {(() => {
                      const isDevProfile = displayedUser && isDeveloperUser(displayedUser.username);
                      return (
                        <>
                          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-1">
                            <span>{displayedUser.displayName}</span>
                            {isDevProfile && <VerifiedBadge />}
                          </h2>
                          {isDevProfile && (
                            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                              <span>🛡️ Official Creator &amp; Lead Developer (Admin)</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    {displayedUser.bio ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                        {displayedUser.bio}
                      </p>
                    ) : profile.isSelf ? (
                      <p className="mt-1 text-sm text-slate-400">
                        No bio yet. Tap Edit Profile to add one.
                      </p>
                    ) : null}

                    <p className="mt-1.5 text-xs text-slate-400">
                      Joined{' '}
                      {new Date(displayedUser.createdAt).toLocaleDateString([], {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {!profile.isSelf && isDeveloperUser(displayedUser.username) && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = !isFollowingDev;
                            setIsFollowingDev(next);
                            try {
                              localStorage.setItem(
                                `forvasu_following_${displayedUser.id}`,
                                next ? 'true' : 'false',
                              );
                            } catch {}
                          }}
                          className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold transition-colors ${
                            isFollowingDev
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          <span>{isFollowingDev ? '✓ Following Official Dev' : '+ Follow Developer'}</span>
                        </button>
                      )}

                      {profile.isSelf ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditName(displayedUser.displayName);
                            setEditBio(displayedUser.bio ?? '');
                            setEditing(true);
                          }}
                          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Edit Profile</span>
                        </button>
                      ) : profile.relationship === 'accepted' && profile.roomId ? (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenChat(profile.roomId!);
                            onClose();
                          }}
                          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
                        >
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Message</span>
                        </button>
                      ) : profile.relationship === 'pending_sent' ? (
                        <span className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-500">
                          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Request Sent</span>
                        </span>
                      ) : profile.relationship === 'pending_received' ? (
                        <button
                          type="button"
                          disabled={busyFriendBtn}
                          onClick={() => void handleAcceptIncoming()}
                          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{busyFriendBtn ? 'Accepting...' : 'Accept Request'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyFriendBtn}
                          onClick={() => void handleSendAddRequest()}
                          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
                        >
                          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{busyFriendBtn ? 'Sending...' : 'Add Friend'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <p role="alert" className="mt-3 text-xs font-medium text-red-600">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex border-y border-slate-200 bg-slate-50/70">
                <button
                  type="button"
                  onClick={() => setActiveTab('photos')}
                  className={`flex flex-1 min-h-[42px] items-center justify-center gap-1.5 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    activeTab === 'photos'
                      ? 'border-blue-600 text-blue-600 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Grid3X3 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Photos</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('friends')}
                  className={`flex flex-1 min-h-[42px] items-center justify-center gap-1.5 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    activeTab === 'friends'
                      ? 'border-blue-600 text-blue-600 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Friends ({profile.friendsCount})</span>
                </button>
                {profile.isSelf && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('blocked')}
                    className={`flex flex-1 min-h-[42px] items-center justify-center gap-1.5 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                      activeTab === 'blocked'
                        ? 'border-blue-600 text-blue-600 bg-white'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Blocked ({blockedUsers.length})</span>
                  </button>
                )}
              </div>

              <div className="p-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {activeTab === 'photos' && (
                  <>
                    {!profile.isSelf && profile.relationship !== 'accepted' ? (
                      <p className="py-8 text-center text-xs text-slate-500">
                        Add @{displayedUser.username} as a friend to share and view photos.
                      </p>
                    ) : profile.sharedImages.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-sm font-medium text-slate-700">No shared photos yet</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Photos sent in chat will appear here in a clean gallery.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5">
                        {profile.sharedImages.map((img) => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => onOpenImage(img.imageUrl)}
                            className="aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
                          >
                            <img
                              src={img.imageUrl}
                              alt="Shared media"
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover hover:scale-[1.03] transition-transform"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'friends' && (
                  <>
                    {!profile.isSelf && profile.relationship !== 'accepted' ? (
                      <p className="py-8 text-center text-xs text-slate-500">
                        Add @{displayedUser.username} as a friend to connect and chat.
                      </p>
                    ) : !profile.isSelf ? (
                      <div className="py-8 text-center">
                        <p className="text-sm font-medium text-slate-700">
                          {profile.friendsCount}{' '}
                          {profile.friendsCount === 1 ? 'Friend' : 'Friends'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          @{displayedUser.username} is connected with {profile.friendsCount}{' '}
                          {profile.friendsCount === 1 ? 'person' : 'people'} on ForVasu.
                        </p>
                      </div>
                    ) : profile.friends.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-sm font-medium text-slate-700">No friends yet</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Search someone by username to send your first friend request.
                        </p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {profile.friends.map((friend) => {
                          const dmRoomId = myFriendRoomByUserId[friend.id];
                          const isOnline = onlineUserIds.has(friend.id);
                          return (
                            <li
                              key={friend.id}
                              className="flex items-center justify-between gap-3 py-2.5"
                            >
                              <button
                                type="button"
                                onClick={() => onSelectProfile(friend.id)}
                                className="flex flex-1 items-center gap-3 min-w-0 text-left hover:opacity-85"
                              >
                                <Avatar
                                  name={friend.displayName}
                                  color={friend.avatarColor}
                                  avatarUrl={friend.avatarUrl}
                                  size="md"
                                  showPresence
                                  online={isOnline}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {friend.displayName}
                                  </p>
                                  <p className="truncate font-mono text-xs text-slate-500">
                                    @{friend.username}
                                  </p>
                                </div>
                              </button>

                              {dmRoomId && friend.id !== currentUser.id && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onOpenChat(dmRoomId);
                                    onClose();
                                  }}
                                  className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  <MessageSquare className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                                  <span>Chat</span>
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}

                {activeTab === 'blocked' && profile.isSelf && (
                  <>
                    {blockedUsers.length === 0 ? (
                      <p className="py-8 text-center text-xs text-slate-500">No blocked users.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {blockedUsers.map((blocked) => (
                          <li
                            key={blocked.id}
                            className="flex items-center justify-between gap-3 py-2.5"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar
                                name={blocked.displayName}
                                color={blocked.avatarColor}
                                avatarUrl={blocked.avatarUrl}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900">
                                  {blocked.displayName}
                                </p>
                                <p className="truncate font-mono text-xs text-slate-500">
                                  @{blocked.username}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={unblockingId === blocked.id}
                              onClick={() => void handleUnblock(blocked.id)}
                              className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{unblockingId === blocked.id ? 'Unblocking...' : 'Unblock'}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          ) : null}
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
