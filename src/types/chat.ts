export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string | null;
  bio?: string;
  statusNote?: string;
  statusNoteExpiresAtMs?: number;
  friendsCount?: number;
  followersCount?: number;
  followingCount?: number;
  isVerified?: boolean;
  isAdmin?: boolean;
  online?: boolean;
  lastSeenAt?: number | null;
  createdAt: number;
}

export type ChatTheme = 'default' | 'ocean' | 'lavender' | 'sunset' | 'forest' | 'midnight';

export interface ChatPref {
  roomId: string;
  pinned: boolean;
  theme: ChatTheme;
  clearedAtMs: number;
  lastSeenAtMs: number;
  updatedAt: number;
}

export interface SavedMessageItem {
  id: string;
  roomId: string;
  roomName: string;
  senderDisplayName: string;
  senderUsername: string;
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  createdAtMs: number;
  savedAt: number;
}

export interface StoryItem {
  id: string;
  authorId: string;
  viewerIds: string[];
  imageUrl: string;
  caption: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface StoryViewItem {
  viewerId: string;
  viewedAt: number;
}

export interface SdpPayload {
  type: 'offer' | 'answer';
  sdp: string;
}

export type CallKind = 'audio' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'declined' | 'missed';

export interface CallSession {
  id: string;
  roomId: string;
  callerId: string;
  calleeId: string;
  participantIds: string[];
  kind: CallKind;
  status: CallStatus;
  offer: SdpPayload;
  answer?: SdpPayload | null;
  createdAtMs: number;
  updatedAt: number;
}

export interface GroupChat {
  id: string;
  name: string;
  avatarColor: string;
  createdBy: string;
  memberIds: string[];
  typingUid?: string | null;
  typingName?: string | null;
  typingUntilMs: number;
  lastMessageAtMs: number;
  createdAt: number;
}

export interface Room {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: 'dm';
  createdBy: string | null;
  createdAt: number;
  memberIds?: string[];
  otherUser?: PublicUser | null;
  userA?: string;
  userB?: string;
  userALastDeliveredAtMs?: number;
  userALastSeenAtMs?: number;
  userBLastDeliveredAtMs?: number;
  userBLastSeenAtMs?: number;
  typingUserAUntilMs?: number;
  typingUserBUntilMs?: number;
  lastMessageAtMs?: number;
}

export type RelationshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

export interface FriendRequestItem {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted';
  createdAt: number;
  user: PublicUser;
}

export interface UserSearchResult {
  user: PublicUser;
  relationship: RelationshipStatus;
  requestId?: string;
  roomId?: string;
}

export interface SharedProfileImage {
  id: string;
  imageUrl: string;
  createdAt: number;
}

export interface UserProfileData {
  user: PublicUser;
  friendsCount: number;
  friends: PublicUser[];
  sharedImagesCount: number;
  sharedImages: SharedProfileImage[];
  isSelf: boolean;
  relationship: RelationshipStatus;
  requestId?: string;
  roomId?: string;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface ReplySnippet {
  id: string;
  senderDisplayName: string;
  content: string;
  hasImage?: boolean;
  hasAudio?: boolean;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  groupId?: string;
  memberIds?: string[];
  userA?: string;
  userB?: string;
  senderId: string;
  senderName: string;
  senderDisplayName: string;
  senderColor: string;
  senderAvatarUrl?: string | null;
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  replyToId?: string | null;
  replyTo?: ReplySnippet | null;
  viewOnce?: boolean;
  viewOnceConsumed?: boolean;
  expiresAt?: number | null;
  deliveredAt?: number | null;
  seenAt?: number | null;
  reactions?: MessageReaction[];
  reactionsA?: string[];
  reactionsB?: string[];
  reactionsByUser?: Record<string, string[]>;
  createdAt: number;
  pending?: boolean;
  failed?: boolean;
  clientMessageId?: string;
}
