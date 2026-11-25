import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  ChatMessage,
  FriendRequestItem,
  MessageReaction,
  PublicUser,
  RelationshipStatus,
  ReplySnippet,
  Room,
  SharedProfileImage,
  UserProfileData,
  UserSearchResult,
} from '../types/chat.ts';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const legacyDbPath = path.join(dataDir, 'varta.db');
const dbPath = path.join(dataDir, 'forvasu.db');
if (fs.existsSync(legacyDbPath) && !fs.existsSync(dbPath)) {
  fs.renameSync(legacyDbPath, dbPath);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(legacyDbPath + suffix)) {
      fs.renameSync(legacyDbPath + suffix, dbPath + suffix);
    }
  }
}
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_color TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT NOT NULL DEFAULT '',
    last_seen_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('channel', 'dm')),
    created_by TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'accepted')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (sender_id, receiver_id),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_friend_requests_sender
    ON friend_requests (sender_id, status);
  CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver
    ON friend_requests (receiver_id, status);

  CREATE TABLE IF NOT EXISTS blocked_users (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_display_name TEXT NOT NULL,
    sender_color TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    audio_url TEXT,
    audio_duration_ms INTEGER,
    reply_to_id TEXT,
    view_once INTEGER NOT NULL DEFAULT 0,
    view_once_consumed INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,
    delivered_at INTEGER,
    seen_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_room_created
    ON messages (room_id, created_at);

  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function ensureColumn(table: string, col: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
  }
}

ensureColumn('users', 'avatar_url', 'TEXT');
ensureColumn('users', 'bio', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'last_seen_at', 'INTEGER');
ensureColumn('messages', 'image_url', 'TEXT');
ensureColumn('messages', 'audio_url', 'TEXT');
ensureColumn('messages', 'audio_duration_ms', 'INTEGER');
ensureColumn('messages', 'reply_to_id', 'TEXT');
ensureColumn('messages', 'view_once', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('messages', 'view_once_consumed', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('messages', 'expires_at', 'INTEGER');
ensureColumn('messages', 'delivered_at', 'INTEGER');
ensureColumn('messages', 'seen_at', 'INTEGER');

// DM-only mode: remove any legacy public channel rooms
db.prepare("DELETE FROM rooms WHERE type = 'channel'").run();

interface DbUserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  avatar_color: string;
  avatar_url: string | null;
  bio: string | null;
  last_seen_at: number | null;
  created_at: number;
}

interface DbRoomRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: 'channel' | 'dm';
  created_by: string | null;
  created_at: number;
}

interface DbFriendRequestRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted';
  created_at: number;
  updated_at: number;
}

interface DbMessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  sender_display_name: string;
  sender_color: string;
  sender_avatar_url: string | null;
  content: string;
  image_url: string | null;
  audio_url: string | null;
  audio_duration_ms: number | null;
  reply_to_id: string | null;
  view_once: number;
  view_once_consumed: number;
  expires_at: number | null;
  delivered_at: number | null;
  seen_at: number | null;
  created_at: number;
}

function mapPublicUser(row: DbUserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url,
    bio: row.bio ?? '',
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  };
}

function getReactionsForMessage(messageId: string): MessageReaction[] {
  const rows = db
    .prepare('SELECT emoji, user_id FROM message_reactions WHERE message_id = ? ORDER BY created_at ASC')
    .all(messageId) as Array<{ emoji: string; user_id: string }>;

  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.emoji) ?? [];
    arr.push(r.user_id);
    map.set(r.emoji, arr);
  }
  return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
}

function getReplySnippet(replyToId: string | null): ReplySnippet | null {
  if (!replyToId) return null;
  const row = db
    .prepare(
      'SELECT id, sender_display_name, content, image_url, audio_url, view_once FROM messages WHERE id = ?',
    )
    .get(replyToId) as
    | {
        id: string;
        sender_display_name: string;
        content: string;
        image_url: string | null;
        audio_url: string | null;
        view_once: number;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    senderDisplayName: row.sender_display_name,
    content: row.view_once ? 'View-once snap' : row.content,
    hasImage: Boolean(row.image_url),
    hasAudio: Boolean(row.audio_url),
  };
}

function mapMessageForViewer(row: DbMessageRow): ChatMessage {
  const isViewOnce = Boolean(row.view_once);
  const isConsumed = Boolean(row.view_once_consumed);

  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderDisplayName: row.sender_display_name,
    senderColor: row.sender_color,
    senderAvatarUrl: row.sender_avatar_url,
    content: isViewOnce ? '' : row.content,
    imageUrl: isViewOnce ? null : row.image_url,
    audioUrl: isViewOnce ? null : row.audio_url,
    audioDurationMs: isViewOnce ? null : row.audio_duration_ms,
    replyToId: row.reply_to_id,
    replyTo: getReplySnippet(row.reply_to_id),
    viewOnce: isViewOnce,
    viewOnceConsumed: isConsumed,
    expiresAt: row.expires_at,
    deliveredAt: row.delivered_at,
    seenAt: row.seen_at,
    reactions: getReactionsForMessage(row.id),
    createdAt: row.created_at,
  };
}

function getDmSlug(userIdA: string, userIdB: string): string {
  const pair = [userIdA, userIdB].sort();
  return `dm:${pair[0]}:${pair[1]}`;
}

export function findUserByUsername(username: string): DbUserRow | undefined {
  return db
    .prepare(
      'SELECT id, username, display_name, password_hash, avatar_color, avatar_url, bio, last_seen_at, created_at FROM users WHERE username = ?',
    )
    .get(username.toLowerCase()) as DbUserRow | undefined;
}

export function findPublicUserById(userId: string): PublicUser | null {
  const row = db
    .prepare(
      'SELECT id, username, display_name, password_hash, avatar_color, avatar_url, bio, last_seen_at, created_at FROM users WHERE id = ?',
    )
    .get(userId) as DbUserRow | undefined;
  return row ? mapPublicUser(row) : null;
}

export function createUser(params: {
  username: string;
  displayName: string;
  passwordHash: string;
  avatarColor: string;
}): PublicUser {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, avatar_color, avatar_url, bio, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, '', ?, ?)`,
  ).run(
    id,
    params.username,
    params.displayName,
    params.passwordHash,
    params.avatarColor,
    createdAt,
    createdAt,
  );
  return {
    id,
    username: params.username,
    displayName: params.displayName,
    avatarColor: params.avatarColor,
    avatarUrl: null,
    bio: '',
    lastSeenAt: createdAt,
    createdAt,
  };
}

export function updateUserLastSeen(userId: string, timestamp = Date.now()) {
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(timestamp, userId);
}

export function updateUserProfile(
  userId: string,
  params: { displayName?: string; bio?: string },
): PublicUser | null {
  const existing = findPublicUserById(userId);
  if (!existing) return null;

  const nextDisplayName =
    typeof params.displayName === 'string' && params.displayName.trim().length > 0
      ? params.displayName.trim()
      : existing.displayName;
  const nextBio = typeof params.bio === 'string' ? params.bio.trim() : existing.bio ?? '';

  db.prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?').run(
    nextDisplayName,
    nextBio,
    userId,
  );
  return findPublicUserById(userId);
}

export function updateUserAvatar(
  userId: string,
  avatarUrl: string | null,
): { user: PublicUser | null; previousAvatarUrl: string | null } {
  const existing = db
    .prepare('SELECT avatar_url FROM users WHERE id = ?')
    .get(userId) as { avatar_url: string | null } | undefined;
  if (!existing) {
    return { user: null, previousAvatarUrl: null };
  }

  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, userId);
  return {
    user: findPublicUserById(userId),
    previousAvatarUrl: existing.avatar_url,
  };
}

export function isUserBlockedBetween(userIdA: string, userIdB: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 as ok FROM blocked_users
       WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
       LIMIT 1`,
    )
    .get(userIdA, userIdB, userIdB, userIdA) as { ok: number } | undefined;
  return Boolean(row);
}

export function listBlockedUsers(blockerId: string): PublicUser[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.password_hash, u.avatar_color, u.avatar_url, u.bio, u.last_seen_at, u.created_at
       FROM blocked_users b
       JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = ?
       ORDER BY b.created_at DESC`,
    )
    .all(blockerId) as unknown as DbUserRow[];
  return rows.map(mapPublicUser);
}

export function blockUser(
  blockerId: string,
  targetId: string,
): { roomId: string | null; mediaUrls: string[] } {
  const slug = getDmSlug(blockerId, targetId);
  const room = db
    .prepare("SELECT id FROM rooms WHERE slug = ? AND type = 'dm'")
    .get(slug) as { id: string } | undefined;

  let mediaUrls: string[] = [];
  if (room) {
    const mediaRows = db
      .prepare('SELECT image_url, audio_url FROM messages WHERE room_id = ?')
      .all(room.id) as Array<{ image_url: string | null; audio_url: string | null }>;
    for (const m of mediaRows) {
      if (m.image_url) mediaUrls.push(m.image_url);
      if (m.audio_url) mediaUrls.push(m.audio_url);
    }
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id, created_at)
       VALUES (?, ?, ?)`,
    ).run(blockerId, targetId, Date.now());

    db.prepare(
      `DELETE FROM friend_requests
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)`,
    ).run(blockerId, targetId, targetId, blockerId);

    if (room) {
      db.prepare('DELETE FROM rooms WHERE id = ?').run(room.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { roomId: room?.id ?? null, mediaUrls };
}

export function unblockUser(blockerId: string, targetId: string): boolean {
  const res = db
    .prepare('DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?')
    .run(blockerId, targetId);
  return res.changes > 0;
}

export function unfriendUser(
  userId: string,
  friendId: string,
): { removed: boolean; roomId: string | null } {
  const slug = getDmSlug(userId, friendId);
  const room = db
    .prepare("SELECT id FROM rooms WHERE slug = ? AND type = 'dm'")
    .get(slug) as { id: string } | undefined;

  const res = db
    .prepare(
      `DELETE FROM friend_requests
       WHERE status = 'accepted'
         AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))`,
    )
    .run(userId, friendId, friendId, userId);

  return {
    removed: res.changes > 0,
    roomId: room?.id ?? null,
  };
}

export function areUsersAcceptedFriends(userIdA: string, userIdB: string): boolean {
  if (isUserBlockedBetween(userIdA, userIdB)) return false;
  const row = db
    .prepare(
      `SELECT 1 as ok FROM friend_requests
       WHERE status = 'accepted'
         AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
       LIMIT 1`,
    )
    .get(userIdA, userIdB, userIdB, userIdA) as { ok: number } | undefined;
  return Boolean(row);
}

export function getAcceptedFriendIds(userId: string): string[] {
  const rows = db
    .prepare(
      `SELECT sender_id, receiver_id FROM friend_requests
       WHERE status = 'accepted' AND (sender_id = ? OR receiver_id = ?)`,
    )
    .all(userId, userId) as Array<{ sender_id: string; receiver_id: string }>;

  return rows
    .map((r) => (r.sender_id === userId ? r.receiver_id : r.sender_id))
    .filter((otherId) => !isUserBlockedBetween(userId, otherId));
}

function findRequestBetween(userIdA: string, userIdB: string): DbFriendRequestRow | undefined {
  return db
    .prepare(
      `SELECT id, sender_id, receiver_id, status, created_at, updated_at
       FROM friend_requests
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       LIMIT 1`,
    )
    .get(userIdA, userIdB, userIdB, userIdA) as DbFriendRequestRow | undefined;
}

export function searchUsersForRequester(currentUserId: string, rawQuery: string): UserSearchResult[] {
  const clean = rawQuery.trim().replace(/^@+/, '');
  if (clean.length < 2) return [];

  const escapedLike = clean.toLowerCase().replace(/[\\%_]/g, '\\$&');
  const rows = db
    .prepare(
      `SELECT id, username, display_name, password_hash, avatar_color, avatar_url, bio, last_seen_at, created_at
       FROM users
       WHERE id != ?
         AND (username LIKE ? ESCAPE '\\' OR id = ?)
         AND NOT EXISTS (
           SELECT 1 FROM blocked_users b
           WHERE (b.blocker_id = ? AND b.blocked_id = users.id)
              OR (b.blocker_id = users.id AND b.blocked_id = ?)
         )
       ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END, display_name COLLATE NOCASE ASC
       LIMIT 15`,
    )
    .all(
      currentUserId,
      `%${escapedLike}%`,
      clean,
      currentUserId,
      currentUserId,
      clean.toLowerCase(),
    ) as unknown as DbUserRow[];

  return rows.map((row) => {
    const user = mapPublicUser(row);
    const req = findRequestBetween(currentUserId, user.id);

    let relationship: RelationshipStatus = 'none';
    let requestId: string | undefined;
    let roomId: string | undefined;

    if (req) {
      if (req.status === 'accepted') {
        relationship = 'accepted';
        const existingRoom = db
          .prepare("SELECT id FROM rooms WHERE slug = ? AND type = 'dm'")
          .get(getDmSlug(currentUserId, user.id)) as { id: string } | undefined;
        roomId = existingRoom?.id;
      } else if (req.sender_id === currentUserId) {
        relationship = 'pending_sent';
        requestId = req.id;
      } else {
        relationship = 'pending_received';
        requestId = req.id;
      }
    }

    return {
      user,
      relationship,
      requestId,
      roomId,
    };
  });
}

export function listFriendRequestsForUser(userId: string): {
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
} {
  const incomingRows = db
    .prepare(
      `SELECT fr.id, fr.sender_id, fr.receiver_id, fr.status, fr.created_at,
              u.id as u_id, u.username, u.display_name, u.avatar_color, u.avatar_url, u.bio, u.last_seen_at, u.created_at as u_created_at
       FROM friend_requests fr
       JOIN users u ON u.id = fr.sender_id
       WHERE fr.receiver_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
    )
    .all(userId) as Array<{
    id: string;
    sender_id: string;
    receiver_id: string;
    status: 'pending' | 'accepted';
    created_at: number;
    u_id: string;
    username: string;
    display_name: string;
    avatar_color: string;
    avatar_url: string | null;
    bio: string | null;
    last_seen_at: number | null;
    u_created_at: number;
  }>;

  const outgoingRows = db
    .prepare(
      `SELECT fr.id, fr.sender_id, fr.receiver_id, fr.status, fr.created_at,
              u.id as u_id, u.username, u.display_name, u.avatar_color, u.avatar_url, u.bio, u.last_seen_at, u.created_at as u_created_at
       FROM friend_requests fr
       JOIN users u ON u.id = fr.receiver_id
       WHERE fr.sender_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
    )
    .all(userId) as Array<{
    id: string;
    sender_id: string;
    receiver_id: string;
    status: 'pending' | 'accepted';
    created_at: number;
    u_id: string;
    username: string;
    display_name: string;
    avatar_color: string;
    avatar_url: string | null;
    bio: string | null;
    last_seen_at: number | null;
    u_created_at: number;
  }>;

  const mapItem = (r: (typeof incomingRows)[number]): FriendRequestItem => ({
    id: r.id,
    senderId: r.sender_id,
    receiverId: r.receiver_id,
    status: r.status,
    createdAt: r.created_at,
    user: {
      id: r.u_id,
      username: r.username,
      displayName: r.display_name,
      avatarColor: r.avatar_color,
      avatarUrl: r.avatar_url,
      bio: r.bio ?? '',
      lastSeenAt: r.last_seen_at,
      createdAt: r.u_created_at,
    },
  });

  return {
    incoming: incomingRows.map(mapItem),
    outgoing: outgoingRows.map(mapItem),
  };
}

export function getUserProfileData(targetUserId: string, viewerId: string): UserProfileData | null {
  const isSelf = targetUserId === viewerId;
  if (!isSelf && isUserBlockedBetween(targetUserId, viewerId)) {
    return null;
  }

  const targetUser = findPublicUserById(targetUserId);
  if (!targetUser) return null;

  const friendIds = getAcceptedFriendIds(targetUserId);
  const friendsCount = friendIds.length;

  let relationship: RelationshipStatus = 'none';
  let requestId: string | undefined;
  let roomId: string | undefined;

  if (isSelf) {
    relationship = 'accepted';
  } else {
    const req = findRequestBetween(viewerId, targetUserId);
    if (req) {
      if (req.status === 'accepted') {
        relationship = 'accepted';
        const existingRoom = db
          .prepare("SELECT id FROM rooms WHERE slug = ? AND type = 'dm'")
          .get(getDmSlug(viewerId, targetUserId)) as { id: string } | undefined;
        roomId = existingRoom?.id;
      } else if (req.sender_id === viewerId) {
        relationship = 'pending_sent';
        requestId = req.id;
      } else {
        relationship = 'pending_received';
        requestId = req.id;
      }
    }
  }

  const canSeeDetails = isSelf || relationship === 'accepted';
  const friends: PublicUser[] = [];
  if (canSeeDetails) {
    for (const fid of friendIds) {
      if (!isSelf && fid !== viewerId && isUserBlockedBetween(viewerId, fid)) continue;
      const f = findPublicUserById(fid);
      if (f) friends.push(f);
    }
    friends.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  let sharedImages: SharedProfileImage[] = [];
  let sharedImagesCount = 0;
  const now = Date.now();

  if (isSelf) {
    const myRooms = listRoomsForUser(viewerId).map((r) => r.id);
    if (myRooms.length > 0) {
      const placeholders = myRooms.map(() => '?').join(',');
      const countRow = db
        .prepare(
          `SELECT COUNT(*) as c FROM messages
           WHERE room_id IN (${placeholders})
             AND image_url IS NOT NULL
             AND view_once = 0
             AND (expires_at IS NULL OR expires_at > ?)`,
        )
        .get(...myRooms, now) as { c: number };
      sharedImagesCount = countRow.c;

      const imgRows = db
        .prepare(
          `SELECT id, image_url, created_at FROM messages
           WHERE room_id IN (${placeholders})
             AND image_url IS NOT NULL
             AND view_once = 0
             AND (expires_at IS NULL OR expires_at > ?)
           ORDER BY created_at DESC
           LIMIT 24`,
        )
        .all(...myRooms, now) as Array<{ id: string; image_url: string; created_at: number }>;
      sharedImages = imgRows.map((r) => ({
        id: r.id,
        imageUrl: r.image_url,
        createdAt: r.created_at,
      }));
    }
  } else if (relationship === 'accepted' && roomId) {
    const countRow = db
      .prepare(
        `SELECT COUNT(*) as c FROM messages
         WHERE room_id = ?
           AND image_url IS NOT NULL
           AND view_once = 0
           AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .get(roomId, now) as { c: number };
    sharedImagesCount = countRow.c;

    const imgRows = db
      .prepare(
        `SELECT id, image_url, created_at FROM messages
         WHERE room_id = ?
           AND image_url IS NOT NULL
           AND view_once = 0
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY created_at DESC
         LIMIT 24`,
      )
      .all(roomId, now) as Array<{ id: string; image_url: string; created_at: number }>;
    sharedImages = imgRows.map((r) => ({
      id: r.id,
      imageUrl: r.image_url,
      createdAt: r.created_at,
    }));
  }

  return {
    user: { ...targetUser, friendsCount },
    friendsCount,
    friends,
    sharedImagesCount,
    sharedImages,
    isSelf,
    relationship,
    requestId,
    roomId,
  };
}

export function getOrCreateDmRoom(userA: PublicUser, userB: PublicUser): {
  room: Room;
  created: boolean;
} {
  const pair = [userA.id, userB.id].sort();
  const slug = getDmSlug(userA.id, userB.id);

  const existing = db
    .prepare("SELECT id, name, slug, description, type, created_by, created_at FROM rooms WHERE slug = ? AND type = 'dm'")
    .get(slug) as DbRoomRow | undefined;

  if (existing) {
    return {
      created: false,
      room: {
        id: existing.id,
        name: userB.displayName,
        slug: existing.slug,
        description: `@${userB.username}`,
        type: 'dm',
        createdBy: existing.created_by,
        createdAt: existing.created_at,
        memberIds: pair,
        otherUser: userB,
      },
    };
  }

  const id = `dm-${crypto.randomUUID()}`;
  const createdAt = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO rooms (id, name, slug, description, type, created_by, created_at)
       VALUES (?, ?, ?, ?, 'dm', ?, ?)`,
    ).run(id, userB.displayName, slug, 'Direct message', userA.id, createdAt);

    const insertMember = db.prepare('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)');
    insertMember.run(id, userA.id);
    if (userB.id !== userA.id) {
      insertMember.run(id, userB.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    created: true,
    room: {
      id,
      name: userB.displayName,
      slug,
      description: `@${userB.username}`,
      type: 'dm',
      createdBy: userA.id,
      createdAt,
      memberIds: pair,
      otherUser: userB,
    },
  };
}

export function sendOrAutoAcceptFriendRequest(
  sender: PublicUser,
  targetUser: PublicUser,
):
  | { outcome: 'blocked' }
  | { outcome: 'already_friends'; room: Room }
  | { outcome: 'already_pending'; requestId: string }
  | { outcome: 'auto_accepted'; requestId: string; room: Room }
  | { outcome: 'created'; requestForTarget: FriendRequestItem; requestForSender: FriendRequestItem } {
  if (isUserBlockedBetween(sender.id, targetUser.id)) {
    return { outcome: 'blocked' };
  }

  const existing = findRequestBetween(sender.id, targetUser.id);
  if (existing) {
    if (existing.status === 'accepted') {
      const { room } = getOrCreateDmRoom(sender, targetUser);
      return { outcome: 'already_friends', room };
    }
    if (existing.sender_id === sender.id) {
      return { outcome: 'already_pending', requestId: existing.id };
    }
    const now = Date.now();
    db.prepare("UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE id = ?").run(
      now,
      existing.id,
    );
    const { room } = getOrCreateDmRoom(sender, targetUser);
    return { outcome: 'auto_accepted', requestId: existing.id, room };
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO friend_requests (id, sender_id, receiver_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
  ).run(id, sender.id, targetUser.id, now, now);

  return {
    outcome: 'created',
    requestForTarget: {
      id,
      senderId: sender.id,
      receiverId: targetUser.id,
      status: 'pending',
      createdAt: now,
      user: sender,
    },
    requestForSender: {
      id,
      senderId: sender.id,
      receiverId: targetUser.id,
      status: 'pending',
      createdAt: now,
      user: targetUser,
    },
  };
}

export function acceptFriendRequest(
  requestId: string,
  receiver: PublicUser,
): {
  ok: boolean;
  error?: string;
  sender?: PublicUser;
  room?: Room;
} {
  const row = db
    .prepare(
      'SELECT id, sender_id, receiver_id, status, created_at, updated_at FROM friend_requests WHERE id = ?',
    )
    .get(requestId) as DbFriendRequestRow | undefined;

  if (!row || row.receiver_id !== receiver.id) {
    return { ok: false, error: 'Friend request not found.' };
  }
  if (isUserBlockedBetween(row.sender_id, row.receiver_id)) {
    return { ok: false, error: 'Cannot accept request from blocked user.' };
  }

  const sender = findPublicUserById(row.sender_id);
  if (!sender) {
    return { ok: false, error: 'User no longer exists.' };
  }

  if (row.status !== 'accepted') {
    db.prepare("UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE id = ?").run(
      Date.now(),
      row.id,
    );
  }

  const { room } = getOrCreateDmRoom(receiver, sender);
  return { ok: true, sender, room };
}

export function removePendingFriendRequest(
  requestId: string,
  actorUserId: string,
): {
  removed: boolean;
  otherUserId?: string;
} {
  const row = db
    .prepare('SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = ?')
    .get(requestId) as DbFriendRequestRow | undefined;

  if (!row || row.status !== 'pending') {
    return { removed: false };
  }
  if (row.sender_id !== actorUserId && row.receiver_id !== actorUserId) {
    return { removed: false };
  }

  db.prepare("DELETE FROM friend_requests WHERE id = ? AND status = 'pending'").run(requestId);
  const otherUserId = row.sender_id === actorUserId ? row.receiver_id : row.sender_id;
  return { removed: true, otherUserId };
}

export function listRoomsForUser(userId: string): Room[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT r.id, r.name, r.slug, r.description, r.type, r.created_by, r.created_at
       FROM rooms r
       JOIN room_members rm ON rm.room_id = r.id
       WHERE r.type = 'dm' AND rm.user_id = ?
       ORDER BY r.created_at DESC`,
    )
    .all(userId) as unknown as DbRoomRow[];

  const rooms: Room[] = [];
  for (const row of rows) {
    const memberRows = db
      .prepare('SELECT user_id FROM room_members WHERE room_id = ?')
      .all(row.id) as Array<{ user_id: string }>;
    const memberIds = memberRows.map((m) => m.user_id);
    const otherId = memberIds.find((id) => id !== userId);
    if (!otherId) continue;
    if (!areUsersAcceptedFriends(userId, otherId)) continue;

    const otherUser = findPublicUserById(otherId);
    if (!otherUser) continue;

    rooms.push({
      id: row.id,
      name: otherUser.displayName,
      slug: row.slug,
      description: `@${otherUser.username}`,
      type: 'dm',
      createdBy: row.created_by,
      createdAt: row.created_at,
      memberIds,
      otherUser,
    });
  }

  return rooms;
}

export function getRoomById(roomId: string): DbRoomRow | undefined {
  return db
    .prepare('SELECT id, name, slug, description, type, created_by, created_at FROM rooms WHERE id = ?')
    .get(roomId) as DbRoomRow | undefined;
}

export function getRoomMemberIds(roomId: string): string[] {
  const rows = db
    .prepare('SELECT user_id FROM room_members WHERE room_id = ?')
    .all(roomId) as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}

export function canUserAccessRoom(roomId: string, userId: string): boolean {
  const room = getRoomById(roomId);
  if (!room || room.type !== 'dm') return false;
  const members = getRoomMemberIds(roomId);
  if (!members.includes(userId)) return false;
  const otherId = members.find((id) => id !== userId);
  if (!otherId) return false;
  return areUsersAcceptedFriends(userId, otherId);
}

export function purgeExpiredMessages(): Array<{
  roomId: string;
  messageId: string;
  imageUrl: string | null;
  audioUrl: string | null;
}> {
  const now = Date.now();
  const expired = db
    .prepare(
      'SELECT id, room_id, image_url, audio_url FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?',
    )
    .all(now) as Array<{
    id: string;
    room_id: string;
    image_url: string | null;
    audio_url: string | null;
  }>;

  if (expired.length === 0) return [];

  db.prepare('DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?').run(now);
  return expired.map((row) => ({
    roomId: row.room_id,
    messageId: row.id,
    imageUrl: row.image_url,
    audioUrl: row.audio_url,
  }));
}

export function listMessagesForRoom(roomId: string, limit = 100): ChatMessage[] {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const now = Date.now();
  const rows = db
    .prepare(
      `SELECT m.id, m.room_id, m.sender_id, m.sender_name, m.sender_display_name, m.sender_color,
              u.avatar_url as sender_avatar_url,
              m.content, m.image_url, m.audio_url, m.audio_duration_ms,
              m.reply_to_id, m.view_once, m.view_once_consumed, m.expires_at,
              m.delivered_at, m.seen_at, m.created_at
       FROM (
         SELECT id, room_id, sender_id, sender_name, sender_display_name, sender_color,
                content, image_url, audio_url, audio_duration_ms, reply_to_id,
                view_once, view_once_consumed, expires_at, delivered_at, seen_at, created_at
         FROM messages
         WHERE room_id = ? AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY created_at DESC
         LIMIT ?
       ) m
       LEFT JOIN users u ON u.id = m.sender_id
       ORDER BY m.created_at ASC`,
    )
    .all(roomId, now, safeLimit) as unknown as DbMessageRow[];

  return rows.map(mapMessageForViewer);
}

export function createMessage(params: {
  roomId: string;
  sender: PublicUser;
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  replyToId?: string | null;
  viewOnce?: boolean;
  disappearAfterMs?: number | null;
  deliveredAt?: number | null;
}): ChatMessage {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const imageUrl = params.imageUrl ?? null;
  const audioUrl = params.audioUrl ?? null;
  const audioDurationMs = params.audioDurationMs ?? null;
  const viewOnce = params.viewOnce ? 1 : 0;
  const expiresAt =
    params.disappearAfterMs && params.disappearAfterMs > 0
      ? createdAt + params.disappearAfterMs
      : null;

  let validReplyToId: string | null = null;
  if (params.replyToId) {
    const replyRow = db
      .prepare('SELECT id, room_id FROM messages WHERE id = ?')
      .get(params.replyToId) as { id: string; room_id: string } | undefined;
    if (replyRow && replyRow.room_id === params.roomId) {
      validReplyToId = replyRow.id;
    }
  }

  db.prepare(
    `INSERT INTO messages (
       id, room_id, sender_id, sender_name, sender_display_name, sender_color,
       content, image_url, audio_url, audio_duration_ms, reply_to_id,
       view_once, view_once_consumed, expires_at, delivered_at, seen_at, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, ?)`,
  ).run(
    id,
    params.roomId,
    params.sender.id,
    params.sender.username,
    params.sender.displayName,
    params.sender.avatarColor,
    params.content,
    imageUrl,
    audioUrl,
    audioDurationMs,
    validReplyToId,
    viewOnce,
    expiresAt,
    params.deliveredAt ?? null,
    createdAt,
  );

  return {
    id,
    roomId: params.roomId,
    senderId: params.sender.id,
    senderName: params.sender.username,
    senderDisplayName: params.sender.displayName,
    senderColor: params.sender.avatarColor,
    senderAvatarUrl: params.sender.avatarUrl ?? null,
    content: viewOnce ? '' : params.content,
    imageUrl: viewOnce ? null : imageUrl,
    audioUrl: viewOnce ? null : audioUrl,
    audioDurationMs: viewOnce ? null : audioDurationMs,
    replyToId: validReplyToId,
    replyTo: getReplySnippet(validReplyToId),
    viewOnce: Boolean(viewOnce),
    viewOnceConsumed: false,
    expiresAt,
    deliveredAt: params.deliveredAt ?? null,
    seenAt: null,
    reactions: [],
    createdAt,
  };
}

export function consumeViewOnceMessage(
  messageId: string,
  viewerId: string,
): {
  ok: boolean;
  error?: string;
  roomId?: string;
  imageUrl?: string | null;
  content?: string;
} {
  const row = db
    .prepare(
      `SELECT id, room_id, sender_id, content, image_url, view_once, view_once_consumed
       FROM messages WHERE id = ?`,
    )
    .get(messageId) as
    | {
        id: string;
        room_id: string;
        sender_id: string;
        content: string;
        image_url: string | null;
        view_once: number;
        view_once_consumed: number;
      }
    | undefined;

  if (!row || !canUserAccessRoom(row.room_id, viewerId)) {
    return { ok: false, error: 'Snap not found.' };
  }
  if (!row.view_once) {
    return { ok: false, error: 'This message is not a view-once snap.' };
  }
  if (row.sender_id === viewerId) {
    return { ok: false, error: 'Only the recipient can open a view-once snap.' };
  }
  if (row.view_once_consumed) {
    return { ok: false, error: 'This snap has already been opened.' };
  }

  const now = Date.now();
  const res = db
    .prepare(
      `UPDATE messages
       SET view_once_consumed = 1,
           delivered_at = COALESCE(delivered_at, ?),
           seen_at = COALESCE(seen_at, ?)
       WHERE id = ? AND view_once_consumed = 0`,
    )
    .run(now, now, messageId);

  if (res.changes === 0) {
    return { ok: false, error: 'This snap has already been opened.' };
  }

  return {
    ok: true,
    roomId: row.room_id,
    imageUrl: row.image_url,
    content: row.content,
  };
}

export function markRoomMessagesDelivered(roomId: string, recipientId: string): number | null {
  const now = Date.now();
  const res = db
    .prepare(
      `UPDATE messages
       SET delivered_at = ?
       WHERE room_id = ? AND sender_id != ? AND delivered_at IS NULL`,
    )
    .run(now, roomId, recipientId);
  return res.changes > 0 ? now : null;
}

export function markRoomMessagesSeen(roomId: string, viewerId: string): number | null {
  const now = Date.now();
  const res = db
    .prepare(
      `UPDATE messages
       SET delivered_at = COALESCE(delivered_at, ?),
           seen_at = ?
       WHERE room_id = ? AND sender_id != ? AND seen_at IS NULL`,
    )
    .run(now, now, roomId, viewerId);
  return res.changes > 0 ? now : null;
}

export function toggleMessageReaction(
  messageId: string,
  userId: string,
  emoji: string,
): { ok: boolean; roomId?: string; reactions?: MessageReaction[] } {
  const msg = db
    .prepare('SELECT id, room_id FROM messages WHERE id = ?')
    .get(messageId) as { id: string; room_id: string } | undefined;

  if (!msg || !canUserAccessRoom(msg.room_id, userId)) {
    return { ok: false };
  }

  const existing = db
    .prepare('SELECT 1 as ok FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
    .get(messageId, userId, emoji) as { ok: number } | undefined;

  if (existing) {
    db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(
      messageId,
      userId,
      emoji,
    );
  } else {
    db.prepare(
      'INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)',
    ).run(messageId, userId, emoji, Date.now());
  }

  return {
    ok: true,
    roomId: msg.room_id,
    reactions: getReactionsForMessage(messageId),
  };
}

export function deleteMessageByOwner(messageId: string, userId: string): {
  deleted: boolean;
  roomId?: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
} {
  const row = db
    .prepare('SELECT id, room_id, sender_id, image_url, audio_url FROM messages WHERE id = ?')
    .get(messageId) as
    | {
        id: string;
        room_id: string;
        sender_id: string;
        image_url: string | null;
        audio_url: string | null;
      }
    | undefined;

  if (!row || row.sender_id !== userId) {
    return { deleted: false };
  }

  db.prepare('DELETE FROM messages WHERE id = ? AND sender_id = ?').run(messageId, userId);
  return {
    deleted: true,
    roomId: row.room_id,
    imageUrl: row.image_url,
    audioUrl: row.audio_url,
  };
}
