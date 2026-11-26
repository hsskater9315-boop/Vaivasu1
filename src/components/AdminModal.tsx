import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Check,
  Database,
  Megaphone,
  MessageSquare,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '../supabase';
import type { PublicUser, Room } from '../types/chat';
import { Avatar, VerifiedBadge } from './Avatar';
import { getPairInfo, isDeveloperUser } from '../services/firestoreChat';

interface AdminModalProps {
  open: boolean;
  currentUser: PublicUser;
  onClose: () => void;
  onOpenChat: (roomId: string) => void;
  onSelectProfile: (userId: string) => void;
}

interface AppStats {
  totalUsers: number;
  totalRooms: number;
  totalMessages: number;
  totalStories: number;
}

export function AdminModal({
  open,
  currentUser,
  onClose,
  onOpenChat,
  onSelectProfile,
}: AdminModalProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'broadcast' | 'users'>('stats');
  const [stats, setStats] = useState<AppStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [usersList, setUsersList] = useState<PublicUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  
  // Broadcast states
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  // Sync feed states
  const [syncingFeed, setSyncingFeed] = useState(false);
  const [syncFeedMessage, setSyncFeedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void loadStats();
    void loadUsers();
  }, [open]);

  async function loadStats() {
    setLoadingStats(true);
    try {
      const [usersRes, roomsRes, msgRes, storyRes] = await Promise.all([
        supabase.from('public_users').select('id', { count: 'exact', head: true }),
        supabase.from('rooms').select('id', { count: 'exact', head: true }),
        supabase.from('messages').select('id', { count: 'exact', head: true }),
        supabase.from('stories').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        totalUsers: usersRes.count ?? 0,
        totalRooms: roomsRes.count ?? 0,
        totalMessages: msgRes.count ?? 0,
        totalStories: storyRes.count ?? 0,
      });
    } catch (err) {
      console.warn('Failed to load admin stats:', err);
    } finally {
      setLoadingStats(false);
    }
  }

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const { data } = await supabase
        .from('public_users')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        setUsersList(
          data.map((d) => ({
            id: String(d.id),
            username: String(d.username),
            displayName: String(d.display_name || d.username),
            avatarColor: String(d.avatar_color || '#2563EB'),
            avatarUrl: d.avatar_url || null,
            bio: d.bio || '',
            online: Boolean(d.online),
            lastSeenAt: Number(d.last_seen_at || 0),
            createdAt: new Date(String(d.created_at)).getTime(),
          })),
        );
      }
    } catch (err) {
      console.warn('Failed to load users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function handleSendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    const content = broadcastText.trim();
    if (!content) return;

    setBroadcasting(true);
    setBroadcastSuccess(null);
    setBroadcastError(null);

    try {
      // Fetch all public users except current admin
      const { data: allUsers } = await supabase
        .from('public_users')
        .select('id, username')
        .neq('id', currentUser.id);

      if (!allUsers || allUsers.length === 0) {
        setBroadcastError('No other users found to broadcast to.');
        return;
      }

      const now = Date.now();
      let sentCount = 0;

      for (const u of allUsers) {
        const { pairId, userA, userB } = getPairInfo(currentUser.id, u.id);
        
        // Ensure room exists
        await supabase.from('rooms').upsert({
          id: pairId,
          type: 'dm',
          user_a: userA,
          user_b: userB,
          created_by: currentUser.id,
          user_a_last_delivered_at: now,
          user_a_last_seen_at: now,
          user_b_last_delivered_at: now,
          user_b_last_seen_at: now,
          typing_user_a_until: 0,
          typing_user_b_until: 0,
          last_message_at: now,
        });

        // Send official broadcast message
        await supabase.from('messages').insert({
          id: `msg_broadcast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          room_id: pairId,
          sender_id: currentUser.id,
          sender_username: currentUser.username,
          sender_display_name: currentUser.displayName,
          content: `📢 [Admin Broadcast from @${currentUser.username}]:\n${content}`,
          data_url: null,
          created_at_ms: now,
        });
        sentCount++;
      }

      setBroadcastSuccess(`Broadcast successfully sent to ${sentCount} users!`);
      setBroadcastText('');
      void loadStats();
    } catch (err) {
      setBroadcastError(err instanceof Error ? err.message : 'Broadcast failed.');
    } finally {
      setBroadcasting(false);
    }
  }

  async function handleSyncAllUsersFeed() {
    setSyncingFeed(true);
    setSyncFeedMessage(null);
    try {
      const { data: allUsers } = await supabase
        .from('public_users')
        .select('*')
        .neq('id', currentUser.id);

      if (!allUsers) {
        setSyncFeedMessage('No users found.');
        return;
      }

      const now = Date.now();
      let connectedCount = 0;

      for (const u of allUsers) {
        const { pairId, userA, userB } = getPairInfo(currentUser.id, u.id);

        // Accept friend request
        await supabase.from('friend_requests').upsert({
          id: pairId,
          sender_id: currentUser.id,
          receiver_id: u.id,
          status: 'accepted',
        });

        // Ensure room exists
        await supabase.from('rooms').upsert({
          id: pairId,
          type: 'dm',
          user_a: userA,
          user_b: userB,
          created_by: currentUser.id,
          user_a_last_delivered_at: now,
          user_a_last_seen_at: now,
          user_b_last_delivered_at: now,
          user_b_last_seen_at: now,
          typing_user_a_until: 0,
          typing_user_b_until: 0,
          last_message_at: now,
        });

        connectedCount++;
      }

      setSyncFeedMessage(`Successfully injected @${currentUser.username} into ${connectedCount} users' feeds!`);
      void loadStats();
    } catch (err) {
      setSyncFeedMessage(err instanceof Error ? err.message : 'Feed sync failed.');
    } finally {
      setSyncingFeed(false);
    }
  }

  if (!open) return null;

  const filteredUsers = usersList.filter(
    (u) =>
      u.displayName.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchUserQuery.toLowerCase()),
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          className="flex h-[88vh] max-h-[720px] w-full max-w-2xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 id="admin-modal-title" className="text-base font-bold">
                    ForVasu Admin &amp; Developer Console
                  </h2>
                  <VerifiedBadge title="Verified Admin & Lead Developer" />
                </div>
                <p className="text-xs text-slate-300">
                  Logged in as <span className="font-semibold text-white">@{currentUser.username}</span> (Lead Developer)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 px-6">
            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-semibold transition-colors ${
                activeTab === 'stats'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database className="h-4 w-4" aria-hidden="true" />
              <span>Overview &amp; Stats</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('broadcast')}
              className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-semibold transition-colors ${
                activeTab === 'broadcast'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Megaphone className="h-4 w-4" aria-hidden="true" />
              <span>Broadcast Announcement</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-semibold transition-colors ${
                activeTab === 'users'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              <span>Users Directory ({usersList.length})</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'stats' && (
              <div className="space-y-6">
                {/* Developer Info Card */}
                <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={currentUser.displayName}
                        color={currentUser.avatarColor}
                        avatarUrl={currentUser.avatarUrl}
                        size="md"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-slate-900">{currentUser.displayName}</p>
                          <VerifiedBadge />
                        </div>
                        <p className="text-xs text-blue-700 font-medium">
                          @{currentUser.username} · Official Lead Developer &amp; Super Admin
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                      <span>Operational</span>
                    </span>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Live App Metrics
                    </h3>
                    <button
                      type="button"
                      onClick={() => void loadStats()}
                      disabled={loadingStats}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <RefreshCw className={`h-3 w-3 ${loadingStats ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                      <p className="text-xs font-medium text-slate-500">Registered Users</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                        {stats?.totalUsers ?? '...'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                      <p className="text-xs font-medium text-slate-500">Chat Rooms</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                        {stats?.totalRooms ?? '...'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                      <p className="text-xs font-medium text-slate-500">Total Messages</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                        {stats?.totalMessages ?? '...'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                      <p className="text-xs font-medium text-slate-500">Active Stories</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                        {stats?.totalStories ?? '...'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Developer Feed Sync Tool */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                        <Radio className="h-4 w-4 text-blue-600" aria-hidden="true" />
                        <span>Feed Injection Sync</span>
                      </h4>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        Clicking this links your account (@{currentUser.username}) to all registered users&apos; chat feeds so anyone can message you directly.
                      </p>
                      {syncFeedMessage && (
                        <p className="mt-2 text-xs font-medium text-emerald-700">
                          {syncFeedMessage}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={syncingFeed}
                      onClick={() => void handleSyncAllUsersFeed()}
                      className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-60 transition-colors"
                    >
                      {syncingFeed ? 'Syncing...' : 'Sync to All Feeds'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'broadcast' && (
              <form onSubmit={handleSendBroadcast} className="space-y-4">
                <div>
                  <label htmlFor="broadcast-message" className="block text-xs font-semibold text-slate-700">
                    Official Admin Announcement Message
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    This message will be broadcast to every registered user&apos;s inbox from your verified account.
                  </p>
                  <textarea
                    id="broadcast-message"
                    rows={5}
                    required
                    value={broadcastText}
                    onChange={(e) => setBroadcastText(e.target.value)}
                    placeholder="Type your official announcement here (e.g. Welcome to ForVasu! New call and story features are live now...)"
                    className="mt-2 block w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
                  />
                </div>

                {broadcastSuccess && (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{broadcastSuccess}</span>
                  </div>
                )}

                {broadcastError && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                    <span>{broadcastError}</span>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={broadcasting || !broadcastText.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 transition-colors"
                  >
                    <Megaphone className="h-4 w-4" aria-hidden="true" />
                    <span>{broadcasting ? 'Broadcasting...' : 'Send Broadcast to All Users'}</span>
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'users' && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchUserQuery}
                    onChange={(e) => setSearchUserQuery(e.target.value)}
                    placeholder="Search users by name or username..."
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                {loadingUsers ? (
                  <p className="text-center py-8 text-xs text-slate-500">Loading user directory...</p>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {filteredUsers.length === 0 ? (
                      <p className="p-4 text-center text-xs text-slate-500">No users found.</p>
                    ) : (
                      filteredUsers.map((u) => {
                        const isThisDev = isDeveloperUser(u.username);
                        return (
                          <div
                            key={u.id}
                            className="flex items-center justify-between p-3 hover:bg-slate-50/80 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar
                                name={u.displayName}
                                color={u.avatarColor}
                                avatarUrl={u.avatarUrl}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                  <p className="text-xs font-semibold text-slate-900 truncate">
                                    {u.displayName}
                                  </p>
                                  {isThisDev && <VerifiedBadge size="sm" />}
                                </div>
                                <p className="text-[11px] text-slate-500 truncate">
                                  @{u.username} · Joined {new Date(u.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectProfile(u.id);
                                  onClose();
                                }}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                              >
                                View Profile
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
