import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, FormEvent, KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  Ban,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eraser,
  Flame,
  ImagePlus,
  LogOut,
  Menu,
  MessageSquare,
  Mic,
  MoreVertical,
  Palette,
  Phone,
  Pin,
  PinOff,
  Plus,
  Reply,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SmilePlus,
  Square,
  Timer,
  Trash2,
  User,
  UserMinus,
  UserPlus,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  acceptFriendRequest,
  blockUser,
  computeChatStreak,
  declineOrCancelFriendRequest,
  deleteGroupMessage,
  deleteMessageFromRoom,
  MAX_MEDIA_DATA_URL_LENGTH,
  openAndBurnViewOnceSnap,
  removeSavedMessage,
  saveMessageBookmark,
  sendMessageToGroup,
  sendMessageToRoom,
  subscribeBlockedUsers,
  subscribeCalls,
  subscribeChatPrefs,
  subscribeFriendRequests,
  subscribeGroupMessages,
  subscribePublicUser,
  subscribeRoomMessages,
  subscribeSavedMessages,
  subscribeStories,
  subscribeUserGroups,
  subscribeUserRooms,
  syncMyFriendsCount,
  toggleGroupMessageReaction,
  toggleMessageReaction,
  unfriendUser,
  updateGroupTypingCursor,
  updateMyPresence,
  updateRoomActivityCursor,
  upsertChatPref,
} from '../services/firestoreChat';
import type { RawRoomDoc } from '../services/firestoreChat';
import type {
  CallKind,
  CallSession,
  ChatMessage,
  ChatPref,
  ChatTheme,
  FriendRequestItem,
  GroupChat,
  PublicUser,
  Room,
  SavedMessageItem,
  StoryItem,
} from '../types/chat';
import { playNotificationChime } from '../utils/sound';
import { AddFriendModal } from './AddFriendModal';
import { Avatar } from './Avatar';
import { CallModal } from './CallModal';
import type { OutgoingCallRequest } from './CallModal';
import { CreateGroupModal } from './CreateGroupModal';
import { ProfileModal } from './ProfileModal';
import { PWAInstallButton } from './PWAInstallButton';
import { SavedMessagesModal } from './SavedMessagesModal';
import { StoriesAndNotesStrip } from './StoriesAndNotesStrip';

interface ChatWorkspaceProps {
  currentUser: PublicUser;
  onUserUpdated: (user: PublicUser) => void;
  onSignOut: () => void;
}

const REACTION_EMOJIS = ['❤️', '😂', '👍', '🔥', '😮', '😢'] as const;
const DISAPPEAR_24H_MS = 24 * 60 * 60 * 1000;

interface ThemeStyle {
  label: string;
  swatch: string;
  bgClass: string;
  isDark: boolean;
  textClass: string;
  mutedClass: string;
  hoverClass: string;
  dividerClass: string;
  replyClass: string;
  reactionDefaultClass: string;
}

const CHAT_THEMES: Record<ChatTheme, ThemeStyle> = {
  default: {
    label: 'Clean White',
    swatch: '#FFFFFF',
    bgClass: 'bg-white',
    isDark: false,
    textClass: 'text-slate-800',
    mutedClass: 'text-slate-400',
    hoverClass: 'hover:bg-slate-50',
    dividerClass: 'bg-slate-200',
    replyClass: 'border-blue-500 bg-slate-100/80 text-slate-600',
    reactionDefaultClass: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100',
  },
  ocean: {
    label: 'Ocean Mist',
    swatch: '#E0F2FE',
    bgClass: 'bg-sky-50/75',
    isDark: false,
    textClass: 'text-slate-800',
    mutedClass: 'text-slate-500',
    hoverClass: 'hover:bg-sky-100/60',
    dividerClass: 'bg-sky-200',
    replyClass: 'border-sky-600 bg-white/80 text-slate-700',
    reactionDefaultClass: 'border-sky-200 bg-white/90 text-slate-700 hover:bg-sky-100',
  },
  lavender: {
    label: 'Soft Lavender',
    swatch: '#EDE9FE',
    bgClass: 'bg-violet-50/75',
    isDark: false,
    textClass: 'text-slate-800',
    mutedClass: 'text-slate-500',
    hoverClass: 'hover:bg-violet-100/60',
    dividerClass: 'bg-violet-200',
    replyClass: 'border-violet-600 bg-white/80 text-slate-700',
    reactionDefaultClass: 'border-violet-200 bg-white/90 text-slate-700 hover:bg-violet-100',
  },
  sunset: {
    label: 'Warm Sunset',
    swatch: '#FEF3C7',
    bgClass: 'bg-amber-50/70',
    isDark: false,
    textClass: 'text-slate-800',
    mutedClass: 'text-slate-500',
    hoverClass: 'hover:bg-amber-100/60',
    dividerClass: 'bg-amber-200',
    replyClass: 'border-amber-600 bg-white/80 text-slate-700',
    reactionDefaultClass: 'border-amber-200 bg-white/90 text-slate-700 hover:bg-amber-100',
  },
  forest: {
    label: 'Sage Forest',
    swatch: '#D1FAE5',
    bgClass: 'bg-emerald-50/65',
    isDark: false,
    textClass: 'text-slate-800',
    mutedClass: 'text-slate-500',
    hoverClass: 'hover:bg-emerald-100/60',
    dividerClass: 'bg-emerald-200',
    replyClass: 'border-emerald-600 bg-white/80 text-slate-700',
    reactionDefaultClass: 'border-emerald-200 bg-white/90 text-slate-700 hover:bg-emerald-100',
  },
  midnight: {
    label: 'Midnight',
    swatch: '#0F172A',
    bgClass: 'bg-slate-950',
    isDark: true,
    textClass: 'text-slate-100',
    mutedClass: 'text-slate-400',
    hoverClass: 'hover:bg-slate-900/90',
    dividerClass: 'bg-slate-800',
    replyClass: 'border-blue-400 bg-slate-900 text-slate-200',
    reactionDefaultClass: 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800',
  },
};

const THEME_KEYS: ChatTheme[] = ['default', 'ocean', 'lavender', 'sunset', 'forest', 'midnight'];

function formatMessageTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateHeading(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatLastSeen(ts?: number | null): string {
  if (!ts) return 'Offline';
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return 'Last seen just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const d = new Date(ts);
  return `Last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

function formatDuration(ms?: number | null): string {
  if (!ms || ms <= 0) return '0:00';
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ChatWorkspace({
  currentUser,
  onUserUpdated,
  onSignOut,
}: ChatWorkspaceProps) {
  const [rawRooms, setRawRooms] = useState<RawRoomDoc[]>([]);
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [otherUsersById, setOtherUsersById] = useState<Record<string, PublicUser>>({});
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestItem[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<PublicUser[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [selectedImageDataUrl, setSelectedImageDataUrl] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Feature states (existing + 6 new features)
  const [soundMuted, setSoundMuted] = useState(false);
  const [viewOnceMode, setViewOnceMode] = useState(false);
  const [disappear24hMode, setDisappear24hMode] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [openReactionMsgId, setOpenReactionMsgId] = useState<string | null>(null);
  const [revealedSnap, setRevealedSnap] = useState<{
    senderName: string;
    dataUrl: string | null;
    content: string;
  } | null>(null);
  const [openingSnapId, setOpeningSnapId] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'unfriend' | 'block' | 'clear_chat';
    user?: PublicUser;
    roomId?: string;
    roomName?: string;
  } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [processingFriendAction, setProcessingFriendAction] = useState(false);

  // New feature states
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [chatPrefsByRoomId, setChatPrefsByRoomId] = useState<Record<string, ChatPref>>({});
  const [savedMessages, setSavedMessages] = useState<SavedMessageItem[]>([]);
  const [savedModalOpen, setSavedModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupChat | null>(null);
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [outgoingCallRequest, setOutgoingCallRequest] = useState<OutgoingCallRequest | null>(null);
  const [dismissedCallIds, setDismissedCallIds] = useState<Set<string>>(() => new Set());
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatSearchCursor, setChatSearchCursor] = useState(0);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const soundMutedRef = useRef(soundMuted);
  const lastTypingPingRef = useRef<number>(0);
  const typingStopTimerRef = useRef<number | null>(null);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const messageRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const shouldStickToBottomRef = useRef(true);
  const seenIncomingReqIdsRef = useRef<Set<string> | null>(null);
  const seenMessageIdsByRoomRef = useRef<Record<string, Set<string>>>({});
  const otherUsersRef = useRef<Record<string, PublicUser>>({});
  const currentUserRef = useRef(currentUser);
  const chatPrefsRef = useRef<Record<string, ChatPref>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number>(0);
  const discardRecordingRef = useRef(false);

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    soundMutedRef.current = soundMuted;
  }, [soundMuted]);

  useEffect(() => {
    otherUsersRef.current = otherUsersById;
  }, [otherUsersById]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    chatPrefsRef.current = chatPrefsByRoomId;
  }, [chatPrefsByRoomId]);

  const rooms = useMemo<Room[]>(() => {
    return rawRooms.map((r) => {
      const otherUid = r.userA === currentUser.id ? r.userB : r.userA;
      const otherUser = otherUsersById[otherUid] ?? null;
      return {
        id: r.id,
        name: otherUser?.displayName || 'Friend',
        slug: `@${otherUser?.username || 'user'}`,
        description: `@${otherUser?.username || 'user'}`,
        type: 'dm',
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        memberIds: [r.userA, r.userB],
        otherUser,
        userA: r.userA,
        userB: r.userB,
        userALastDeliveredAtMs: r.userALastDeliveredAtMs,
        userALastSeenAtMs: r.userALastSeenAtMs,
        userBLastDeliveredAtMs: r.userBLastDeliveredAtMs,
        userBLastSeenAtMs: r.userBLastSeenAtMs,
        typingUserAUntilMs: r.typingUserAUntilMs,
        typingUserBUntilMs: r.typingUserBUntilMs,
        lastMessageAtMs: r.lastMessageAtMs,
      };
    });
  }, [rawRooms, otherUsersById, currentUser.id]);

  const myFriendsList = useMemo(
    () => rooms.map((r) => r.otherUser).filter((u): u is PublicUser => Boolean(u)),
    [rooms],
  );

  const onlineUserIds = useMemo(() => {
    const set = new Set<string>([currentUser.id]);
    for (const [uid, u] of Object.entries(otherUsersById)) {
      if (u.online && u.lastSeenAt && nowTick - u.lastSeenAt < 2 * 60 * 1000) {
        set.add(uid);
      }
    }
    return set;
  }, [currentUser.id, otherUsersById, nowTick]);

  // Periodic tick to expire typing indicators, stale presence & stories
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, []);

  // Presence heartbeat
  useEffect(() => {
    void updateMyPresence(currentUser.id, true).catch(() => {});
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void updateMyPresence(currentUser.id, true).catch(() => {});
      }
    }, 45_000);

    function onVisibility() {
      void updateMyPresence(currentUser.id, document.visibilityState === 'visible').catch(() => {});
    }
    function onBeforeUnload() {
      void updateMyPresence(currentUser.id, false).catch(() => {});
    }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [currentUser.id]);

  // Sync friendsCount on own public profile whenever friend count changes
  useEffect(() => {
    if (bootstrapLoading) return;
    if ((currentUser.friendsCount ?? 0) !== rawRooms.length) {
      void syncMyFriendsCount(currentUser.id, rawRooms.length).catch(() => {});
    }
  }, [bootstrapLoading, rawRooms.length, currentUser.id, currentUser.friendsCount]);

  // Subscribe to rooms, groups, friend requests, blocks, stories, chatPrefs, savedMessages, calls
  useEffect(() => {
    setBootstrapLoading(true);
    setBootstrapError(null);

    const unsubRooms = subscribeUserRooms(currentUser.id, (nextRawRooms) => {
      setRawRooms(nextRawRooms);
      setBootstrapLoading(false);
      setActiveRoomId((prev) => {
        if (prev) return prev;
        return nextRawRooms[0]?.id ?? null;
      });
    });

    const unsubGroups = subscribeUserGroups(currentUser.id, (nextGroups) => {
      setGroups(nextGroups);
      setActiveRoomId((prev) => {
        if (prev) return prev;
        return nextGroups[0]?.id ?? null;
      });
    });

    const unsubReqs = subscribeFriendRequests(currentUser.id, (incoming, outgoing) => {
      if (seenIncomingReqIdsRef.current !== null) {
        const hasNew = incoming.some((r) => !seenIncomingReqIdsRef.current!.has(r.id));
        if (hasNew && !soundMutedRef.current) {
          playNotificationChime('request');
        }
      }
      seenIncomingReqIdsRef.current = new Set(incoming.map((r) => r.id));
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
    });

    const unsubBlocks = subscribeBlockedUsers(currentUser.id, setBlockedUsers);
    const unsubStories = subscribeStories(currentUser.id, setStories);
    const unsubPrefs = subscribeChatPrefs(currentUser.id, setChatPrefsByRoomId);
    const unsubSaved = subscribeSavedMessages(currentUser.id, setSavedMessages);
    const unsubCalls = subscribeCalls(currentUser.id, setCalls);

    return () => {
      unsubRooms();
      unsubGroups();
      unsubReqs();
      unsubBlocks();
      unsubStories();
      unsubPrefs();
      unsubSaved();
      unsubCalls();
    };
  }, [currentUser.id]);

  // Clear activeRoomId if deleted / unfriended / left group
  useEffect(() => {
    if (!activeRoomId || bootstrapLoading) return;
    const existsInRooms = rawRooms.some((r) => r.id === activeRoomId);
    const existsInGroups = groups.some((g) => g.id === activeRoomId);
    if (!existsInRooms && !existsInGroups) {
      setActiveRoomId(rawRooms[0]?.id ?? groups[0]?.id ?? null);
    }
  }, [activeRoomId, rawRooms, groups, bootstrapLoading]);

  // Subscribe to all friends' AND group members' public profiles
  const profileIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rawRooms) {
      ids.add(r.userA === currentUser.id ? r.userB : r.userA);
    }
    for (const g of groups) {
      for (const uid of g.memberIds) {
        if (uid !== currentUser.id) ids.add(uid);
      }
    }
    return Array.from(ids).sort().join(',');
  }, [rawRooms, groups, currentUser.id]);

  useEffect(() => {
    if (!profileIdsKey) {
      setOtherUsersById({});
      return;
    }
    const ids = profileIdsKey.split(',').filter(Boolean);
    const unsubs = ids.map((uid) =>
      subscribePublicUser(uid, (user) => {
        if (!user) return;
        setOtherUsersById((prev) => ({ ...prev, [uid]: user }));
      }),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [profileIdsKey]);

  const stopRecordingCleanup = useCallback((discard: boolean) => {
    discardRecordingRef.current = discard;
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    if (discard && mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
    setRecordingMs(0);
  }, []);

  useEffect(() => {
    return () => {
      stopRecordingCleanup(true);
    };
  }, [stopRecordingCleanup]);

  useEffect(() => {
    setReplyingTo(null);
    setOpenReactionMsgId(null);
    setHeaderMenuOpen(false);
    setChatSearchOpen(false);
    setChatSearchQuery('');
    setChatSearchCursor(0);
    if (isRecording) {
      stopRecordingCleanup(true);
    }
  }, [activeRoomId, isRecording, stopRecordingCleanup]);

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        setLightboxImageUrl(null);
        setRevealedSnap(null);
        setOpenReactionMsgId(null);
        setHeaderMenuOpen(false);
        setConfirmAction(null);
        setShowLogoutConfirm(false);
        setChatSearchOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!headerMenuOpen && !openReactionMsgId) return;
    function onWindowClick() {
      setHeaderMenuOpen(false);
      setOpenReactionMsgId(null);
    }
    window.addEventListener('click', onWindowClick);
    return () => window.removeEventListener('click', onWindowClick);
  }, [headerMenuOpen, openReactionMsgId]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = messageScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    shouldStickToBottomRef.current = true;
    setShowJumpToBottom(false);
  }, []);

  // Subscribe to messages for all active DM rooms
  const roomIdsKey = useMemo(() => rawRooms.map((r) => r.id).sort().join(','), [rawRooms]);

  useEffect(() => {
    if (!roomIdsKey) {
      return;
    }

    const unsubs = rawRooms.map((raw) => {
      const syntheticRoom: Room = {
        id: raw.id,
        name: '',
        slug: '',
        description: '',
        type: 'dm',
        createdBy: raw.createdBy,
        createdAt: raw.createdAt,
        userA: raw.userA,
        userB: raw.userB,
      };
      if (raw.id === activeRoomIdRef.current && !(raw.id in seenMessageIdsByRoomRef.current)) {
        setLoadingRoomId(raw.id);
      }
      return subscribeRoomMessages(
        syntheticRoom,
        currentUser.id,
        (senderId) =>
          senderId === currentUser.id
            ? currentUserRef.current
            : otherUsersRef.current[senderId],
        (msgs) => {
          setLoadingRoomId((curr) => (curr === raw.id ? null : curr));
          const prevSeen = seenMessageIdsByRoomRef.current[raw.id];
          if (prevSeen) {
            const newIncoming = msgs.filter(
              (m) => m.senderId !== currentUser.id && !prevSeen.has(m.id),
            );
            if (newIncoming.length > 0) {
              if (!soundMutedRef.current) {
                playNotificationChime('message');
              }
              const now = Date.now();
              if (raw.id === activeRoomIdRef.current && document.visibilityState === 'visible') {
                void updateRoomActivityCursor({
                  room: syntheticRoom,
                  myUid: currentUser.id,
                  deliveredAtMs: now,
                  seenAtMs: now,
                });
                void upsertChatPref({
                  myUid: currentUser.id,
                  roomId: raw.id,
                  current: chatPrefsRef.current[raw.id],
                  patch: { lastSeenAtMs: now },
                });
              } else {
                void updateRoomActivityCursor({
                  room: syntheticRoom,
                  myUid: currentUser.id,
                  deliveredAtMs: now,
                });
              }
            }
          } else {
            const latestIncoming = msgs.filter((m) => m.senderId !== currentUser.id).at(-1);
            if (latestIncoming) {
              const now = Date.now();
              const isActive =
                raw.id === activeRoomIdRef.current && document.visibilityState === 'visible';
              void updateRoomActivityCursor({
                room: syntheticRoom,
                myUid: currentUser.id,
                deliveredAtMs: now,
                seenAtMs: isActive ? now : undefined,
              });
              if (isActive) {
                void upsertChatPref({
                  myUid: currentUser.id,
                  roomId: raw.id,
                  current: chatPrefsRef.current[raw.id],
                  patch: { lastSeenAtMs: now },
                });
              }
            }
          }
          seenMessageIdsByRoomRef.current[raw.id] = new Set(msgs.map((m) => m.id));
          setMessagesByRoom((prev) => ({ ...prev, [raw.id]: msgs }));

          if (raw.id === activeRoomIdRef.current && shouldStickToBottomRef.current) {
            requestAnimationFrame(() => scrollToBottom('auto'));
          }
        },
      );
    });

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [roomIdsKey, currentUser.id, scrollToBottom]);

  // Subscribe to messages for all active Groups
  const groupIdsKey = useMemo(() => groups.map((g) => g.id).sort().join(','), [groups]);

  useEffect(() => {
    if (!groupIdsKey) return;
    const ids = groupIdsKey.split(',').filter(Boolean);
    const unsubs = ids.map((gid) => {
      if (gid === activeRoomIdRef.current && !(gid in seenMessageIdsByRoomRef.current)) {
        setLoadingRoomId(gid);
      }
      return subscribeGroupMessages(
        gid,
        currentUser.id,
        (senderId) =>
          senderId === currentUser.id
            ? currentUserRef.current
            : otherUsersRef.current[senderId],
        (msgs) => {
          setLoadingRoomId((curr) => (curr === gid ? null : curr));
          const prevSeen = seenMessageIdsByRoomRef.current[gid];
          if (prevSeen) {
            const newIncoming = msgs.filter(
              (m) => m.senderId !== currentUser.id && !prevSeen.has(m.id),
            );
            if (newIncoming.length > 0) {
              if (!soundMutedRef.current) {
                playNotificationChime('message');
              }
              if (gid === activeRoomIdRef.current && document.visibilityState === 'visible') {
                void upsertChatPref({
                  myUid: currentUser.id,
                  roomId: gid,
                  current: chatPrefsRef.current[gid],
                  patch: { lastSeenAtMs: Date.now() },
                });
              }
            }
          }
          seenMessageIdsByRoomRef.current[gid] = new Set(msgs.map((m) => m.id));
          setMessagesByRoom((prev) => ({ ...prev, [gid]: msgs }));

          if (gid === activeRoomIdRef.current && shouldStickToBottomRef.current) {
            requestAnimationFrame(() => scrollToBottom('auto'));
          }
        },
      );
    });

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [groupIdsKey, currentUser.id, scrollToBottom]);

  // Mark active DM or Group seen in both room cursor and persistent chatPrefs
  const markConversationSeen = useCallback(
    (targetId: string) => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      const dmRoom = rawRooms.find((r) => r.id === targetId);
      if (dmRoom) {
        void updateRoomActivityCursor({
          room: {
            id: dmRoom.id,
            name: '',
            slug: '',
            description: '',
            type: 'dm',
            createdBy: dmRoom.createdBy,
            createdAt: dmRoom.createdAt,
            userA: dmRoom.userA,
            userB: dmRoom.userB,
          },
          myUid: currentUser.id,
          deliveredAtMs: now,
          seenAtMs: now,
        });
      }

      const pref = chatPrefsRef.current[targetId];
      const latestMsgMs = (messagesByRoom[targetId] ?? []).at(-1)?.createdAt ?? 0;
      if (!pref || latestMsgMs > pref.lastSeenAtMs) {
        void upsertChatPref({
          myUid: currentUser.id,
          roomId: targetId,
          current: pref,
          patch: { lastSeenAtMs: Math.max(now, latestMsgMs) },
        });
      }
    },
    [rawRooms, currentUser.id, messagesByRoom],
  );

  useEffect(() => {
    if (!activeRoomId) return;
    markConversationSeen(activeRoomId);
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [activeRoomId, markConversationSeen, scrollToBottom]);

  useEffect(() => {
    function handleFocusOrVisible() {
      if (document.visibilityState === 'visible' && activeRoomIdRef.current) {
        markConversationSeen(activeRoomIdRef.current);
      }
    }
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [markConversationSeen]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId],
  );

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeRoomId) ?? null,
    [groups, activeRoomId],
  );

  const activeConversationName = activeRoom?.name ?? activeGroup?.name ?? '';
  const activePref = activeRoomId ? chatPrefsByRoomId[activeRoomId] : undefined;
  const activeThemeKey: ChatTheme = activePref?.theme ?? 'default';
  const activeTheme = CHAT_THEMES[activeThemeKey] ?? CHAT_THEMES.default;

  const myFriendRoomByUserId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rooms) {
      if (r.otherUser) {
        map[r.otherUser.id] = r.id;
      }
    }
    return map;
  }, [rooms]);

  // Persistent unread counts computed directly from messages + lastSeenAtMs + clearedAtMs
  const unreadByRoom = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [rid, msgs] of Object.entries(messagesByRoom)) {
      if (rid === activeRoomId && document.visibilityState === 'visible') {
        map[rid] = 0;
        continue;
      }
      const pref = chatPrefsByRoomId[rid];
      const seenAt = pref?.lastSeenAtMs ?? 0;
      const clearedAt = pref?.clearedAtMs ?? 0;
      const threshold = Math.max(seenAt, clearedAt);
      const count = msgs.filter(
        (m) => m.senderId !== currentUser.id && m.createdAt > threshold,
      ).length;
      if (count > 0) map[rid] = count;
    }
    return map;
  }, [messagesByRoom, chatPrefsByRoomId, activeRoomId, currentUser.id]);

  // Daily chat streaks per DM room
  const streakByRoomId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rawRooms) {
      const msgs = messagesByRoom[r.id] ?? [];
      const streak = computeChatStreak(msgs, r.userA, r.userB);
      if (streak > 0) map[r.id] = streak;
    }
    return map;
  }, [rawRooms, messagesByRoom]);

  const savedMessageIds = useMemo(
    () => new Set(savedMessages.map((s) => s.id)),
    [savedMessages],
  );

  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rooms
      .filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          (r.otherUser?.username.toLowerCase().includes(q) ?? false),
      )
      .sort((a, b) => {
        const aPinned = chatPrefsByRoomId[a.id]?.pinned ? 0 : 1;
        const bPinned = chatPrefsByRoomId[b.id]?.pinned ? 0 : 1;
        if (aPinned !== bPinned) return aPinned - bPinned;
        const aOnline = a.otherUser && onlineUserIds.has(a.otherUser.id) ? 0 : 1;
        const bOnline = b.otherUser && onlineUserIds.has(b.otherUser.id) ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        return (b.lastMessageAtMs ?? 0) - (a.lastMessageAtMs ?? 0) || a.name.localeCompare(b.name);
      });
  }, [rooms, searchQuery, onlineUserIds, chatPrefsByRoomId]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groups
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aPinned = chatPrefsByRoomId[a.id]?.pinned ? 0 : 1;
        const bPinned = chatPrefsByRoomId[b.id]?.pinned ? 0 : 1;
        if (aPinned !== bPinned) return aPinned - bPinned;
        return b.lastMessageAtMs - a.lastMessageAtMs || a.name.localeCompare(b.name);
      });
  }, [groups, searchQuery, chatPrefsByRoomId]);

  const activeMessages = useMemo(() => {
    if (!activeRoomId) return [];
    const list = messagesByRoom[activeRoomId] ?? [];
    const clearedAt = chatPrefsByRoomId[activeRoomId]?.clearedAtMs ?? 0;
    const visibleList = clearedAt > 0 ? list.filter((m) => m.createdAt > clearedAt) : list;

    if (activeRoom) {
      const otherIsUserB = currentUser.id === activeRoom.userA;
      const otherDeliveredAt = otherIsUserB
        ? (activeRoom.userBLastDeliveredAtMs ?? 0)
        : (activeRoom.userALastDeliveredAtMs ?? 0);
      const otherSeenAt = otherIsUserB
        ? (activeRoom.userBLastSeenAtMs ?? 0)
        : (activeRoom.userALastSeenAtMs ?? 0);

      return visibleList.map((m) => {
        const sender =
          m.senderId === currentUser.id
            ? currentUser
            : (otherUsersById[m.senderId] ?? activeRoom.otherUser);
        const isOwn = m.senderId === currentUser.id;
        return {
          ...m,
          senderName: sender?.username || m.senderName,
          senderDisplayName: sender?.displayName || m.senderDisplayName,
          senderColor: sender?.avatarColor || m.senderColor,
          senderAvatarUrl: sender?.avatarUrl ?? m.senderAvatarUrl ?? null,
          deliveredAt: isOwn && otherDeliveredAt >= m.createdAt ? otherDeliveredAt : null,
          seenAt: isOwn && otherSeenAt >= m.createdAt ? otherSeenAt : null,
        };
      });
    }

    if (activeGroup) {
      return visibleList.map((m) => {
        const sender =
          m.senderId === currentUser.id ? currentUser : otherUsersById[m.senderId];
        return {
          ...m,
          senderName: sender?.username || m.senderName,
          senderDisplayName: sender?.displayName || m.senderDisplayName,
          senderColor: sender?.avatarColor || m.senderColor,
          senderAvatarUrl: sender?.avatarUrl ?? m.senderAvatarUrl ?? null,
        };
      });
    }

    return [];
  }, [
    activeRoomId,
    activeRoom,
    activeGroup,
    messagesByRoom,
    chatPrefsByRoomId,
    currentUser,
    otherUsersById,
  ]);

  const activeTypers = useMemo(() => {
    if (activeRoom && activeRoom.otherUser) {
      const otherIsUserA = activeRoom.otherUser.id === activeRoom.userA;
      const until = otherIsUserA
        ? (activeRoom.typingUserAUntilMs ?? 0)
        : (activeRoom.typingUserBUntilMs ?? 0);
      if (until > nowTick) {
        return [activeRoom.otherUser.displayName];
      }
      return [];
    }
    if (activeGroup) {
      if (
        activeGroup.typingUid &&
        activeGroup.typingUid !== currentUser.id &&
        activeGroup.typingUntilMs > nowTick
      ) {
        return [activeGroup.typingName || 'Someone'];
      }
    }
    return [];
  }, [activeRoom, activeGroup, currentUser.id, nowTick]);

  // In-chat search match IDs
  const matchedMessageIds = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase();
    if (!chatSearchOpen || !q) return [];
    return activeMessages
      .filter(
        (m) =>
          !m.viewOnce &&
          (m.content.toLowerCase().includes(q) ||
            m.senderDisplayName.toLowerCase().includes(q)),
      )
      .map((m) => m.id);
  }, [chatSearchOpen, chatSearchQuery, activeMessages]);

  const matchedSet = useMemo(() => new Set(matchedMessageIds), [matchedMessageIds]);
  const focusedMatchId =
    matchedMessageIds.length > 0
      ? matchedMessageIds[
          ((chatSearchCursor % matchedMessageIds.length) + matchedMessageIds.length) %
            matchedMessageIds.length
        ]
      : null;

  useEffect(() => {
    if (!focusedMatchId) return;
    const el = messageRowRefs.current[focusedMatchId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusedMatchId]);

  // Live incoming or active WebRTC call
  const liveCall = useMemo(() => {
    const now = Date.now();
    return (
      calls.find(
        (c) =>
          !dismissedCallIds.has(c.id) &&
          (c.status === 'active' || (c.status === 'ringing' && now - c.createdAtMs < 90_000)),
      ) ?? null
    );
  }, [calls, dismissedCallIds]);

  const callPeerUser = useMemo(() => {
    if (liveCall) {
      const peerUid =
        liveCall.callerId === currentUser.id ? liveCall.calleeId : liveCall.callerId;
      return otherUsersById[peerUid] ?? null;
    }
    return outgoingCallRequest?.callee ?? null;
  }, [liveCall, outgoingCallRequest, currentUser.id, otherUsersById]);

  async function handleAcceptRequest(requestId: string) {
    setBusyRequestId(requestId);
    setActionError(null);
    try {
      const req = incomingRequests.find((r) => r.id === requestId);
      if (!req) return;
      const room = await acceptFriendRequest({
        requestId,
        myUid: currentUser.id,
        otherUser: req.user,
      });
      setActiveRoomId(room.id);
      setSidebarOpen(false);
    } catch {
      setActionError('Could not accept request.');
    } finally {
      setBusyRequestId(null);
    }
  }

  async function handleDeclineOrCancelRequest(requestId: string) {
    setBusyRequestId(requestId);
    setActionError(null);
    try {
      await declineOrCancelFriendRequest(requestId);
    } catch {
      setActionError('Could not update request.');
    } finally {
      setBusyRequestId(null);
    }
  }

  async function executeConfirmAction() {
    if (!confirmAction) return;
    setProcessingFriendAction(true);
    setActionError(null);
    try {
      if (confirmAction.type === 'clear_chat' && confirmAction.roomId) {
        await upsertChatPref({
          myUid: currentUser.id,
          roomId: confirmAction.roomId,
          current: chatPrefsByRoomId[confirmAction.roomId],
          patch: { clearedAtMs: Date.now() },
        });
      } else if (confirmAction.user) {
        if (confirmAction.type === 'unfriend') {
          await unfriendUser(currentUser.id, confirmAction.user.id);
        } else {
          await blockUser(currentUser.id, confirmAction.user);
        }
      }
      setConfirmAction(null);
    } catch {
      setActionError('Could not complete action.');
    } finally {
      setProcessingFriendAction(false);
    }
  }

  function emitTypingStop(room: Room | null, group: GroupChat | null) {
    if (typingStopTimerRef.current !== null) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (lastTypingPingRef.current > 0) {
      lastTypingPingRef.current = 0;
      if (room) {
        void updateRoomActivityCursor({ room, myUid: currentUser.id, typingUntilMs: 0 });
      } else if (group) {
        void updateGroupTypingCursor({
          groupId: group.id,
          myUid: currentUser.id,
          displayName: currentUser.displayName,
          typingUntilMs: 0,
        });
      }
    }
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (!activeRoom && !activeGroup) return;
    if (value.trim().length > 0) {
      const now = Date.now();
      if (now - lastTypingPingRef.current > 2000) {
        lastTypingPingRef.current = now;
        if (activeRoom) {
          void updateRoomActivityCursor({
            room: activeRoom,
            myUid: currentUser.id,
            typingUntilMs: now + 4000,
          });
        } else if (activeGroup) {
          void updateGroupTypingCursor({
            groupId: activeGroup.id,
            myUid: currentUser.id,
            displayName: currentUser.displayName,
            typingUntilMs: now + 4000,
          });
        }
      }
      if (typingStopTimerRef.current !== null) {
        window.clearTimeout(typingStopTimerRef.current);
      }
      const roomSnapshot = activeRoom;
      const groupSnapshot = activeGroup;
      typingStopTimerRef.current = window.setTimeout(() => {
        emitTypingStop(roomSnapshot, groupSnapshot);
      }, 2500);
    } else {
      emitTypingStop(activeRoom, activeGroup);
    }
  }

  function readAndPrepareImage(file: File) {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setActionError('Please choose a PNG, JPG, WEBP, or GIF image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setActionError('Image file must be under 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!rawUrl) return;

      if (file.type === 'image/gif' && rawUrl.length <= MAX_MEDIA_DATA_URL_LENGTH) {
        setSelectedImageDataUrl(rawUrl);
        setSelectedImageName(file.name);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const tryCompress = (maxDim: number, quality: number): string | null => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.drawImage(img, 0, 0, width, height);
          return canvas.toDataURL('image/jpeg', quality);
        };

        let result = tryCompress(1280, 0.82);
        if (result && result.length > MAX_MEDIA_DATA_URL_LENGTH) {
          result = tryCompress(1024, 0.72);
        }
        if (result && result.length > MAX_MEDIA_DATA_URL_LENGTH) {
          result = tryCompress(800, 0.62);
        }
        if (!result || result.length > MAX_MEDIA_DATA_URL_LENGTH) {
          setActionError('Image is too large after compression. Please select a smaller photo.');
          return;
        }
        setSelectedImageDataUrl(result);
        setSelectedImageName(file.name);
      };
      img.onerror = () => {
        setActionError('Could not read the selected image.');
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      readAndPrepareImage(file);
    }
  }

  function handleComposerPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          readAndPrepareImage(file);
          return;
        }
      }
    }
  }

  function clearSelectedImage() {
    setSelectedImageDataUrl(null);
    setSelectedImageName(null);
  }

  async function startVoiceRecording() {
    if ((!activeRoom && !activeGroup) || isRecording || uploadingMedia) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setActionError('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      discardRecordingRef.current = false;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      const supportedType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType, audioBitsPerSecond: 24000 })
        : new MediaRecorder(stream, { audioBitsPerSecond: 24000 });

      mediaRecorderRef.current = recorder;
      const targetRoom = activeRoom;
      const targetGroup = activeGroup;
      const pendingReply = replyingTo;
      const pendingDisappear = disappear24hMode ? DISAPPEAR_24H_MS : null;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        if (discardRecordingRef.current) {
          audioChunksRef.current = [];
          return;
        }

        const durationMs = Math.max(500, Date.now() - recordingStartedAtRef.current);
        const blob = new Blob(audioChunksRef.current, {
          type: (recorder.mimeType || 'audio/webm').split(';')[0],
        });
        audioChunksRef.current = [];
        if (blob.size < 200) {
          setActionError('Voice note was too short.');
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : null;
          if (!dataUrl) return;
          void uploadAndSendVoiceNote(
            targetRoom,
            targetGroup,
            dataUrl,
            durationMs,
            pendingReply,
            pendingDisappear,
          );
        };
        reader.readAsDataURL(blob);
      };

      recordingStartedAtRef.current = Date.now();
      setRecordingMs(0);
      setIsRecording(true);
      recorder.start(250);

      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - recordingStartedAtRef.current;
        setRecordingMs(elapsed);
        if (elapsed >= 90_000) {
          stopRecordingCleanup(false);
        }
      }, 250);
    } catch {
      setActionError('Microphone permission denied or unavailable.');
    }
  }

  async function uploadAndSendVoiceNote(
    room: Room | null,
    group: GroupChat | null,
    dataUrl: string,
    durationMs: number,
    replyTarget: ChatMessage | null,
    disappearAfterMs: number | null,
  ) {
    if (dataUrl.length > MAX_MEDIA_DATA_URL_LENGTH) {
      setActionError('Voice note is too long. Please keep voice notes under 60 seconds.');
      return;
    }
    setUploadingMedia(true);
    setActionError(null);

    const safeReply = replyTarget
      ? {
          id: replyTarget.id,
          senderDisplayName: replyTarget.senderDisplayName,
          content: replyTarget.viewOnce ? 'View-once snap' : replyTarget.content,
          hasImage: Boolean(replyTarget.imageUrl),
          hasAudio: Boolean(replyTarget.audioUrl),
        }
      : null;

    try {
      setReplyingTo(null);
      if (room) {
        await sendMessageToRoom({
          room,
          myUid: currentUser.id,
          content: '',
          audioUrl: dataUrl,
          audioDurationMs: durationMs,
          replyTo: safeReply,
          disappearAfterMs,
        });
      } else if (group) {
        await sendMessageToGroup({
          group,
          myUid: currentUser.id,
          content: '',
          audioUrl: dataUrl,
          audioDurationMs: durationMs,
          replyTo: safeReply,
          disappearAfterMs,
        });
      }
      requestAnimationFrame(() => scrollToBottom('smooth'));
    } catch (err) {
      setActionError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Could not send voice note.',
      );
    } finally {
      setUploadingMedia(false);
    }
  }

  async function submitMessage() {
    if ((!activeRoom && !activeGroup) || uploadingMedia) return;
    const room = activeRoom;
    const group = activeGroup;
    const content = draft.trim();
    const pendingDataUrl = selectedImageDataUrl;
    if (!content && !pendingDataUrl) return;
    if (content.length > 2000) {
      setActionError('Message exceeds 2,000 characters.');
      return;
    }

    const isViewOnce = Boolean(room) && viewOnceMode;
    const disappearAfterMs = disappear24hMode ? DISAPPEAR_24H_MS : null;
    const replyTarget = replyingTo;

    setDraft('');
    clearSelectedImage();
    setReplyingTo(null);
    setViewOnceMode(false);
    emitTypingStop(room, group);
    setUploadingMedia(true);
    setActionError(null);

    const safeReply = replyTarget
      ? {
          id: replyTarget.id,
          senderDisplayName: replyTarget.senderDisplayName,
          content: replyTarget.viewOnce ? 'View-once snap' : replyTarget.content,
          hasImage: Boolean(replyTarget.imageUrl),
          hasAudio: Boolean(replyTarget.audioUrl),
        }
      : null;

    try {
      if (room) {
        await sendMessageToRoom({
          room,
          myUid: currentUser.id,
          content,
          imageUrl: pendingDataUrl,
          replyTo: safeReply,
          viewOnce: isViewOnce,
          disappearAfterMs,
        });
      } else if (group) {
        await sendMessageToGroup({
          group,
          myUid: currentUser.id,
          content,
          imageUrl: pendingDataUrl,
          replyTo: safeReply,
          disappearAfterMs,
        });
      }
      requestAnimationFrame(() => scrollToBottom('smooth'));
    } catch (err) {
      setActionError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Could not send message.',
      );
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleOpenViewOnceSnap(msg: ChatMessage) {
    if (openingSnapId) return;
    setOpeningSnapId(msg.id);
    setActionError(null);
    try {
      const snap = await openAndBurnViewOnceSnap(msg.roomId, msg.id);
      setRevealedSnap({
        senderName: msg.senderDisplayName,
        dataUrl: snap.dataUrl,
        content: snap.content,
      });
    } catch (err) {
      setActionError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Could not open snap.',
      );
    } finally {
      setOpeningSnapId(null);
    }
  }

  function handleComposerSubmit(e: FormEvent) {
    e.preventDefault();
    void submitMessage();
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitMessage();
    }
  }

  function handleDeleteMessage(messageId: string) {
    if (activeRoom) {
      void deleteMessageFromRoom(activeRoom.id, messageId);
    } else if (activeGroup) {
      void deleteGroupMessage(activeGroup.id, messageId);
    }
  }

  function handleToggleReaction(messageId: string, emoji: string) {
    const msg = activeMessages.find((m) => m.id === messageId);
    if (!msg) return;
    if (activeRoom) {
      void toggleMessageReaction(activeRoom, msg, currentUser.id, emoji);
    } else if (activeGroup) {
      void toggleGroupMessageReaction(activeGroup.id, msg, currentUser.id, emoji);
    }
    setOpenReactionMsgId(null);
  }

  async function handleToggleBookmark(msg: ChatMessage) {
    if (msg.viewOnce) return;
    try {
      if (savedMessageIds.has(msg.id)) {
        await removeSavedMessage(currentUser.id, msg.id);
      } else {
        await saveMessageBookmark({
          myUid: currentUser.id,
          roomName: activeConversationName || 'Chat',
          message: msg,
        });
      }
    } catch {
      setActionError('Could not update saved message.');
    }
  }

  async function handleTogglePin(roomId: string) {
    const current = chatPrefsByRoomId[roomId];
    try {
      await upsertChatPref({
        myUid: currentUser.id,
        roomId,
        current,
        patch: { pinned: !(current?.pinned ?? false) },
      });
    } catch {
      setActionError('Could not pin conversation.');
    }
  }

  async function handleSelectTheme(roomId: string, theme: ChatTheme) {
    const current = chatPrefsByRoomId[roomId];
    try {
      await upsertChatPref({
        myUid: currentUser.id,
        roomId,
        current,
        patch: { theme },
      });
    } catch {
      setActionError('Could not save chat theme.');
    }
  }

  function handleStartCall(kind: CallKind) {
    if (!activeRoom || !activeRoom.otherUser) return;
    if (liveCall || outgoingCallRequest) return;
    setOutgoingCallRequest({
      roomId: activeRoom.id,
      callee: activeRoom.otherUser,
      kind,
    });
  }

  function handleScrollMessages() {
    const el = messageScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 80;
    shouldStickToBottomRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);
  }

  async function handleCopyUsername() {
    try {
      await navigator.clipboard.writeText(currentUser.username);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 2000);
    } catch {
      setActionError('Could not copy username.');
    }
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-50 border-r border-slate-200">
      <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-200 px-3.5">
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-slate-900">
            ForVasu
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSavedModalOpen(true)}
            title="Saved Messages"
            aria-label="Saved Messages"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            {savedMessages.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 font-mono text-[10px] font-semibold text-white tabular-nums">
                {savedMessages.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAddFriendOpen(true)}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Add</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200/70 lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <StoriesAndNotesStrip
        currentUser={currentUser}
        friends={myFriendsList}
        stories={stories}
        onOpenFriendChat={(uid) => {
          const rid = myFriendRoomByUserId[uid];
          if (rid) {
            setActiveRoomId(rid);
            setSidebarOpen(false);
          }
        }}
      />

      <div className="px-3 py-2.5 border-b border-slate-200/80">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter friends & groups"
            aria-label="Filter friends and groups"
            className="block w-full min-h-[36px] rounded-lg border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Chats and groups">
        {incomingRequests.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <h2 className="text-xs font-semibold text-slate-500">Add Requests</h2>
              <span className="font-mono text-xs font-semibold text-blue-600 tabular-nums">
                {incomingRequests.length}
              </span>
            </div>
            <ul className="space-y-2">
              {incomingRequests.map((req) => {
                const isBusy = busyRequestId === req.id;
                return (
                  <li key={req.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        name={req.user.displayName}
                        color={req.user.avatarColor}
                        avatarUrl={req.user.avatarUrl}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {req.user.displayName}
                        </p>
                        <p className="truncate font-mono text-xs text-slate-500">
                          @{req.user.username}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleAcceptRequest(req.id)}
                        className="flex-1 min-h-[34px] rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDeclineOrCancelRequest(req.id)}
                        className="min-h-[34px] rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Ignore
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <h2 className="text-xs font-semibold text-slate-500">Friends</h2>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {filteredRooms.length}
            </span>
          </div>

          {filteredRooms.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-600">
              <p className="font-medium text-slate-800">No chats yet</p>
              <p className="mt-1 leading-relaxed text-slate-500">
                Search someone by username or ID and send an add request. Chat opens once they
                accept.
              </p>
              <button
                type="button"
                onClick={() => setAddFriendOpen(true)}
                className="mt-3 inline-flex w-full min-h-[36px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Find by Username</span>
              </button>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filteredRooms.map((room) => {
                const isActive = room.id === activeRoomId;
                const otherUser = room.otherUser;
                const isOnline = otherUser ? onlineUserIds.has(otherUser.id) : false;
                const unread = unreadByRoom[room.id] ?? 0;
                const streak = streakByRoomId[room.id] ?? 0;
                const isPinned = Boolean(chatPrefsByRoomId[room.id]?.pinned);

                return (
                  <li key={room.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRoomId(room.id);
                        setSidebarOpen(false);
                      }}
                      className={`flex w-full min-h-[46px] items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Avatar
                          name={room.name}
                          color={otherUser?.avatarColor || '#1E3A8A'}
                          avatarUrl={otherUser?.avatarUrl}
                          size="sm"
                          showPresence
                          online={isOnline}
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-sm font-medium">{room.name}</span>
                            {isPinned && (
                              <Pin
                                className={`h-3 w-3 shrink-0 ${
                                  isActive ? 'text-blue-100' : 'text-slate-400'
                                }`}
                                aria-label="Pinned"
                              />
                            )}
                          </span>
                          <span
                            className={`block truncate text-xs ${
                              isActive
                                ? 'text-blue-100'
                                : isOnline
                                  ? 'text-emerald-700'
                                  : 'text-slate-400'
                            }`}
                          >
                            {isOnline ? 'Online' : formatLastSeen(otherUser?.lastSeenAt)}
                          </span>
                        </span>
                      </span>

                      <span className="flex items-center gap-1.5 shrink-0">
                        {streak > 0 && (
                          <span
                            title={`${streak}-day chat streak`}
                            className={`inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                              isActive ? 'text-amber-200' : 'text-amber-600'
                            }`}
                          >
                            <Flame className="h-3 w-3" aria-hidden="true" />
                            <span>{streak}</span>
                          </span>
                        )}
                        {unread > 0 && !isActive && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 font-mono text-[11px] font-semibold text-white tabular-nums">
                            {unread}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Friends-Only Group Chats */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <h2 className="text-xs font-semibold text-slate-500">Groups</h2>
            <button
              type="button"
              onClick={() => {
                setEditingGroup(null);
                setGroupModalOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              <span>New</span>
            </button>
          </div>

          {filteredGroups.length === 0 ? (
            <p className="px-2 text-xs text-slate-400">
              {groups.length === 0
                ? 'Create a group with your friends.'
                : 'No matching groups.'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filteredGroups.map((grp) => {
                const isActive = grp.id === activeRoomId;
                const unread = unreadByRoom[grp.id] ?? 0;
                const isPinned = Boolean(chatPrefsByRoomId[grp.id]?.pinned);
                return (
                  <li key={grp.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRoomId(grp.id);
                        setSidebarOpen(false);
                      }}
                      className={`flex w-full min-h-[46px] items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={grp.name} color={grp.avatarColor} size="sm" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-sm font-medium">{grp.name}</span>
                            {isPinned && (
                              <Pin
                                className={`h-3 w-3 shrink-0 ${
                                  isActive ? 'text-blue-100' : 'text-slate-400'
                                }`}
                                aria-label="Pinned"
                              />
                            )}
                          </span>
                          <span
                            className={`block truncate text-xs ${
                              isActive ? 'text-blue-100' : 'text-slate-400'
                            }`}
                          >
                            {grp.memberIds.length} members
                          </span>
                        </span>
                      </span>
                      {unread > 0 && !isActive && (
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 font-mono text-[11px] font-semibold text-white tabular-nums shrink-0">
                          {unread}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {outgoingRequests.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 mb-1.5">
              <h2 className="text-xs font-semibold text-slate-500">Sent Requests</h2>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {outgoingRequests.length}
              </span>
            </div>
            <ul className="space-y-1.5">
              {outgoingRequests.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-900">
                      {req.user.displayName}
                    </p>
                    <p className="truncate font-mono text-[11px] text-slate-500">
                      @{req.user.username} · Pending
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyRequestId === req.id}
                    onClick={() => void handleDeclineOrCancelRequest(req.id)}
                    className="shrink-0 text-xs font-medium text-slate-500 hover:text-red-600"
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      <div className="border-t border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setProfileUserId(currentUser.id)}
              aria-label="Open your profile"
              title="My Profile"
              className="rounded-lg focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
            >
              <Avatar
                name={currentUser.displayName}
                color={currentUser.avatarColor}
                avatarUrl={currentUser.avatarUrl}
                size="md"
                showPresence
                online={true}
              />
            </button>
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setProfileUserId(currentUser.id)}
                className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:text-blue-600"
              >
                {currentUser.displayName}
              </button>
              <button
                type="button"
                onClick={() => void handleCopyUsername()}
                title="Copy your username"
                className="flex items-center gap-1 truncate font-mono text-xs text-slate-500 hover:text-slate-900"
              >
                <span>@{currentUser.username}</span>
                {copiedId ? (
                  <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-3 w-3" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setProfileUserId(currentUser.id)}
              aria-label="My Profile"
              title="My Profile"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              aria-label="Sign out"
              title="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="px-4 py-1.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-[11px] text-slate-400">
          <span>Developers:</span>
          <span className="font-medium text-slate-600">Himanshu &amp; hmxerr</span>
        </div>
      </div>
    </div>
  );

  const hasActiveConversation = Boolean(activeRoom || activeGroup);
  const totalUnreadOtherRooms = useMemo(() => {
    let sum = 0;
    for (const [rid, cnt] of Object.entries(unreadByRoom)) {
      if (rid !== activeRoomId) sum += cnt;
    }
    return sum;
  }, [unreadByRoom, activeRoomId]);

  const activeDmStreak = activeRoom ? (streakByRoomId[activeRoom.id] ?? 0) : 0;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-white text-slate-900">
      <aside className="hidden w-[290px] shrink-0 lg:block">{sidebarContent}</aside>

      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className="relative z-50 h-full w-[296px] max-w-[85vw] shadow-xl"
            >
              {sidebarContent}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 sm:px-4 lg:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open friends, groups and stories"
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
              {incomingRequests.length + totalUnreadOtherRooms > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 font-mono text-[10px] font-semibold text-white tabular-nums">
                  {incomingRequests.length + totalUnreadOtherRooms}
                </span>
              )}
            </button>

            {activeRoom && activeRoom.otherUser ? (
              <button
                type="button"
                onClick={() => setProfileUserId(activeRoom.otherUser!.id)}
                className="flex items-center gap-2.5 min-w-0 rounded-lg py-1 pr-2 text-left hover:bg-slate-50 transition-colors"
                title="View profile"
              >
                <Avatar
                  name={activeRoom.name}
                  color={activeRoom.otherUser.avatarColor}
                  avatarUrl={activeRoom.otherUser.avatarUrl}
                  size="sm"
                  showPresence
                  online={onlineUserIds.has(activeRoom.otherUser.id)}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h1 className="truncate font-display text-base font-semibold text-slate-900">
                      {activeRoom.name}
                    </h1>
                    {activeDmStreak > 0 && (
                      <span
                        title={`${activeDmStreak}-day chat streak`}
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-700"
                      >
                        <Flame className="h-3 w-3 text-amber-600" aria-hidden="true" />
                        <span>{activeDmStreak}d</span>
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    @{activeRoom.otherUser.username} ·{' '}
                    {onlineUserIds.has(activeRoom.otherUser.id)
                      ? 'Online'
                      : formatLastSeen(activeRoom.otherUser.lastSeenAt)}
                  </p>
                </div>
              </button>
            ) : activeGroup ? (
              <button
                type="button"
                onClick={() => {
                  setEditingGroup(activeGroup);
                  setGroupModalOpen(true);
                }}
                className="flex items-center gap-2.5 min-w-0 rounded-lg py-1 pr-2 text-left hover:bg-slate-50 transition-colors"
                title="Group info & members"
              >
                <Avatar name={activeGroup.name} color={activeGroup.avatarColor} size="sm" />
                <div className="min-w-0">
                  <h1 className="truncate font-display text-base font-semibold text-slate-900">
                    {activeGroup.name}
                  </h1>
                  <p className="truncate text-xs text-slate-500">
                    {activeGroup.memberIds.length} members · Friends Group
                  </p>
                </div>
              </button>
            ) : (
              <h1 className="font-display text-base font-semibold text-slate-900">ForVasu</h1>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton />

            {activeRoom?.otherUser && (
              <>
                <button
                  type="button"
                  onClick={() => handleStartCall('audio')}
                  aria-label="Start audio call"
                  title="Audio call"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStartCall('video')}
                  aria-label="Start video call"
                  title="Video call"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                >
                  <Video className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}

            {hasActiveConversation && (
              <button
                type="button"
                onClick={() => {
                  setChatSearchOpen((prev) => !prev);
                  setChatSearchQuery('');
                  setChatSearchCursor(0);
                }}
                aria-label="Search messages in this chat"
                title="Search chat"
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                  chatSearchOpen
                    ? 'border-blue-300 bg-blue-50 text-blue-600'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Search className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setSoundMuted((prev) => !prev)}
              aria-label={soundMuted ? 'Unmute notification sound' : 'Mute notification sound'}
              title={soundMuted ? 'Sound muted' : 'Sound on'}
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              {soundMuted ? (
                <VolumeX className="h-4 w-4 text-slate-400" aria-hidden="true" />
              ) : (
                <Volume2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
              )}
            </button>

            {hasActiveConversation && activeRoomId && (
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setHeaderMenuOpen((prev) => !prev)}
                  aria-label="Conversation options"
                  aria-expanded={headerMenuOpen}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </button>

                <AnimatePresence>
                  {headerMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.94, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute right-0 top-11 z-30 w-60 origin-top-right rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
                    >
                      <div className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-2">
                          <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Chat Theme</span>
                        </div>
                        <div className="grid grid-cols-6 gap-1.5">
                          {THEME_KEYS.map((key) => {
                            const themeItem = CHAT_THEMES[key];
                            const selected = activeThemeKey === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                title={themeItem.label}
                                aria-label={`Theme ${themeItem.label}`}
                                onClick={() => void handleSelectTheme(activeRoomId, key)}
                                className={`h-7 w-7 rounded-lg border transition-transform hover:scale-105 ${
                                  selected
                                    ? 'ring-2 ring-blue-600 ring-offset-1 border-blue-600'
                                    : 'border-slate-300'
                                }`}
                                style={{ backgroundColor: themeItem.swatch }}
                              />
                            );
                          })}
                        </div>
                      </div>

                      <div className="my-1.5 h-px bg-slate-100" />

                      <button
                        type="button"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          void handleTogglePin(activeRoomId);
                        }}
                        className="flex w-full min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {activePref?.pinned ? (
                          <>
                            <PinOff className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                            <span>Unpin Chat</span>
                          </>
                        ) : (
                          <>
                            <Pin className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                            <span>Pin Chat to Top</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setConfirmAction({
                            type: 'clear_chat',
                            roomId: activeRoomId,
                            roomName: activeConversationName,
                          });
                        }}
                        className="flex w-full min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Eraser className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                        <span>Clear Chat History</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setSavedModalOpen(true);
                        }}
                        className="flex w-full min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Bookmark className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                        <span>Saved Messages ({savedMessages.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setSoundMuted((prev) => !prev);
                        }}
                        className="flex sm:hidden w-full min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {soundMuted ? (
                          <VolumeX className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                        ) : (
                          <Volume2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                        )}
                        <span>{soundMuted ? 'Unmute Sounds' : 'Mute Sounds'}</span>
                      </button>

                      {activeGroup && (
                        <>
                          <div className="my-1.5 h-px bg-slate-100" />
                          <button
                            type="button"
                            onClick={() => {
                              setHeaderMenuOpen(false);
                              setEditingGroup(activeGroup);
                              setGroupModalOpen(true);
                            }}
                            className="flex w-full min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Users className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                            <span>Group Info &amp; Members</span>
                          </button>
                        </>
                      )}

                      {activeRoom?.otherUser && (
                        <>
                          <div className="my-1.5 h-px bg-slate-100" />
                          <button
                            type="button"
                            onClick={() => {
                              setHeaderMenuOpen(false);
                              setProfileUserId(activeRoom.otherUser!.id);
                            }}
                            className="flex w-full min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <User className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                            <span>View Profile</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHeaderMenuOpen(false);
                              setConfirmAction({
                                type: 'unfriend',
                                user: activeRoom.otherUser!,
                              });
                            }}
                            className="flex w-full min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <UserMinus className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                            <span>Unfriend</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHeaderMenuOpen(false);
                              setConfirmAction({ type: 'block', user: activeRoom.otherUser! });
                            }}
                            className="flex w-full min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Block User</span>
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </header>

        {/* In-Chat Search Strip */}
        <AnimatePresence>
          {chatSearchOpen && hasActiveConversation && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-slate-200 bg-slate-50 px-4 py-2"
            >
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  autoFocus
                  value={chatSearchQuery}
                  onChange={(e) => {
                    setChatSearchQuery(e.target.value);
                    setChatSearchCursor(0);
                  }}
                  placeholder="Search messages in this conversation..."
                  aria-label="Search messages"
                  className="min-h-[36px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
                {chatSearchQuery.trim() && (
                  <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
                    {matchedMessageIds.length === 0
                      ? '0 matches'
                      : `${(chatSearchCursor % matchedMessageIds.length) + 1}/${matchedMessageIds.length}`}
                  </span>
                )}
                <button
                  type="button"
                  disabled={matchedMessageIds.length === 0}
                  onClick={() =>
                    setChatSearchCursor((c) =>
                      matchedMessageIds.length === 0
                        ? 0
                        : (c - 1 + matchedMessageIds.length) % matchedMessageIds.length,
                    )
                  }
                  aria-label="Previous match"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={matchedMessageIds.length === 0}
                  onClick={() =>
                    setChatSearchCursor((c) =>
                      matchedMessageIds.length === 0 ? 0 : (c + 1) % matchedMessageIds.length,
                    )
                  }
                  aria-label="Next match"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChatSearchOpen(false);
                    setChatSearchQuery('');
                  }}
                  aria-label="Close message search"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {actionError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700"
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              aria-label="Dismiss error"
              className="text-red-500 hover:text-red-800"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {bootstrapLoading ? (
          <div className="flex-1 p-6 space-y-4">
            <div className="h-12 w-2/3 rounded-lg bg-slate-100" />
            <div className="h-12 w-1/2 rounded-lg bg-slate-100" />
            <div className="h-12 w-3/4 rounded-lg bg-slate-100" />
          </div>
        ) : bootstrapError ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-slate-900">{bootstrapError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 min-h-[40px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : !hasActiveConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-blue-600">
              <UserPlus className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              Search a user ID to start chatting
            </h2>
            <p className="mt-1.5 max-w-sm text-sm text-slate-500">
              Send an add request using a friend&apos;s username or user ID. Once they accept, your
              direct chat opens automatically.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setAddFriendOpen(true)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Find User by ID</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopyUsername()}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {copiedId ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    <span>Copied @{currentUser.username}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    <span>Share @{currentUser.username}</span>
                  </>
                )}
              </button>
            </div>

            {incomingRequests.length > 0 && (
              <div className="mt-8 w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
                <h3 className="text-xs font-semibold text-slate-600">
                  Pending Add Requests ({incomingRequests.length})
                </h3>
                <ul className="mt-3 space-y-2">
                  {incomingRequests.map((req) => (
                    <li
                      key={req.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar
                          name={req.user.displayName}
                          color={req.user.avatarColor}
                          avatarUrl={req.user.avatarUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {req.user.displayName}
                          </p>
                          <p className="truncate font-mono text-xs text-slate-500">
                            @{req.user.username}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busyRequestId === req.id}
                          onClick={() => void handleAcceptRequest(req.id)}
                          className="min-h-[34px] rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={busyRequestId === req.id}
                          onClick={() => void handleDeclineOrCancelRequest(req.id)}
                          aria-label="Ignore request"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className={`relative flex-1 overflow-hidden transition-colors ${activeTheme.bgClass}`}>
              <div
                ref={messageScrollRef}
                onScroll={handleScrollMessages}
                className="h-full overflow-y-auto px-4 py-5 lg:px-6"
              >
                {loadingRoomId === activeRoomId && activeMessages.length === 0 ? (
                  <div className="space-y-4">
                    <div className="h-10 w-64 rounded-lg bg-slate-200/50" />
                    <div className="h-10 w-80 rounded-lg bg-slate-200/50" />
                  </div>
                ) : activeMessages.length === 0 ? (
                  <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
                    <Avatar
                      name={activeConversationName}
                      color={
                        activeRoom?.otherUser?.avatarColor ||
                        activeGroup?.avatarColor ||
                        '#1E3A8A'
                      }
                      avatarUrl={activeRoom?.otherUser?.avatarUrl}
                      size="lg"
                    />
                    <h2 className={`mt-3 text-base font-semibold ${activeTheme.textClass}`}>
                      Say hello to {activeConversationName}
                    </h2>
                    <p className={`mt-1 max-w-sm text-sm ${activeTheme.mutedClass}`}>
                      {activeGroup
                        ? 'Send a message, photo, or voice note to start your group chat.'
                        : 'Send a message, photo, snap, or voice note below to start your conversation.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {activeMessages.map((msg, index) => {
                      const prev = index > 0 ? activeMessages[index - 1] : null;
                      const showDateDivider =
                        !prev ||
                        new Date(prev.createdAt).toDateString() !==
                          new Date(msg.createdAt).toDateString();

                      const isGrouped =
                        !showDateDivider &&
                        prev !== null &&
                        prev.senderId === msg.senderId &&
                        msg.createdAt - prev.createdAt < 5 * 60 * 1000;

                      const isOwn = msg.senderId === currentUser.id;
                      const reactions = msg.reactions ?? [];
                      const isBookmarked = savedMessageIds.has(msg.id);
                      const isSearchMatch = matchedSet.has(msg.id);
                      const isFocusedMatch = focusedMatchId === msg.id;

                      return (
                        <motion.div
                          key={msg.id}
                          ref={(el) => {
                            messageRowRefs.current[msg.id] = el;
                          }}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        >
                          {showDateDivider && (
                            <div className="my-5 flex items-center gap-3">
                              <div className={`h-px flex-1 ${activeTheme.dividerClass}`} />
                              <span className={`text-xs font-medium ${activeTheme.mutedClass}`}>
                                {formatDateHeading(msg.createdAt)}
                              </span>
                              <div className={`h-px flex-1 ${activeTheme.dividerClass}`} />
                            </div>
                          )}

                          <div
                            className={`group relative flex items-end gap-2 px-2 py-1 transition-colors ${
                              isOwn ? 'justify-end' : 'justify-start'
                            } ${activeTheme.hoverClass} ${isGrouped ? 'mt-0' : 'mt-3'} ${
                              msg.pending ? 'opacity-65' : ''
                            } ${
                              isFocusedMatch
                                ? activeTheme.isDark
                                  ? 'ring-2 ring-amber-400 bg-amber-500/20'
                                  : 'ring-2 ring-amber-400 bg-amber-50'
                                : isSearchMatch
                                  ? activeTheme.isDark
                                    ? 'bg-amber-500/10'
                                    : 'bg-amber-50/60'
                                  : ''
                            }`}
                          >
                            {!isOwn && (
                              <div className="shrink-0 pb-0.5">
                                {isGrouped ? (
                                  <div className={`w-9 text-right font-mono text-[11px] opacity-0 group-hover:opacity-100 tabular-nums select-none ${activeTheme.mutedClass}`}>
                                    {formatMessageTime(msg.createdAt)}
                                  </div>
                                ) : (
                                  <Avatar
                                    name={msg.senderDisplayName}
                                    color={msg.senderColor}
                                    avatarUrl={msg.senderAvatarUrl}
                                    size="md"
                                  />
                                )}
                              </div>
                            )}

                            {isOwn && !msg.pending && (
                              <div
                                className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity order-first"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenReactionMsgId((curr) =>
                                        curr === msg.id ? null : msg.id,
                                      )
                                    }
                                    aria-label="React to message"
                                    title="React"
                                    className={`flex h-8 w-8 items-center justify-center rounded-md ${
                                      activeTheme.isDark
                                        ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                        : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700'
                                    }`}
                                  >
                                    <SmilePlus className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>

                                  <AnimatePresence>
                                    {openReactionMsgId === msg.id && (
                                      <motion.div
                                        initial={{ opacity: 0, scale: 0.9, y: -4 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                                        className="absolute left-0 top-9 z-20 flex origin-top-left items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
                                      >
                                        {REACTION_EMOJIS.map((emoji) => (
                                          <motion.button
                                            key={emoji}
                                            type="button"
                                            whileTap={{ scale: 0.85 }}
                                            whileHover={{ scale: 1.15 }}
                                            onClick={() => handleToggleReaction(msg.id, emoji)}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-base hover:bg-slate-100 transition-colors"
                                          >
                                            {emoji}
                                          </motion.button>
                                        ))}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setReplyingTo(msg)}
                                  aria-label="Reply to message"
                                  title="Reply"
                                  className={`flex h-8 w-8 items-center justify-center rounded-md ${
                                    activeTheme.isDark
                                      ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                      : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700'
                                  }`}
                                >
                                  <Reply className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>

                                {!msg.viewOnce && (
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleBookmark(msg)}
                                    aria-label={isBookmarked ? 'Remove bookmark' : 'Save message'}
                                    title={isBookmarked ? 'Saved' : 'Save message'}
                                    className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                                      isBookmarked
                                        ? 'text-amber-500 hover:bg-amber-500/15'
                                        : activeTheme.isDark
                                          ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                          : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700'
                                    }`}
                                  >
                                    <Bookmark
                                      className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-current' : ''}`}
                                      aria-hidden="true"
                                    />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  aria-label="Delete message"
                                  title="Delete message"
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-500/15 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            )}

                            <div
                              className={`relative rounded-2xl px-4 py-2.5 max-w-[82%] sm:max-w-md shadow-sm ${
                                isOwn
                                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-xs'
                                  : activeTheme.isDark
                                    ? 'bg-slate-800 text-slate-100 rounded-tl-xs border border-slate-700'
                                    : 'bg-slate-100 text-slate-900 rounded-tl-xs border border-slate-200/60'
                              }`}
                            >
                              {!isGrouped && !isOwn && (
                                <div className="mb-1 flex flex-wrap items-baseline gap-2">
                                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                    {msg.senderDisplayName}
                                  </span>
                                  <span className={`font-mono text-[11px] ${activeTheme.mutedClass}`}>
                                    @{msg.senderName}
                                  </span>
                                </div>
                              )}

                              {msg.replyTo && (
                                <div
                                  className={`mb-1.5 rounded-lg border-l-2 px-2.5 py-1 text-xs ${
                                    isOwn
                                      ? 'border-white/80 bg-white/10 text-white/90'
                                      : activeTheme.replyClass
                                  }`}
                                >
                                  <span className="font-semibold">
                                    {msg.replyTo.senderDisplayName}:{' '}
                                  </span>
                                  <span className="line-clamp-1">
                                    {msg.replyTo.content ||
                                      (msg.replyTo.hasImage
                                        ? 'Photo'
                                        : msg.replyTo.hasAudio
                                          ? 'Voice note'
                                          : 'Message')}
                                  </span>
                                </div>
                              )}

                              {msg.viewOnce ? (
                                <div className="my-1">
                                  {msg.viewOnceConsumed ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/40 bg-black/10 px-3 py-1.5 text-xs font-medium opacity-80">
                                      <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>Opened snap</span>
                                    </span>
                                  ) : isOwn ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white">
                                      <Flame className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                                      <span>View-once snap sent</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={openingSnapId === msg.id}
                                      onClick={() => void handleOpenViewOnceSnap(msg)}
                                      className="inline-flex min-h-[36px] items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60 transition-colors shadow-sm"
                                    >
                                      <Flame className="h-4 w-4" aria-hidden="true" />
                                      <span>
                                        {openingSnapId === msg.id ? 'Opening...' : 'Tap to view once'}
                                      </span>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <>
                                  {msg.content && (
                                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                                      {msg.content}
                                    </p>
                                  )}

                                  {msg.imageUrl &&
                                    (msg.imageUrl.startsWith('/api/uploads/') ||
                                      msg.imageUrl.startsWith('data:image/')) && (
                                      <div className={msg.content ? 'mt-2' : 'mt-1'}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!msg.pending && msg.imageUrl) {
                                              setLightboxImageUrl(msg.imageUrl);
                                            }
                                          }}
                                          className="block overflow-hidden rounded-xl border border-white/20 bg-black/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                                        >
                                          <img
                                            src={msg.imageUrl}
                                            alt={`Shared by ${msg.senderDisplayName}`}
                                            referrerPolicy="no-referrer"
                                            className="max-h-72 w-auto max-w-[260px] sm:max-w-xs object-cover"
                                          />
                                        </button>
                                      </div>
                                    )}

                                  {msg.audioUrl &&
                                    (msg.audioUrl.startsWith('/api/uploads/') ||
                                      msg.audioUrl.startsWith('data:audio/')) && (
                                      <div className={`mt-1.5 flex items-center gap-2.5 rounded-xl px-3 py-2 max-w-xs ${isOwn ? 'bg-white/10 border border-white/20 text-white' : 'bg-slate-50 border border-slate-200 text-slate-900'}`}>
                                        <audio
                                          controls
                                          preload="metadata"
                                          src={msg.audioUrl}
                                          className="h-8 w-full"
                                        />
                                        {msg.audioDurationMs && (
                                          <span className="shrink-0 font-mono text-[11px] opacity-80 tabular-nums">
                                            {formatDuration(msg.audioDurationMs)}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                </>
                              )}

                              {reactions.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {reactions.map((r) => {
                                    const reactedByMe = r.userIds.includes(currentUser.id);
                                    return (
                                      <motion.button
                                        key={r.emoji}
                                        type="button"
                                        whileTap={{ scale: 0.92 }}
                                        onClick={() => handleToggleReaction(msg.id, r.emoji)}
                                        className={`inline-flex min-h-[26px] items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium transition-colors ${
                                          reactedByMe
                                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                                            : 'border-slate-200 bg-white text-slate-700'
                                        }`}
                                      >
                                        <span>{r.emoji}</span>
                                        <span className="font-mono text-[11px] tabular-nums">
                                          {r.userIds.length}
                                        </span>
                                      </motion.button>
                                    );
                                  })}
                                </div>
                              )}

                              <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${isOwn ? 'text-blue-100' : activeTheme.mutedClass}`}>
                                <span className="font-mono tabular-nums">{formatMessageTime(msg.createdAt)}</span>
                                {msg.expiresAt && (
                                  <span title="Disappears after 24h" className="inline-flex items-center gap-0.5">
                                    <Timer className="h-3 w-3" aria-hidden="true" />
                                  </span>
                                )}
                                {activeRoom && isOwn && !msg.pending && (
                                  <span className="inline-flex items-center">
                                    {msg.seenAt ? (
                                      <span title="Seen">
                                        <CheckCheck className="h-3.5 w-3.5 text-blue-200" aria-hidden="true" />
                                      </span>
                                    ) : msg.deliveredAt ? (
                                      <span title="Delivered">
                                        <CheckCheck className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
                                      </span>
                                    ) : (
                                      <span title="Sent">
                                        <Check className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>

                            {!isOwn && !msg.pending && (
                              <div
                                className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenReactionMsgId((curr) =>
                                        curr === msg.id ? null : msg.id,
                                      )
                                    }
                                    aria-label="React to message"
                                    title="React"
                                    className={`flex h-8 w-8 items-center justify-center rounded-md ${
                                      activeTheme.isDark
                                        ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                        : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700'
                                    }`}
                                  >
                                    <SmilePlus className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>

                                  <AnimatePresence>
                                    {openReactionMsgId === msg.id && (
                                      <motion.div
                                        initial={{ opacity: 0, scale: 0.9, y: -4 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                                        className="absolute right-0 top-9 z-20 flex origin-top-right items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
                                      >
                                        {REACTION_EMOJIS.map((emoji) => (
                                          <motion.button
                                            key={emoji}
                                            type="button"
                                            whileTap={{ scale: 0.85 }}
                                            whileHover={{ scale: 1.15 }}
                                            onClick={() => handleToggleReaction(msg.id, emoji)}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-base hover:bg-slate-100 transition-colors"
                                          >
                                            {emoji}
                                          </motion.button>
                                        ))}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setReplyingTo(msg)}
                                  aria-label="Reply to message"
                                  title="Reply"
                                  className={`flex h-8 w-8 items-center justify-center rounded-md ${
                                    activeTheme.isDark
                                      ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                      : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700'
                                  }`}
                                >
                                  <Reply className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>

                                {!msg.viewOnce && (
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleBookmark(msg)}
                                    aria-label={isBookmarked ? 'Remove bookmark' : 'Save message'}
                                    title={isBookmarked ? 'Saved' : 'Save message'}
                                    className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                                      isBookmarked
                                        ? 'text-amber-500 hover:bg-amber-500/15'
                                        : activeTheme.isDark
                                          ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                          : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700'
                                    }`}
                                  >
                                    <Bookmark
                                      className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-current' : ''}`}
                                      aria-hidden="true"
                                    />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              <AnimatePresence>
                {showJumpToBottom && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ duration: 0.16 }}
                    onClick={() => scrollToBottom('smooth')}
                    className="absolute right-6 bottom-4 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Jump to latest</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white px-4 pt-2 pb-4 lg:px-6">
              <div className="mb-1.5 flex items-center justify-between gap-2 min-h-[20px]">
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  {activeTypers.length > 0 && (
                    <>
                      <span className="font-medium text-blue-600">{activeTypers[0]} is typing</span>
                      <div className="flex items-center gap-0.5">
                        <motion.span animate={{ scaleY: [1, 2.2, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="h-2.5 w-1 rounded-full bg-blue-600 inline-block" />
                        <motion.span animate={{ scaleY: [1, 2.2, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.15 }} className="h-2.5 w-1 rounded-full bg-blue-600 inline-block" />
                        <motion.span animate={{ scaleY: [1, 2.2, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.3 }} className="h-2.5 w-1 rounded-full bg-blue-600 inline-block" />
                        <motion.span animate={{ scaleY: [1, 2.2, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.45 }} className="h-2.5 w-1 rounded-full bg-blue-600 inline-block" />
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {activeRoom && (
                    <button
                      type="button"
                      disabled={isRecording}
                      onClick={() => setViewOnceMode((prev) => !prev)}
                      title="Send as view-once snap"
                      className={`inline-flex min-h-[28px] items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                        viewOnceMode
                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Flame className="h-3 w-3" aria-hidden="true" />
                      <span>View once</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDisappear24hMode((prev) => !prev)}
                    title="Auto-delete after 24 hours"
                    className={`inline-flex min-h-[28px] items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      disappear24hMode
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Timer className="h-3 w-3" aria-hidden="true" />
                    <span>24h timer</span>
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {replyingTo && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-blue-900">
                        Replying to {replyingTo.senderDisplayName}
                      </p>
                      <p className="truncate text-xs text-blue-700">
                        {replyingTo.viewOnce
                          ? 'View-once snap'
                          : replyingTo.content ||
                            (replyingTo.imageUrl
                              ? 'Photo'
                              : replyingTo.audioUrl
                                ? 'Voice note'
                                : 'Message')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      aria-label="Cancel reply"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-100"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {selectedImageDataUrl && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2"
                  >
                    <img
                      src={selectedImageDataUrl}
                      alt={selectedImageName || 'Selected image preview'}
                      className="h-14 w-14 rounded-lg border border-slate-200 object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-800">
                        {selectedImageName || 'Image ready to send'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {viewOnceMode
                          ? 'Will disappear right after being viewed once'
                          : 'Add a caption or press Send'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearSelectedImage}
                      aria-label="Remove image"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {isRecording ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden="true" />
                    <span className="text-xs font-semibold text-red-900">Recording voice note</span>
                    <span className="font-mono text-xs font-medium text-red-700 tabular-nums">
                      {formatDuration(recordingMs)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => stopRecordingCleanup(true)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Cancel</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => stopRecordingCleanup(false)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Square className="h-3 w-3 fill-current" aria-hidden="true" />
                      <span>Send Note</span>
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleComposerSubmit}
                  className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/15"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={!hasActiveConversation || uploadingMedia}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach image"
                    title="Send image"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45 transition-colors"
                  >
                    <ImagePlus className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={!hasActiveConversation || uploadingMedia || Boolean(selectedImageDataUrl)}
                    onClick={() => void startVoiceRecording()}
                    aria-label="Record voice note"
                    title="Record voice note"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45 transition-colors"
                  >
                    <Mic className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <textarea
                    rows={1}
                    maxLength={2000}
                    value={draft}
                    onChange={(e) => handleDraftChange(e.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    onPaste={handleComposerPaste}
                    disabled={!hasActiveConversation}
                    placeholder={
                      viewOnceMode && activeRoom
                        ? `Send a view-once snap to ${activeConversationName}`
                        : `Message ${activeConversationName}`
                    }
                    aria-label="Message input"
                    className="max-h-36 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    {draft.length > 1500 && (
                      <span className="font-mono text-xs text-slate-400 tabular-nums">
                        {draft.length}/2000
                      </span>
                    )}
                    <button
                      type="submit"
                      disabled={
                        !hasActiveConversation ||
                        uploadingMedia ||
                        (!draft.trim() && !selectedImageDataUrl)
                      }
                      aria-label="Send message"
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45 transition-colors whitespace-nowrap"
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{uploadingMedia ? 'Sending...' : 'Send'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}
      </div>

      <AddFriendModal
        open={addFriendOpen}
        currentUser={currentUser}
        rooms={rooms}
        incomingRequests={incomingRequests}
        outgoingRequests={outgoingRequests}
        blockedUsers={blockedUsers}
        onClose={() => setAddFriendOpen(false)}
        onAcceptRequest={handleAcceptRequest}
        onOpenChat={(roomId) => {
          setActiveRoomId(roomId);
          setSidebarOpen(false);
        }}
        onViewProfile={(userId) => {
          setProfileUserId(userId);
        }}
      />

      <ProfileModal
        targetUserId={profileUserId}
        currentUser={currentUser}
        rooms={rooms}
        incomingRequests={incomingRequests}
        outgoingRequests={outgoingRequests}
        blockedUsers={blockedUsers}
        onlineUserIds={onlineUserIds}
        myFriendRoomByUserId={myFriendRoomByUserId}
        onClose={() => setProfileUserId(null)}
        onSelectProfile={(userId) => setProfileUserId(userId)}
        onOpenChat={(roomId) => {
          setActiveRoomId(roomId);
          setSidebarOpen(false);
        }}
        onOpenImage={(imageUrl) => setLightboxImageUrl(imageUrl)}
        onUserUpdated={onUserUpdated}
        onUnblocked={(targetUserId) => {
          setBlockedUsers((prev) => prev.filter((u) => u.id !== targetUserId));
        }}
        onAcceptRequest={handleAcceptRequest}
        onFriendAdded={(_targetUser, status, _requestId, acceptedRoom) => {
          if (status === 'accepted' && acceptedRoom) {
            setActiveRoomId(acceptedRoom.id);
            setSidebarOpen(false);
          }
        }}
      />

      <CreateGroupModal
        open={groupModalOpen}
        editingGroup={editingGroup}
        currentUser={currentUser}
        friends={myFriendsList}
        onClose={() => setGroupModalOpen(false)}
        onGroupSelected={(groupId) => {
          if (groupId) {
            setActiveRoomId(groupId);
            setSidebarOpen(false);
          } else {
            setActiveRoomId(rawRooms[0]?.id ?? null);
          }
        }}
      />

      <SavedMessagesModal
        open={savedModalOpen}
        myUid={currentUser.id}
        items={savedMessages}
        onClose={() => setSavedModalOpen(false)}
        onJumpToRoom={(roomId) => {
          setActiveRoomId(roomId);
          setSidebarOpen(false);
        }}
        onOpenImage={(imageUrl) => setLightboxImageUrl(imageUrl)}
      />

      <CallModal
        currentUser={currentUser}
        liveCall={liveCall}
        outgoingRequest={outgoingCallRequest}
        peerUser={callPeerUser}
        soundMuted={soundMuted}
        onDismiss={() => {
          if (liveCall) {
            setDismissedCallIds((prev) => new Set(prev).add(liveCall.id));
          }
          setOutgoingCallRequest(null);
        }}
      />

      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] px-4"
            onClick={() => setShowLogoutConfirm(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="logout-confirm-title" className="text-base font-semibold text-slate-900">
                    Are you sure you want to log out?
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ForVasu
                  </p>
                </div>
              </div>

              <p className="mt-3.5 text-sm text-slate-600 leading-relaxed">
                Aapka active session logout ho jayega. Dobara baat karne ke liye aapko sign in karna hoga.
              </p>

              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    onSignOut();
                  }}
                  className="min-h-[38px] rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition-colors"
                >
                  Yes, Log Out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] px-4"
            onClick={() => setConfirmAction(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-friend-action-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="confirm-friend-action-title" className="text-base font-semibold text-slate-900">
                {confirmAction.type === 'clear_chat'
                  ? `Clear chat with ${confirmAction.roomName || 'this chat'}?`
                  : confirmAction.type === 'block'
                    ? `Block ${confirmAction.user?.displayName}?`
                    : `Unfriend ${confirmAction.user?.displayName}?`}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {confirmAction.type === 'clear_chat'
                  ? 'This hides all earlier messages for you only. New messages will continue to appear normally.'
                  : confirmAction.type === 'block'
                    ? `Blocking @${confirmAction.user?.username} removes your chat and prevents them from finding or messaging you until you unblock them.`
                    : `Unfriending @${confirmAction.user?.username} removes them from your Friends list. You can send an add request again later.`}
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={processingFriendAction}
                  onClick={() => setConfirmAction(null)}
                  className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={processingFriendAction}
                  onClick={() => void executeConfirmAction()}
                  className={`min-h-[38px] rounded-xl px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${
                    confirmAction.type === 'block' || confirmAction.type === 'clear_chat'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {processingFriendAction
                    ? 'Updating...'
                    : confirmAction.type === 'clear_chat'
                      ? 'Clear for Me'
                      : confirmAction.type === 'block'
                        ? 'Block User'
                        : 'Unfriend'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {revealedSnap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-[2px] p-4"
            onClick={() => setRevealedSnap(null)}
            role="dialog"
            aria-modal="true"
            aria-label="View-once snap"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  <span className="text-sm font-semibold">
                    View-once snap from {revealedSnap.senderName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRevealedSnap(null)}
                  aria-label="Close snap"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {revealedSnap.dataUrl && (
                <img
                  src={revealedSnap.dataUrl}
                  alt={`View-once snap from ${revealedSnap.senderName}`}
                  className="mx-auto max-h-[65dvh] max-w-full rounded-xl object-contain"
                />
              )}
              {revealedSnap.content && (
                <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-white/10 p-3 text-sm text-slate-100">
                  {revealedSnap.content}
                </p>
              )}
              <p className="mt-3 text-center text-xs text-slate-400">
                This snap has been burned from the server and cannot be reopened.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightboxImageUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-[2px] p-4"
            onClick={() => setLightboxImageUrl(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              className="relative max-h-[90dvh] max-w-4xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-end gap-2">
                <a
                  href={lightboxImageUrl}
                  download
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxImageUrl(null)}
                  aria-label="Close image preview"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <img
                src={lightboxImageUrl}
                alt="Full size attachment"
                referrerPolicy="no-referrer"
                className="max-h-[80dvh] max-w-full rounded-xl object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
