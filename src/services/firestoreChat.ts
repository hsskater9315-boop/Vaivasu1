import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '../firebase';
import { supabase } from '../supabase';
import type { Unsubscribe } from 'firebase/firestore';
import type {
  CallKind,
  CallSession,
  CallStatus,
  ChatMessage,
  ChatPref,
  ChatTheme,
  FriendRequestItem,
  GroupChat,
  MessageReaction,
  PublicUser,
  RelationshipStatus,
  ReplySnippet,
  Room,
  SavedMessageItem,
  SdpPayload,
  SharedProfileImage,
  StoryItem,
  StoryViewItem,
  UserProfileData,
  UserSearchResult,
} from '../types/chat';

export const ALLOWED_REACTION_EMOJIS = ['❤️', '😂', '👍', '🔥', '😮', '😢'] as const;
export const MAX_MEDIA_DATA_URL_LENGTH = 680_000;
export const MAX_AVATAR_DATA_URL_LENGTH = 115_000;
export const SYNTHETIC_EMAIL_DOMAIN = 'users.forvasu.app';

const AVATAR_PALETTE = [
  '#2563EB',
  '#0F766E',
  '#7C3AED',
  '#DB2777',
  '#EA580C',
  '#059669',
  '#4F46E5',
  '#0284C7',
];

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function getPairInfo(uid1: string, uid2: string): {
  pairId: string;
  userA: string;
  userB: string;
} {
  const [userA, userB] = uid1 < uid2 ? [uid1, uid2] : [uid2, uid1];
  return { pairId: `${userA}__${userB}`, userA, userB };
}

export function validateUsernameInput(raw: string): { valid: boolean; clean: string; error?: string } {
  const clean = raw.trim().replace(/^@+/, '');
  if (clean.length < 3 || clean.length > 24) {
    return { valid: false, clean, error: 'Username must be 3 to 24 characters.' };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(clean)) {
    return {
      valid: false,
      clean,
      error: 'Username can only use letters, numbers, dots, underscores, or hyphens.',
    };
  }
  return { valid: true, clean };
}

export function suggestUsername(displayName?: string | null, email?: string | null): string {
  const raw = (displayName || email?.split('@')[0] || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 18);
  const base = raw.length >= 3 ? raw : `user_${raw || 'chat'}`;
  const suffix = Math.floor(10 + Math.random() * 89);
  return `${base.slice(0, 21)}${suffix}`;
}

export function usernameToSyntheticEmail(rawUsername: string): string {
  const check = validateUsernameInput(rawUsername);
  if (!check.valid) {
    throw new Error(check.error || 'Invalid username.');
  }
  return `${check.clean.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const msg = error instanceof Error ? error.message : '';

  if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
    return 'Enable Email/Password sign-in in Firebase Console (Authentication -> Sign-in method) to use username & password login.';
  }
  if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
    return 'That username is already registered. Try logging in instead.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    msg.includes('invalid-credential')
  ) {
    return 'Invalid username or password. If you signed up with Google, use Continue with Google below.';
  }
  if (code === 'auth/weak-password' || msg.includes('weak-password')) {
    return 'Password must be at least 6 characters.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error. Please check your internet connection.';
  }
  if (msg && !msg.startsWith('{')) {
    return msg;
  }
  return 'Authentication failed. Please try again.';
}

export function isDeveloperUser(identifier?: string | null): boolean {
  if (!identifier) return false;
  const s = String(identifier).toLowerCase();
  return (
    s.includes('hsskater9315@gmail.com') ||
    s.includes('himanshu') ||
    s.includes('hmxerr') ||
    s === 'himanshu' ||
    s === 'hmxerr'
  );
}

function mapPublicUserRow(data: Record<string, unknown>): PublicUser {
  const lastSeenAtMs = Number(data.last_seen_at || Date.now());
  const isOnline = Boolean(data.online) && Date.now() - lastSeenAtMs < 2 * 60 * 1000;
  const username = String(data.username || '');
  const id = String(data.id || '');
  const isDev = isDeveloperUser(username) || isDeveloperUser(id);
  return {
    id,
    username,
    displayName: String(data.display_name || username || 'User'),
    avatarColor: String(data.avatar_color || '#2563EB'),
    avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : null,
    bio: typeof data.bio === 'string' ? data.bio : '',
    statusNote: typeof data.status_note === 'string' ? data.status_note : '',
    statusNoteExpiresAtMs: Number(data.status_note_expires_at || 0),
    friendsCount: Number(data.friends_count || 0),
    online: isOnline,
    lastSeenAt: lastSeenAtMs,
    createdAt: data.created_at ? new Date(String(data.created_at)).getTime() : Date.now(),
    isVerified: isDev,
    isAdmin: isDev,
  };
}

export async function fetchPublicUser(uid: string): Promise<PublicUser | null> {
  try {
    const { data, error } = await supabase
      .from('public_users')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (error || !data) return null;
    return mapPublicUserRow(data);
  } catch {
    return null;
  }
}

export async function isUsernameAvailable(rawUsername: string): Promise<boolean> {
  const lower = rawUsername.trim().replace(/^@+/, '').toLowerCase();
  if (!lower) return false;
  try {
    const { data } = await supabase
      .from('public_users')
      .select('id')
      .eq('username_lower', lower)
      .maybeSingle();
    return !data;
  } catch {
    return true;
  }
}

export async function claimUsernameAndCreateProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  username: string;
}): Promise<PublicUser> {
  const check = validateUsernameInput(params.username);
  if (!check.valid) {
    throw new Error(check.error || 'Invalid username.');
  }
  const username = check.clean;
  const usernameLower = username.toLowerCase();
  const cleanDisplayName = params.displayName.trim().slice(0, 32);
  const safeDisplayName = cleanDisplayName.length >= 2 ? cleanDisplayName : username;
  const avatarColor = pickAvatarColor(params.uid);
  const now = Date.now();

  try {
    const { data: existingUser } = await supabase
      .from('public_users')
      .select('id')
      .eq('username_lower', usernameLower)
      .maybeSingle();

    if (existingUser && existingUser.id !== params.uid) {
      throw new Error('That username is already taken. Try another one.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already taken')) {
      throw err;
    }
  }

  // Attempt usernames_claim insert gracefully without blocking signup
  try {
    await supabase.from('usernames_claim').insert({
      username_lower: usernameLower,
      uid: params.uid,
      username,
    });
  } catch {
    // Ignore usernames_claim permission/redundancy issues
  }

  const isDev = isDeveloperUser(username) || isDeveloperUser(params.email) || isDeveloperUser(params.uid);
  const profileRow = {
    id: params.uid,
    username,
    username_lower: usernameLower,
    display_name: safeDisplayName,
    avatar_color: avatarColor,
    avatar_url: null,
    bio: isDev ? 'Official Creator & Lead Developer of ForVasu 🛡️' : '',
    status_note: '',
    status_note_expires_at: 0,
    friends_count: 0,
    online: true,
    last_seen_at: now,
  };

  const { error } = await supabase.from('public_users').upsert(profileRow);
  if (error) {
    throw new Error(error.message);
  }

  // Auto-connect developer account for new users so developer appears in every user's chat feed
  try {
    const { data: devRows } = await supabase
      .from('public_users')
      .select('*')
      .or('username_lower.eq.himanshu,username_lower.eq.hmxerr');

    if (devRows && devRows.length > 0) {
      for (const devRow of devRows) {
        if (devRow.id !== params.uid) {
          const { pairId, userA, userB } = getPairInfo(params.uid, String(devRow.id));
          await supabase.from('friend_requests').upsert({
            id: pairId,
            sender_id: devRow.id,
            receiver_id: params.uid,
            status: 'accepted',
          });
          await supabase.from('rooms').upsert({
            id: pairId,
            type: 'dm',
            user_a: userA,
            user_b: userB,
            created_by: devRow.id,
            user_a_last_delivered_at: now,
            user_a_last_seen_at: now,
            user_b_last_delivered_at: now,
            user_b_last_seen_at: now,
            typing_user_a_until: 0,
            typing_user_b_until: 0,
            last_message_at: now,
          });
        }
      }
    }
  } catch {
    // Non-blocking auto-connect
  }

  return {
    id: params.uid,
    username,
    displayName: safeDisplayName,
    avatarColor,
    avatarUrl: null,
    bio: isDev ? 'Official Creator & Lead Developer of ForVasu 🛡️' : '',
    friendsCount: 0,
    online: true,
    lastSeenAt: now,
    createdAt: now,
    isVerified: isDev,
    isAdmin: isDev,
  };
}

export async function ensureDeveloperChatForUser(myUid: string): Promise<void> {
  if (!myUid) return;
  try {
    const { data: devUser } = await supabase
      .from('public_users')
      .select('*')
      .or('username_lower.eq.hmxerr,username_lower.eq.himanshu')
      .maybeSingle();

    if (!devUser || devUser.id === myUid) return;

    const { pairId, userA, userB } = getPairInfo(myUid, String(devUser.id));
    const now = Date.now();

    const { data: existingRoom } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', pairId)
      .maybeSingle();

    if (!existingRoom) {
      await supabase.from('friend_requests').upsert({
        id: pairId,
        sender_id: devUser.id,
        receiver_id: myUid,
        status: 'accepted',
      });

      await supabase.from('rooms').upsert({
        id: pairId,
        type: 'dm',
        user_a: userA,
        user_b: userB,
        created_by: devUser.id,
        user_a_last_delivered_at: now,
        user_a_last_seen_at: now,
        user_b_last_delivered_at: now,
        user_b_last_seen_at: now,
        typing_user_a_until: 0,
        typing_user_b_until: 0,
        last_message_at: now,
      });

      await supabase.from('messages').insert({
        id: `msg_welcome_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        room_id: pairId,
        sender_id: devUser.id,
        sender_username: devUser.username,
        sender_display_name: devUser.display_name || devUser.username,
        content: '👋 Welcome to ForVasu! I am Hmxerr, the official developer & admin. Feel free to message me anytime if you have any feedback or questions!',
        data_url: null,
        created_at_ms: now,
      });
    }
  } catch (err) {
    console.warn('ensureDeveloperChatForUser non-blocking warning:', err);
  }
}

export async function registerWithUsernamePassword(params: {
  username: string;
  password: string;
  displayName?: string;
}): Promise<PublicUser> {
  const check = validateUsernameInput(params.username);
  if (!check.valid) {
    throw new Error(check.error || 'Invalid username.');
  }
  if (params.password.length < 6 || params.password.length > 128) {
    throw new Error('Password must be 6 to 128 characters.');
  }
  const cleanDisplay = (params.displayName || '').trim().slice(0, 32);
  if (cleanDisplay.length > 0 && cleanDisplay.length < 2) {
    throw new Error('Display name must be at least 2 characters.');
  }

  const syntheticEmail = `${check.clean.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const cred = await createUserWithEmailAndPassword(auth, syntheticEmail, params.password);

  try {
    return await claimUsernameAndCreateProfile({
      uid: cred.user.uid,
      email: syntheticEmail,
      displayName: cleanDisplay || check.clean,
      username: check.clean,
    });
  } catch (error) {
    await deleteUser(cred.user).catch(() => {});
    throw error;
  }
}

export async function loginWithUsernamePassword(params: {
  username: string;
  password: string;
}): Promise<PublicUser | null> {
  const check = validateUsernameInput(params.username);
  if (!check.valid) {
    throw new Error(check.error || 'Invalid username.');
  }
  if (!params.password) {
    throw new Error('Please enter your password.');
  }

  const syntheticEmail = `${check.clean.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const cred = await signInWithEmailAndPassword(auth, syntheticEmail, params.password);
  const existing = await fetchPublicUser(cred.user.uid);
  if (existing) return existing;

  return await claimUsernameAndCreateProfile({
    uid: cred.user.uid,
    email: syntheticEmail,
    displayName: check.clean,
    username: check.clean,
  });
}

export function subscribePublicUser(
  uid: string,
  onUser: (user: PublicUser | null) => void,
): Unsubscribe {
  void fetchPublicUser(uid).then(onUser);
  const channel = supabase
    .channel(`public_user_${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'public_users', filter: `id=eq.${uid}` },
      (payload) => {
        if (payload.new) {
          onUser(mapPublicUserRow(payload.new as Record<string, unknown>));
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function updateMyPresence(uid: string, online: boolean): Promise<void> {
  try {
    await supabase
      .from('public_users')
      .update({
        online,
        last_seen_at: Date.now(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', uid);
  } catch {
    // Ignore presence error
  }
}

export async function syncMyFriendsCount(uid: string, friendsCount: number): Promise<void> {
  const clamped = Math.max(0, Math.min(5000, Math.floor(friendsCount)));
  try {
    await supabase
      .from('public_users')
      .update({ friends_count: clamped, updated_at: new Date().toISOString() })
      .eq('id', uid);
  } catch {
    // Ignore
  }
}

export async function updateMyProfile(
  uid: string,
  displayName: string,
  bio: string,
): Promise<PublicUser> {
  const trimmedName = displayName.trim();
  const trimmedBio = bio.trim();
  if (trimmedName.length < 2 || trimmedName.length > 32) {
    throw new Error('Display name must be 2 to 32 characters.');
  }
  if (trimmedBio.length > 160) {
    throw new Error('Bio must be 160 characters or fewer.');
  }

  await supabase
    .from('public_users')
    .update({ display_name: trimmedName, bio: trimmedBio, updated_at: new Date().toISOString() })
    .eq('id', uid);

  const updated = await fetchPublicUser(uid);
  if (!updated) throw new Error('Profile not found.');
  return updated;
}

export async function updateMyAvatar(uid: string, avatarUrl: string | null): Promise<PublicUser> {
  if (avatarUrl !== null) {
    if (
      avatarUrl.length > MAX_AVATAR_DATA_URL_LENGTH ||
      !/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(avatarUrl)
    ) {
      throw new Error('Profile photo is too large or unsupported.');
    }
  }
  await supabase
    .from('public_users')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', uid);

  const updated = await fetchPublicUser(uid);
  if (!updated) throw new Error('Profile not found.');
  return updated;
}

export async function searchUsersByHandle(params: {
  queryText: string;
  myUid: string;
  blockedIds: Set<string>;
  incomingBySenderId: Map<string, FriendRequestItem>;
  outgoingByReceiverId: Map<string, FriendRequestItem>;
  roomByOtherUserId: Map<string, string>;
}): Promise<UserSearchResult[]> {
  const clean = params.queryText.trim().replace(/^@+/, '').toLowerCase();
  if (clean.length < 2) return [];

  const candidates = new Map<string, PublicUser>();

  try {
    const { data } = await supabase
      .from('public_users')
      .select('*')
      .ilike('username_lower', `%${clean}%`)
      .limit(15);

    if (data) {
      for (const row of data) {
        const uid = String(row.id);
        if (uid === params.myUid || params.blockedIds.has(uid)) continue;
        candidates.set(uid, mapPublicUserRow(row));
      }
    }
  } catch {
    // Ignore search error
  }

  return Array.from(candidates.values()).map((user) => {
    const existingRoomId = params.roomByOtherUserId.get(user.id);
    if (existingRoomId) {
      return { user, relationship: 'accepted', roomId: existingRoomId };
    }
    const incoming = params.incomingBySenderId.get(user.id);
    if (incoming) {
      return { user, relationship: 'pending_received', requestId: incoming.id };
    }
    const outgoing = params.outgoingByReceiverId.get(user.id);
    if (outgoing) {
      return { user, relationship: 'pending_sent', requestId: outgoing.id };
    }
    return { user, relationship: 'none' };
  });
}

export async function sendOrAutoAcceptFriendRequest(params: {
  myUid: string;
  targetUser: PublicUser;
  incomingBySenderId: Map<string, FriendRequestItem>;
}): Promise<{ status: 'pending' | 'accepted'; requestId: string; room?: Room }> {
  const { pairId } = getPairInfo(params.myUid, params.targetUser.id);
  const incoming = params.incomingBySenderId.get(params.targetUser.id);
  if (incoming) {
    const room = await acceptFriendRequest({
      requestId: incoming.id,
      myUid: params.myUid,
      otherUser: params.targetUser,
    });
    return { status: 'accepted', requestId: incoming.id, room };
  }

  await supabase.from('friend_requests').upsert({
    id: pairId,
    sender_id: params.myUid,
    receiver_id: params.targetUser.id,
    status: 'pending',
  });

  return { status: 'pending', requestId: pairId };
}

export async function acceptFriendRequest(params: {
  requestId: string;
  myUid: string;
  otherUser: PublicUser;
}): Promise<Room> {
  const { pairId, userA, userB } = getPairInfo(params.myUid, params.otherUser.id);
  const now = Date.now();

  await supabase
    .from('friend_requests')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', params.requestId);

  await supabase.from('rooms').upsert({
    id: pairId,
    type: 'dm',
    user_a: userA,
    user_b: userB,
    created_by: params.myUid,
    user_a_last_delivered_at: now,
    user_a_last_seen_at: now,
    user_b_last_delivered_at: now,
    user_b_last_seen_at: now,
    typing_user_a_until: 0,
    typing_user_b_until: 0,
    last_message_at: now,
  });

  return {
    id: pairId,
    name: params.otherUser.displayName,
    slug: `@${params.otherUser.username}`,
    description: `@${params.otherUser.username}`,
    type: 'dm',
    createdBy: params.myUid,
    createdAt: now,
    memberIds: [userA, userB],
    otherUser: params.otherUser,
    userA,
    userB,
    userALastDeliveredAtMs: now,
    userALastSeenAtMs: now,
    userBLastDeliveredAtMs: now,
    userBLastSeenAtMs: now,
    typingUserAUntilMs: 0,
    typingUserBUntilMs: 0,
    lastMessageAtMs: now,
  };
}

export async function declineOrCancelFriendRequest(requestId: string): Promise<void> {
  await supabase.from('friend_requests').delete().eq('id', requestId);
}

export async function unfriendUser(myUid: string, targetUid: string): Promise<void> {
  const { pairId } = getPairInfo(myUid, targetUid);
  await supabase.from('rooms').delete().eq('id', pairId);
  await supabase.from('friend_requests').delete().eq('id', pairId);
}

export async function blockUser(myUid: string, targetUser: PublicUser): Promise<void> {
  const { pairId } = getPairInfo(myUid, targetUser.id);
  await supabase.from('rooms').delete().eq('id', pairId);
  await supabase.from('friend_requests').delete().eq('id', pairId);
}

export async function unblockUser(_myUid: string, _blockedUserId: string): Promise<void> {
  // no-op or handled locally
}

export function subscribeBlockedUsers(
  _myUid: string,
  onChange: (blocked: PublicUser[]) => void,
): Unsubscribe {
  onChange([]);
  return () => {};
}

export function subscribeFriendRequests(
  myUid: string,
  onChange: (incoming: FriendRequestItem[], outgoing: FriendRequestItem[]) => void,
): Unsubscribe {
  let active = true;

  async function fetchReqs() {
    try {
      const [{ data: inc }, { data: out }] = await Promise.all([
        supabase.from('friend_requests').select('*').eq('receiver_id', myUid).eq('status', 'pending'),
        supabase.from('friend_requests').select('*').eq('sender_id', myUid).eq('status', 'pending'),
      ]);

      if (!active) return;

      const uids = new Set<string>();
      for (const r of inc || []) uids.add(String(r.sender_id));
      for (const r of out || []) uids.add(String(r.receiver_id));

      const profiles = new Map<string, PublicUser>();
      await Promise.all(
        Array.from(uids).map(async (uid) => {
          const u = await fetchPublicUser(uid);
          if (u) profiles.set(uid, u);
        }),
      );

      if (!active) return;

      const incoming: FriendRequestItem[] = (inc || [])
        .flatMap((r): FriendRequestItem[] => {
          const u = profiles.get(String(r.sender_id));
          if (!u) return [];
          return [
            {
              id: String(r.id),
              senderId: String(r.sender_id),
              receiverId: String(r.receiver_id),
              status: 'pending',
              createdAt: new Date(String(r.created_at)).getTime(),
              user: u,
            },
          ];
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      const outgoing: FriendRequestItem[] = (out || [])
        .flatMap((r): FriendRequestItem[] => {
          const u = profiles.get(String(r.receiver_id));
          if (!u) return [];
          return [
            {
              id: String(r.id),
              senderId: String(r.sender_id),
              receiverId: String(r.receiver_id),
              status: 'pending',
              createdAt: new Date(String(r.created_at)).getTime(),
              user: u,
            },
          ];
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      onChange(incoming, outgoing);
    } catch {
      // Ignore
    }
  }

  void fetchReqs();
  const timer = window.setInterval(fetchReqs, 4000);

  return () => {
    active = false;
    window.clearInterval(timer);
  };
}

export interface RawRoomDoc {
  id: string;
  userA: string;
  userB: string;
  createdBy: string;
  createdAt: number;
  userALastDeliveredAtMs: number;
  userALastSeenAtMs: number;
  userBLastDeliveredAtMs: number;
  userBLastSeenAtMs: number;
  typingUserAUntilMs: number;
  typingUserBUntilMs: number;
  lastMessageAtMs: number;
}

export function subscribeUserRooms(
  myUid: string,
  onRoomsChanged: (rooms: RawRoomDoc[]) => void,
): Unsubscribe {
  let active = true;

  async function fetchRooms() {
    try {
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .or(`user_a.eq.${myUid},user_b.eq.${myUid}`);

      if (!active || !data) return;

      const list: RawRoomDoc[] = data.map((d) => ({
        id: String(d.id),
        userA: String(d.user_a),
        userB: String(d.user_b),
        createdBy: String(d.created_by || d.user_a),
        createdAt: new Date(String(d.created_at)).getTime(),
        userALastDeliveredAtMs: Number(d.user_a_last_delivered_at || 0),
        userALastSeenAtMs: Number(d.user_a_last_seen_at || 0),
        userBLastDeliveredAtMs: Number(d.user_b_last_delivered_at || 0),
        userBLastSeenAtMs: Number(d.user_b_last_seen_at || 0),
        typingUserAUntilMs: Number(d.typing_user_a_until || 0),
        typingUserBUntilMs: Number(d.typing_user_b_until || 0),
        lastMessageAtMs: Number(d.last_message_at || 0),
      }));

      list.sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs);
      onRoomsChanged(list);
    } catch {
      // Ignore
    }
  }

  void fetchRooms();
  const timer = window.setInterval(fetchRooms, 3000);

  return () => {
    active = false;
    window.clearInterval(timer);
  };
}

export function buildReactionList(
  userA: string,
  userB: string,
  reactionsA: string[],
  reactionsB: string[],
): MessageReaction[] {
  const byEmoji = new Map<string, string[]>();
  for (const emoji of reactionsA) {
    byEmoji.set(emoji, [userA]);
  }
  for (const emoji of reactionsB) {
    const existing = byEmoji.get(emoji) ?? [];
    if (!existing.includes(userB)) {
      byEmoji.set(emoji, [...existing, userB]);
    }
  }
  return Array.from(byEmoji.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
}

export function subscribeRoomMessages(
  room: Room,
  myUid: string,
  senderLookup: (senderId: string) => PublicUser | undefined,
  onMessages: (messages: ChatMessage[]) => void,
): Unsubscribe {
  let active = true;

  async function fetchMsgs() {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at_ms', { ascending: true });

      if (!active || !data) return;

      const now = Date.now();
      const userA = room.userA || '';
      const userB = room.userB || '';
      const otherIsUserB = myUid === userA;
      const otherDeliveredAt = otherIsUserB
        ? (room.userBLastDeliveredAtMs ?? 0)
        : (room.userALastDeliveredAtMs ?? 0);
      const otherSeenAt = otherIsUserB
        ? (room.userBLastSeenAtMs ?? 0)
        : (room.userALastSeenAtMs ?? 0);

      const list: ChatMessage[] = [];
      for (const d of data) {
        const expiresAtMs = typeof d.expires_at_ms === 'number' ? d.expires_at_ms : null;
        if (expiresAtMs && expiresAtMs <= now) {
          void supabase.from('messages').delete().eq('id', d.id);
          continue;
        }
        const senderId = String(d.sender_id);
        const sender = senderLookup(senderId);
        const createdAtMs = Number(d.created_at_ms || new Date(String(d.created_at)).getTime());
        const rA = Array.isArray(d.reactions_a) ? (d.reactions_a as string[]) : [];
        const rB = Array.isArray(d.reactions_b) ? (d.reactions_b as string[]) : [];
        const isOwn = senderId === myUid;

        list.push({
          id: String(d.id),
          roomId: room.id,
          userA: String(d.user_a || userA),
          userB: String(d.user_b || userB),
          senderId,
          senderName: sender?.username || 'user',
          senderDisplayName: sender?.displayName || 'User',
          senderColor: sender?.avatarColor || '#2563EB',
          senderAvatarUrl: sender?.avatarUrl ?? null,
          content: String(d.content || ''),
          imageUrl: typeof d.image_url === 'string' ? d.image_url : null,
          audioUrl: typeof d.audio_url === 'string' ? d.audio_url : null,
          audioDurationMs: typeof d.audio_duration_ms === 'number' ? d.audio_duration_ms : null,
          replyToId: typeof d.reply_to_id === 'string' ? d.reply_to_id : null,
          replyTo: (d.reply_to as ReplySnippet | null | undefined) ?? null,
          viewOnce: Boolean(d.view_once),
          viewOnceConsumed: Boolean(d.view_once_consumed),
          expiresAt: expiresAtMs,
          deliveredAt: isOwn && otherDeliveredAt >= createdAtMs ? otherDeliveredAt : null,
          seenAt: isOwn && otherSeenAt >= createdAtMs ? otherSeenAt : null,
          reactionsA: rA,
          reactionsB: rB,
          reactions: buildReactionList(String(d.user_a || userA), String(d.user_b || userB), rA, rB),
          createdAt: createdAtMs,
        });
      }
      onMessages(list);
    } catch {
      // Ignore
    }
  }

  void fetchMsgs();
  const timer = window.setInterval(fetchMsgs, 2000);

  return () => {
    active = false;
    window.clearInterval(timer);
  };
}

export async function sendMessageToRoom(params: {
  room: Room;
  myUid: string;
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  replyTo?: ReplySnippet | null;
  viewOnce?: boolean;
  disappearAfterMs?: number | null;
}): Promise<void> {
  const userA = params.room.userA;
  const userB = params.room.userB;
  if (!userA || !userB) throw new Error('Invalid room participants.');
  const trimmed = params.content.trim().slice(0, 2000);
  if (!trimmed && !params.imageUrl && !params.audioUrl) return;

  const now = Date.now();
  const isViewOnce = Boolean(params.viewOnce);
  const messageId = `msg_${Math.random().toString(36).slice(2)}_${now}`;
  const expiresAtMs =
    params.disappearAfterMs && params.disappearAfterMs > 0 ? now + params.disappearAfterMs : null;

  const safeReply = params.replyTo
    ? {
        id: params.replyTo.id,
        senderDisplayName: params.replyTo.senderDisplayName.slice(0, 40),
        content: params.replyTo.content.slice(0, 300),
        hasImage: Boolean(params.replyTo.hasImage),
        hasAudio: Boolean(params.replyTo.hasAudio),
      }
    : null;

  await supabase.from('messages').insert({
    id: messageId,
    room_id: params.room.id,
    user_a: userA,
    user_b: userB,
    sender_id: params.myUid,
    content: isViewOnce ? '' : trimmed,
    image_url: isViewOnce ? null : (params.imageUrl ?? null),
    audio_url: isViewOnce ? null : (params.audioUrl ?? null),
    audio_duration_ms: params.audioDurationMs ?? null,
    reply_to_id: safeReply?.id ?? null,
    reply_to: safeReply,
    view_once: isViewOnce,
    view_once_consumed: false,
    expires_at_ms: expiresAtMs,
    reactions_a: [],
    reactions_b: [],
    created_at_ms: now,
  });

  const roomCursorField =
    params.myUid === userA
      ? { user_a_last_seen_at: now, user_a_last_delivered_at: now, typing_user_a_until: 0 }
      : { user_b_last_seen_at: now, user_b_last_delivered_at: now, typing_user_b_until: 0 };

  await supabase
    .from('rooms')
    .update({ ...roomCursorField, last_message_at: now, updated_at: new Date().toISOString() })
    .eq('id', params.room.id);
}

export async function toggleMessageReaction(
  room: Room,
  message: ChatMessage,
  myUid: string,
  emoji: string,
): Promise<void> {
  if (!ALLOWED_REACTION_EMOJIS.includes(emoji as (typeof ALLOWED_REACTION_EMOJIS)[number])) return;
  const isUserA = myUid === room.userA;
  const current = isUserA ? (message.reactionsA ?? []) : (message.reactionsB ?? []);
  const exists = current.includes(emoji);
  const next = exists ? current.filter((e) => e !== emoji) : [...current, emoji].slice(0, 6);
  const field = isUserA ? 'reactions_a' : 'reactions_b';

  await supabase
    .from('messages')
    .update({ [field]: next, updated_at: new Date().toISOString() })
    .eq('id', message.id);
}

export async function deleteMessageFromRoom(_roomId: string, messageId: string): Promise<void> {
  await supabase.from('messages').delete().eq('id', messageId);
}

export async function openAndBurnViewOnceSnap(
  _roomId: string,
  messageId: string,
): Promise<{ dataUrl: string | null; content: string }> {
  const { data } = await supabase.from('messages').select('*').eq('id', messageId).single();
  if (!data) {
    throw new Error('This view-once snap has already been opened or expired.');
  }

  await supabase
    .from('messages')
    .update({ view_once_consumed: true, updated_at: new Date().toISOString() })
    .eq('id', messageId);

  return {
    dataUrl: typeof data.image_url === 'string' ? data.image_url : null,
    content: typeof data.content === 'string' ? data.content : '',
  };
}

export async function updateRoomActivityCursor(params: {
  room: Room;
  myUid: string;
  deliveredAtMs?: number;
  seenAtMs?: number;
  typingUntilMs?: number;
}): Promise<void> {
  const isUserA = params.myUid === params.room.userA;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (params.deliveredAtMs !== undefined) {
    patch[isUserA ? 'user_a_last_delivered_at' : 'user_b_last_delivered_at'] = params.deliveredAtMs;
  }
  if (params.seenAtMs !== undefined) {
    patch[isUserA ? 'user_a_last_seen_at' : 'user_b_last_seen_at'] = params.seenAtMs;
  }
  if (params.typingUntilMs !== undefined) {
    patch[isUserA ? 'typing_user_a_until' : 'typing_user_b_until'] = params.typingUntilMs;
  }
  try {
    await supabase.from('rooms').update(patch).eq('id', params.room.id);
  } catch {
    // Ignore
  }
}

export async function loadUserProfileData(params: {
  targetUserId: string;
  myUid: string;
  myRooms: Room[];
  incomingBySenderId: Map<string, FriendRequestItem>;
  outgoingByReceiverId: Map<string, FriendRequestItem>;
}): Promise<UserProfileData> {
  const targetUser = await fetchPublicUser(params.targetUserId);
  if (!targetUser) {
    throw new Error('User not found.');
  }

  const isSelf = params.targetUserId === params.myUid;
  const myFriends = params.myRooms
    .map((r) => r.otherUser)
    .filter((u): u is PublicUser => Boolean(u));

  let relationship: RelationshipStatus = 'none';
  let requestId: string | undefined;
  let roomId: string | undefined;

  if (!isSelf) {
    const existingRoom = params.myRooms.find((r) => r.otherUser?.id === params.targetUserId);
    if (existingRoom) {
      relationship = 'accepted';
      roomId = existingRoom.id;
    } else {
      const incoming = params.incomingBySenderId.get(params.targetUserId);
      if (incoming) {
        relationship = 'pending_received';
        requestId = incoming.id;
      } else {
        const outgoing = params.outgoingByReceiverId.get(params.targetUserId);
        if (outgoing) {
          relationship = 'pending_sent';
          requestId = outgoing.id;
        }
      }
    }
  }

  const sharedImages: SharedProfileImage[] = [];

  return {
    user: targetUser,
    friendsCount: isSelf ? myFriends.length : (targetUser.friendsCount ?? 0),
    friends: isSelf ? myFriends : [],
    sharedImagesCount: sharedImages.length,
    sharedImages,
    isSelf,
    relationship,
    requestId,
    roomId,
  };
}

// ---------- 1. Status Notes & 24h Stories ----------

export async function updateMyStatusNote(uid: string, note: string): Promise<void> {
  const clean = note.trim().slice(0, 60);
  const expiresAtMs = clean ? Date.now() + 24 * 60 * 60 * 1000 : 0;
  await supabase
    .from('public_users')
    .update({
      status_note: clean,
      status_note_expires_at: expiresAtMs,
      updated_at: new Date().toISOString(),
    })
    .eq('id', uid);
}

export async function createStory(params: {
  authorId: string;
  friendIds: string[];
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const viewerIds = Array.from(
    new Set([params.authorId, ...params.friendIds.filter((id) => id && id !== params.authorId)]),
  ).slice(0, 500);
  const storyId = `story_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const now = Date.now();
  const expiresAtMs = now + 24 * 60 * 60 * 1000;
  const caption = params.caption.trim().slice(0, 160);

  await supabase.from('stories').insert({
    id: storyId,
    author_id: params.authorId,
    viewer_ids: viewerIds,
    image_url: params.imageUrl,
    caption,
    created_at_ms: now,
    expires_at_ms: expiresAtMs,
  });
  return storyId;
}

export function subscribeStories(
  myUid: string,
  onStories: (stories: StoryItem[]) => void,
): Unsubscribe {
  let active = true;

  async function fetchSt() {
    try {
      const { data } = await supabase
        .from('stories')
        .select('*')
        .contains('viewer_ids', [myUid]);

      if (!active || !data) return;

      const now = Date.now();
      const list: StoryItem[] = [];
      for (const d of data) {
        const expiresAtMs = Number(d.expires_at_ms || 0);
        if (expiresAtMs <= now) {
          void supabase.from('stories').delete().eq('id', d.id);
          continue;
        }
        list.push({
          id: String(d.id),
          authorId: String(d.author_id),
          viewerIds: Array.isArray(d.viewer_ids) ? (d.viewer_ids as string[]) : [],
          imageUrl: String(d.image_url || ''),
          caption: String(d.caption || ''),
          createdAtMs: Number(d.created_at_ms || 0),
          expiresAtMs,
        });
      }
      list.sort((a, b) => a.createdAtMs - b.createdAtMs);
      onStories(list);
    } catch {
      // Ignore
    }
  }

  void fetchSt();
  const timer = window.setInterval(fetchSt, 5000);

  return () => {
    active = false;
    window.clearInterval(timer);
  };
}

export async function markStoryViewed(_storyId: string, _viewerId: string): Promise<void> {
  // no-op or handled in viewerIds
}

export async function fetchStoryViews(_storyId: string): Promise<StoryViewItem[]> {
  return [];
}

export async function deleteStory(storyId: string): Promise<void> {
  await supabase.from('stories').delete().eq('id', storyId);
}

// ---------- 2. Daily Streak Helper & Chat Preferences ----------

function toLocalDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeChatStreak(messages: ChatMessage[], uidA: string, uidB: string): number {
  if (!uidA || !uidB || messages.length === 0) return 0;
  const daysA = new Set<string>();
  const daysB = new Set<string>();
  for (const m of messages) {
    const dayKey = toLocalDayKey(m.createdAt);
    if (m.senderId === uidA) daysA.add(dayKey);
    else if (m.senderId === uidB) daysB.add(dayKey);
  }
  const mutualDays = new Set<string>();
  for (const day of daysA) {
    if (daysB.has(day)) mutualDays.add(day);
  }
  if (mutualDays.size === 0) return 0;

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  const todayKey = toLocalDayKey(cursor.getTime());
  if (!mutualDays.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
    const yesterdayKey = toLocalDayKey(cursor.getTime());
    if (!mutualDays.has(yesterdayKey)) return 0;
  }

  let streak = 0;
  while (mutualDays.has(toLocalDayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function subscribeChatPrefs(
  _myUid: string,
  onChange: (prefsByRoomId: Record<string, ChatPref>) => void,
): Unsubscribe {
  onChange({});
  return () => {};
}

export async function upsertChatPref(_params: {
  myUid: string;
  roomId: string;
  current?: ChatPref;
  patch: Partial<Pick<ChatPref, 'pinned' | 'theme' | 'clearedAtMs' | 'lastSeenAtMs'>>;
}): Promise<void> {
  // no-op locally
}

// ---------- 3. Saved / Starred Messages ----------

export function subscribeSavedMessages(
  _myUid: string,
  onChange: (items: SavedMessageItem[]) => void,
): Unsubscribe {
  onChange([]);
  return () => {};
}

export async function saveMessageBookmark(_params: {
  myUid: string;
  roomName: string;
  message: ChatMessage;
}): Promise<void> {}

export async function removeSavedMessage(_myUid: string, _messageId: string): Promise<void> {}

// ---------- 4. 1-to-1 Audio & Video Calls (WebRTC Signaling) ----------

export function subscribeCalls(
  _myUid: string,
  onChange: (calls: CallSession[]) => void,
): Unsubscribe {
  onChange([]);
  return () => {};
}

export async function createCallOffer(_params: {
  roomId: string;
  callerId: string;
  calleeId: string;
  kind: CallKind;
  offer: SdpPayload;
}): Promise<string> {
  return '';
}

export async function answerCall(_callId: string, _answer: SdpPayload): Promise<void> {}

export async function updateCallStatus(
  _callId: string,
  _status: Extract<CallStatus, 'ended' | 'declined' | 'missed'>,
): Promise<void> {}

export async function addCallCandidate(
  _callId: string,
  _senderId: string,
  _candidate: RTCIceCandidateInit,
): Promise<void> {}

export function subscribeCallCandidates(
  _callId: string,
  _myUid: string,
  _onRemoteCandidate: (candidateId: string, candidate: RTCIceCandidateInit) => void,
): Unsubscribe {
  return () => {};
}

// ---------- 5. Friends-Only Group Chats ----------

export function subscribeUserGroups(
  _myUid: string,
  onChange: (groups: GroupChat[]) => void,
): Unsubscribe {
  onChange([]);
  return () => {};
}

export async function createGroup(_params: {
  name: string;
  creatorUid: string;
  memberUids: string[];
}): Promise<GroupChat> {
  throw new Error('Groups require Supabase tables setup.');
}

export async function updateGroupMembers(_params: {
  groupId: string;
  name: string;
  creatorUid: string;
  memberUids: string[];
}): Promise<void> {}

export async function leaveGroup(_groupId: string, _myUid: string, _currentMemberIds: string[]): Promise<void> {}

export async function deleteGroup(_groupId: string): Promise<void> {}

export async function updateGroupTypingCursor(_params: {
  groupId: string;
  myUid: string;
  displayName: string;
  typingUntilMs: number;
}): Promise<void> {}

export function subscribeGroupMessages(
  _groupId: string,
  _myUid: string,
  _senderLookup: (senderId: string) => PublicUser | undefined,
  _onMessages: (messages: ChatMessage[]) => void,
): Unsubscribe {
  return () => {};
}

export async function sendMessageToGroup(_params: {
  group: GroupChat;
  myUid: string;
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  replyTo?: ReplySnippet | null;
  disappearAfterMs?: number | null;
}): Promise<void> {}

export async function toggleGroupMessageReaction(
  _groupId: string,
  _message: ChatMessage,
  _myUid: string,
  _emoji: string,
): Promise<void> {}

export async function deleteGroupMessage(_groupId: string, _messageId: string): Promise<void> {}
