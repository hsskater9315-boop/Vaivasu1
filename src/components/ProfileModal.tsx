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
  Share2,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  fetchFollowersList,
  fetchFollowingList,
  isDeveloperUser,
  loadUserProfileData,
  MAX_AVATAR_DATA_URL_LENGTH,
  sendOrAutoAcceptFriendRequest,
  toggleFollowUser,
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

type ProfileTab = 'photos' | 'followers' | 'following' | 'friends' | 'blocked';

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
  const [togglingFollow, setTogglingFollow] = useState(false);
  const [copied, setCopied] = useState(false);

  // Instagram followers list states
  const [followersList, setFollowersList] = useState<PublicUser[]>([]);
  const [followingList, setFollowingList] = useState<PublicUser[]>([]);
  const [loadingTabList, setLoadingTabList] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stable refs to prevent flickering when background room polling occurs
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const incomingRef = useRef(incomingRequests);
  incomingRef.current = incomingRequests;
  const outgoingRef = useRef(outgoingRequests);
  outgoingRef.current = outgoingRequests;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const fetchProfile = useCallback(async (userId: string, isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const incomingMap = new Map<string, FriendRequestItem>();
      for (const r of incomingRef.current) incomingMap.set(r.senderId, r);
      const outgoingMap = new Map<string, FriendRequestItem>();
      for (const r of outgoingRef.current) outgoingMap.set(r.receiverId, r);

      const data = await loadUserProfileData({
        targetUserId: userId,
        myUid: currentUserRef.current.id,
        myRooms: roomsRef.current,
        incomingBySenderId: incomingMap,
        outgoingByReceiverId: outgoingMap,
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
  }, []);

  // Run ONLY when targetUserId actually changes - eliminates 100% of the flicker!
  useEffect(() => {
    if (!targetUserId) {
      setProfile(null);
      setEditing(false);
      setError(null);
      return;
    }
    setEditing(false);
    setActiveTab('photos');
    void fetchProfile(targetUserId, false);
  }, [targetUserId, fetchProfile]);

  // Fetch followers/following list when those tabs are clicked
  useEffect(() => {
    if (!profile?.user?.id) return;
    const uid = profile.user.id;

    if (activeTab === 'followers') {
      setLoadingTabList(true);
      void fetchFollowersList(uid)
        .then((list) => setFollowersList(list))
        .catch(() => setFollowersList([]))
        .finally(() => setLoadingTabList(false));
    } else if (activeTab === 'following') {
      setLoadingTabList(true);
      void fetchFollowingList(uid)
        .then((list) => setFollowingList(list))
        .catch(() => setFollowingList([]))
        .finally(() => setLoadingTabList(false));
    }
  }, [activeTab, profile?.user?.id]);

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
      await navigator.clipboard.writeText(`@${username}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy username.');
    }
  }

  // Instagram-like follow toggle for all users
  async function handleToggleFollow() {
    if (!profile || profile.isSelf || togglingFollow) return;
    const uid = profile.user.id;
    const nextFollow = !profile.isFollowing;
    const delta = nextFollow ? 1 : -1;

    // Instant optimistic update
    setTogglingFollow(true);
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            isFollowing: nextFollow,
            followersCount: Math.max(0, prev.followersCount + delta),
          }
        : prev,
    );

    try {
      await toggleFollowUser(currentUser.id, uid, nextFollow);
    } catch {
      // Revert on error
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: !nextFollow,
              followersCount: Math.max(0, prev.followersCount - delta),
            }
          : prev,
      );
      setError('Could not update follow status.');
    } finally {
      setTogglingFollow(false);
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
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setError('Could not process image.');
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        if (compressed.length > MAX_AVATAR_DATA_URL_LENGTH) {
          setError('Image too large. Please pick a smaller image.');
          return;
        }
        void uploadAvatarDataUrl(compressed);
      };
      img.onerror = () => setError('Could not read image.');
      img.src = result;
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const cleanName = editName.trim().slice(0, 32);
    if (cleanName.length < 2) {
      setError('Display name must be at least 2 characters.');
      return;
    }
    const cleanBio = editBio.trim().slice(0, 160);

    setSavingProfile(true);
    setError(null);
    try {
      const updatedUser = await updateMyProfile(currentUser.id, cleanName, cleanBio);
      onUserUpdated(updatedUser);
      setProfile((prev) => (prev ? { ...prev, user: { ...prev.user, ...updatedUser } } : prev));
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Could not save profile changes.',
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
      const incomingMap = new Map<string, FriendRequestItem>();
      for (const r of incomingRef.current) incomingMap.set(r.senderId, r);

      const res = await sendOrAutoAcceptFriendRequest({
        myUid: currentUser.id,
        targetUser: profile.user,
        incomingBySenderId: incomingMap,
      });
      if (res.status === 'accepted' && res.room) {
        onFriendAdded(profile.user, 'accepted', undefined, res.room);
        void fetchProfile(profile.user.id, true);
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
      await fetchProfile(profile.user.id, true);
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
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-dialog-username"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="flex h-[88vh] max-h-[660px] w-full max-w-md flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-white">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  id="profile-dialog-username"
                  className="font-mono text-sm font-bold text-slate-900 truncate"
                >
                  @{displayedUser?.username || 'user'}
                </span>
                {displayedUser && isDeveloperUser(displayedUser.username) && (
                  <VerifiedBadge />
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close profile"
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto">
              {loading && !profile ? (
                <div className="flex h-64 flex-col items-center justify-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
                  <p className="text-xs text-slate-500 font-medium">Loading profile...</p>
                </div>
              ) : profile && displayedUser ? (
                <>
                  {/* Instagram-style Header Card */}
                  <div className="p-5 pb-4">
                    <div className="flex items-center gap-4 sm:gap-6">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <Avatar
                          name={displayedUser.displayName}
                          color={displayedUser.avatarColor}
                          avatarUrl={displayedUser.avatarUrl}
                          size="xl"
                          showPresence
                          online={
                            profile.isSelf ? true : onlineUserIds.has(displayedUser.id)
                          }
                        />

                        {profile.isSelf && (
                          <>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={handleFileChange}
                              className="hidden"
                            />
                            <button
                              type="button"
                              disabled={uploadingPhoto}
                              onClick={() => fileInputRef.current?.click()}
                              aria-label="Change profile photo"
                              title="Change profile photo"
                              className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[#FFEC1F] hover:bg-slate-800 disabled:opacity-60 shadow-xs"
                            >
                              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Instagram Stats: Posts, Followers, Following */}
                      <div className="flex flex-1 items-center justify-around gap-2 text-center">
                        <button
                          type="button"
                          onClick={() => setActiveTab('photos')}
                          className="group rounded-xl px-2 py-1.5 hover:bg-slate-50 transition-colors"
                        >
                          <span className="block font-display text-lg sm:text-xl font-bold text-slate-900 tabular-nums">
                            {profile.sharedImagesCount}
                          </span>
                          <span className="block text-[11px] font-medium text-slate-500 group-hover:text-slate-900">
                            Posts
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('followers')}
                          className="group rounded-xl px-2 py-1.5 hover:bg-slate-50 transition-colors"
                        >
                          <span className="block font-display text-lg sm:text-xl font-bold text-slate-900 tabular-nums">
                            {profile.followersCount}
                          </span>
                          <span className="block text-[11px] font-medium text-slate-500 group-hover:text-slate-900">
                            Followers
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('following')}
                          className="group rounded-xl px-2 py-1.5 hover:bg-slate-50 transition-colors"
                        >
                          <span className="block font-display text-lg sm:text-xl font-bold text-slate-900 tabular-nums">
                            {profile.followingCount}
                          </span>
                          <span className="block text-[11px] font-medium text-slate-500 group-hover:text-slate-900">
                            Following
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Bio & Details */}
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
                      <div className="mt-3.5">
                        <div className="flex items-center gap-1.5">
                          <h2 className="text-sm sm:text-base font-bold text-slate-900">
                            {displayedUser.displayName}
                          </h2>
                          {isDeveloperUser(displayedUser.username) && <VerifiedBadge />}
                        </div>

                        {isDeveloperUser(displayedUser.username) && (
                          <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>Official Creator &amp; Lead Developer · Admin</span>
                          </p>
                        )}

                        {displayedUser.bio ? (
                          <p className="mt-1.5 whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed text-slate-700">
                            {displayedUser.bio}
                          </p>
                        ) : profile.isSelf ? (
                          <p className="mt-1.5 text-xs text-slate-400">
                            No bio yet. Tap Edit Profile to add one.
                          </p>
                        ) : null}

                        {/* Action Buttons Row */}
                        <div className="mt-4 flex items-center gap-2">
                          {profile.isSelf ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditName(displayedUser.displayName);
                                  setEditBio(displayedUser.bio ?? '');
                                  setEditing(true);
                                }}
                                className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Edit Profile</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleCopyUsername(displayedUser.username)}
                                className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
                              >
                                {copied ? (
                                  <>
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    <span className="text-emerald-600">Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Share2 className="h-3.5 w-3.5" />
                                    <span>Share</span>
                                  </>
                                )}
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Instagram Follow / Following Button for ALL users */}
                              <button
                                type="button"
                                disabled={togglingFollow}
                                onClick={() => void handleToggleFollow()}
                                className={`inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold transition-all ${
                                  profile.isFollowing
                                    ? 'border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                                    : 'bg-slate-900 text-white hover:bg-slate-800 shadow-xs'
                                }`}
                              >
                                {profile.isFollowing ? (
                                  <>
                                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>Following</span>
                                  </>
                                ) : (
                                  <>
                                    <UserPlus className="h-3.5 w-3.5 text-[#FFEC1F]" aria-hidden="true" />
                                    <span>Follow</span>
                                  </>
                                )}
                              </button>

                              {/* Message Button */}
                              {profile.relationship === 'accepted' && profile.roomId ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onOpenChat(profile.roomId!);
                                    onClose();
                                  }}
                                  className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
                                >
                                  <MessageSquare className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                                  <span>Message</span>
                                </button>
                              ) : profile.relationship === 'pending_received' ? (
                                <button
                                  type="button"
                                  disabled={busyFriendBtn}
                                  onClick={() => void handleAcceptIncoming()}
                                  className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                >
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>{busyFriendBtn ? 'Accepting...' : 'Accept Request'}</span>
                                </button>
                              ) : profile.relationship === 'pending_sent' ? (
                                <span className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
                                  <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Request Sent</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busyFriendBtn}
                                  onClick={() => void handleSendAddRequest()}
                                  className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                                >
                                  <UserPlus className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                                  <span>{busyFriendBtn ? 'Sending...' : 'Add Friend'}</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {error && (
                      <p role="alert" className="mt-2.5 text-xs font-medium text-red-600">
                        {error}
                      </p>
                    )}
                  </div>

                  {/* Tabs Bar */}
                  <div className="flex border-y border-slate-200 bg-slate-50/70 overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={() => setActiveTab('photos')}
                      className={`flex flex-1 min-h-[42px] items-center justify-center gap-1.5 border-b-2 text-xs font-semibold transition-colors px-3 whitespace-nowrap ${
                        activeTab === 'photos'
                          ? 'border-slate-900 text-slate-900 bg-white'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Grid3X3 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Photos</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('followers')}
                      className={`flex flex-1 min-h-[42px] items-center justify-center gap-1.5 border-b-2 text-xs font-semibold transition-colors px-3 whitespace-nowrap ${
                        activeTab === 'followers'
                          ? 'border-slate-900 text-slate-900 bg-white'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <span>Followers ({profile.followersCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('following')}
                      className={`flex flex-1 min-h-[42px] items-center justify-center gap-1.5 border-b-2 text-xs font-semibold transition-colors px-3 whitespace-nowrap ${
                        activeTab === 'following'
                          ? 'border-slate-900 text-slate-900 bg-white'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <span>Following ({profile.followingCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('friends')}
                      className={`flex flex-1 min-h-[42px] items-center justify-center gap-1.5 border-b-2 text-xs font-semibold transition-colors px-3 whitespace-nowrap ${
                        activeTab === 'friends'
                          ? 'border-slate-900 text-slate-900 bg-white'
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
                        className={`flex flex-1 min-h-[42px] items-center justify-center gap-1.5 border-b-2 text-xs font-semibold transition-colors px-3 whitespace-nowrap ${
                          activeTab === 'blocked'
                            ? 'border-slate-900 text-slate-900 bg-white'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Blocked ({blockedUsers.length})</span>
                      </button>
                    )}
                  </div>

                  {/* Tabs Content */}
                  <div className="p-4">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      >
                        {/* 1. Photos Tab */}
                        {activeTab === 'photos' && (
                          <>
                            {profile.sharedImages.length === 0 ? (
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

                        {/* 2. Followers Tab */}
                        {activeTab === 'followers' && (
                          <div>
                            {loadingTabList ? (
                              <div className="flex h-32 items-center justify-center">
                                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                              </div>
                            ) : followersList.length === 0 ? (
                              <div className="py-8 text-center">
                                <p className="text-sm font-semibold text-slate-800">No followers yet</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Users who follow @{displayedUser.username} will appear here.
                                </p>
                              </div>
                            ) : (
                              <ul className="divide-y divide-slate-100">
                                {followersList.map((fUser) => {
                                  const isDev = isDeveloperUser(fUser.username);
                                  return (
                                    <li
                                      key={fUser.id}
                                      className="flex items-center justify-between gap-3 py-2.5"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => onSelectProfile(fUser.id)}
                                        className="flex flex-1 items-center gap-3 min-w-0 text-left hover:opacity-85"
                                      >
                                        <Avatar
                                          name={fUser.displayName}
                                          color={fUser.avatarColor}
                                          avatarUrl={fUser.avatarUrl}
                                          size="sm"
                                        />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1">
                                            <p className="truncate text-xs font-semibold text-slate-900">
                                              {fUser.displayName}
                                            </p>
                                            {isDev && <VerifiedBadge size="sm" />}
                                          </div>
                                          <p className="truncate font-mono text-[11px] text-slate-500">
                                            @{fUser.username}
                                          </p>
                                        </div>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => onSelectProfile(fUser.id)}
                                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                      >
                                        View
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}

                        {/* 3. Following Tab */}
                        {activeTab === 'following' && (
                          <div>
                            {loadingTabList ? (
                              <div className="flex h-32 items-center justify-center">
                                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                              </div>
                            ) : followingList.length === 0 ? (
                              <div className="py-8 text-center">
                                <p className="text-sm font-semibold text-slate-800">Not following anyone yet</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Accounts followed by @{displayedUser.username} will appear here.
                                </p>
                              </div>
                            ) : (
                              <ul className="divide-y divide-slate-100">
                                {followingList.map((fUser) => {
                                  const isDev = isDeveloperUser(fUser.username);
                                  return (
                                    <li
                                      key={fUser.id}
                                      className="flex items-center justify-between gap-3 py-2.5"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => onSelectProfile(fUser.id)}
                                        className="flex flex-1 items-center gap-3 min-w-0 text-left hover:opacity-85"
                                      >
                                        <Avatar
                                          name={fUser.displayName}
                                          color={fUser.avatarColor}
                                          avatarUrl={fUser.avatarUrl}
                                          size="sm"
                                        />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1">
                                            <p className="truncate text-xs font-semibold text-slate-900">
                                              {fUser.displayName}
                                            </p>
                                            {isDev && <VerifiedBadge size="sm" />}
                                          </div>
                                          <p className="truncate font-mono text-[11px] text-slate-500">
                                            @{fUser.username}
                                          </p>
                                        </div>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => onSelectProfile(fUser.id)}
                                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                      >
                                        View
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}

                        {/* 4. Friends Tab */}
                        {activeTab === 'friends' && (
                          <>
                            {profile.friends.length === 0 ? (
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
                                          size="sm"
                                          showPresence
                                          online={isOnline}
                                        />
                                        <div className="min-w-0">
                                          <p className="truncate text-xs font-semibold text-slate-900">
                                            {friend.displayName}
                                          </p>
                                          <p className="truncate font-mono text-[11px] text-slate-500">
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
                                          className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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

                        {/* 5. Blocked Tab (Self only) */}
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
                                        <p className="truncate text-xs font-medium text-slate-900">
                                          {blocked.displayName}
                                        </p>
                                        <p className="truncate font-mono text-[11px] text-slate-500">
                                          @{blocked.username}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={unblockingId === blocked.id}
                                      onClick={() => void handleUnblock(blocked.id)}
                                      className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
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
