import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  MessageSquareText,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  createStory,
  deleteStory,
  fetchStoryViews,
  markStoryViewed,
  MAX_MEDIA_DATA_URL_LENGTH,
  updateMyStatusNote,
} from '../services/firestoreChat';
import type { PublicUser, StoryItem, StoryViewItem } from '../types/chat';
import { Avatar } from './Avatar';

interface StoriesAndNotesStripProps {
  currentUser: PublicUser;
  friends: PublicUser[];
  stories: StoryItem[];
  onOpenFriendChat?: (friendId: string) => void;
}

function formatTimeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function StoriesAndNotesStrip({
  currentUser,
  friends,
  stories,
  onOpenFriendChat,
}: StoriesAndNotesStripProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTab, setComposerTab] = useState<'note' | 'story'>('note');
  const [noteDraft, setNoteDraft] = useState('');
  const [storyImageUrl, setStoryImageUrl] = useState<string | null>(null);
  const [storyCaption, setStoryCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewerStories, setViewerStories] = useState<StoryItem[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerAuthor, setViewerAuthor] = useState<PublicUser | null>(null);
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(() => new Set());
  const [ownViews, setOwnViews] = useState<StoryViewItem[]>([]);
  const [showViewersList, setShowViewersList] = useState(false);

  const [notePreviewUser, setNotePreviewUser] = useState<PublicUser | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const now = Date.now();
  const userById = useMemo(() => {
    const map = new Map<string, PublicUser>();
    map.set(currentUser.id, currentUser);
    for (const f of friends) map.set(f.id, f);
    return map;
  }, [currentUser, friends]);

  const storiesByAuthor = useMemo(() => {
    const map = new Map<string, StoryItem[]>();
    for (const s of stories) {
      if (s.expiresAtMs <= now) continue;
      const list = map.get(s.authorId) ?? [];
      list.push(s);
      map.set(s.authorId, list);
    }
    return map;
  }, [stories, now]);

  const myActiveNote =
    currentUser.statusNote &&
    currentUser.statusNoteExpiresAtMs &&
    currentUser.statusNoteExpiresAtMs > now
      ? currentUser.statusNote
      : '';

  const myStories = storiesByAuthor.get(currentUser.id) ?? [];

  const friendItems = useMemo(() => {
    return friends
      .map((f) => {
        const fStories = storiesByAuthor.get(f.id) ?? [];
        const hasActiveNote =
          Boolean(f.statusNote) && Boolean(f.statusNoteExpiresAtMs && f.statusNoteExpiresAtMs > now);
        return {
          user: f,
          stories: fStories,
          note: hasActiveNote ? f.statusNote || '' : '',
        };
      })
      .filter((item) => item.stories.length > 0 || item.note.length > 0);
  }, [friends, storiesByAuthor, now]);

  const activeStory = viewerStories ? viewerStories[viewerIndex] ?? null : null;

  useEffect(() => {
    if (!activeStory) {
      setOwnViews([]);
      setShowViewersList(false);
      return;
    }
    if (activeStory.authorId === currentUser.id) {
      void fetchStoryViews(activeStory.id).then(setOwnViews);
    } else {
      setOwnViews([]);
      setShowViewersList(false);
      if (!viewedStoryIds.has(activeStory.id)) {
        setViewedStoryIds((prev) => new Set(prev).add(activeStory.id));
        void markStoryViewed(activeStory.id, currentUser.id);
      }
    }
  }, [activeStory, currentUser.id, viewedStoryIds]);

  function openComposer(tab: 'note' | 'story') {
    setComposerTab(tab);
    setNoteDraft(myActiveNote);
    setStoryImageUrl(null);
    setStoryCaption('');
    setError(null);
    setComposerOpen(true);
  }

  function openStoryViewer(author: PublicUser, authorStories: StoryItem[]) {
    if (authorStories.length === 0) return;
    setViewerAuthor(author);
    setViewerStories(authorStories);
    setViewerIndex(0);
    setShowViewersList(false);
  }

  function handleStoryFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Please pick a PNG, JPG, WEBP, or GIF image.');
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
      if (file.type === 'image/gif' && rawUrl.length <= MAX_MEDIA_DATA_URL_LENGTH) {
        setStoryImageUrl(rawUrl);
        setError(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const compress = (maxDim: number, q: number): string | null => {
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
          return canvas.toDataURL('image/jpeg', q);
        };
        let out = compress(1080, 0.8);
        if (out && out.length > MAX_MEDIA_DATA_URL_LENGTH) out = compress(900, 0.7);
        if (out && out.length > MAX_MEDIA_DATA_URL_LENGTH) out = compress(720, 0.6);
        if (!out || out.length > MAX_MEDIA_DATA_URL_LENGTH) {
          setError('Photo is too large after compression.');
          return;
        }
        setStoryImageUrl(out);
        setError(null);
      };
      img.onerror = () => setError('Could not load image.');
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveNote() {
    setSaving(true);
    setError(null);
    try {
      await updateMyStatusNote(currentUser.id, noteDraft);
      setComposerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update note.');
    } finally {
      setSaving(false);
    }
  }

  async function handleClearNote() {
    setSaving(true);
    setError(null);
    try {
      await updateMyStatusNote(currentUser.id, '');
      setNoteDraft('');
      setComposerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear note.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishStory() {
    if (!storyImageUrl) {
      setError('Pick a photo for your 24h story.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createStory({
        authorId: currentUser.id,
        friendIds: friends.map((f) => f.id),
        imageUrl: storyImageUrl,
        caption: storyCaption,
      });
      setComposerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post story.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCurrentStory() {
    if (!activeStory || activeStory.authorId !== currentUser.id) return;
    const idToDelete = activeStory.id;
    try {
      await deleteStory(idToDelete);
      if (viewerStories && viewerStories.length > 1) {
        const remaining = viewerStories.filter((s) => s.id !== idToDelete);
        setViewerStories(remaining);
        setViewerIndex((idx) => Math.min(idx, remaining.length - 1));
      } else {
        setViewerStories(null);
      }
    } catch {
      // Ignore error
    }
  }

  return (
    <div className="border-b border-slate-200/80 px-3.5 py-3 bg-white">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
          Stories &amp; Notes
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openComposer('note')}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
          >
            {myActiveNote ? 'Edit Note' : '+ Note'}
          </button>
          <button
            type="button"
            onClick={() => openComposer('story')}
            className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-[#FFEC1F] hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            + Story
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 overflow-x-auto no-scrollbar pb-0.5 pt-1">
        {/* Current user tile */}
        <div className="flex w-16 shrink-0 flex-col items-center">
          <button
            type="button"
            onClick={() => {
              if (myStories.length > 0) {
                openStoryViewer(currentUser, myStories);
              } else {
                openComposer('story');
              }
            }}
            className="group relative flex items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            title={myStories.length > 0 ? 'View your 24h story' : 'Add 24h story or status note'}
          >
            <div
              className={`rounded-2xl p-[2.5px] transition-transform group-hover:scale-[1.03] ${
                myStories.length > 0
                  ? 'bg-gradient-to-tr from-[#FFEC1F] via-amber-500 to-blue-600'
                  : 'bg-slate-200'
              }`}
            >
              <div className="rounded-[13px] bg-white p-[2px]">
                <Avatar
                  name={currentUser.displayName}
                  color={currentUser.avatarColor}
                  avatarUrl={currentUser.avatarUrl}
                  size="md"
                />
              </div>
            </div>
            <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[#FFEC1F] shadow-xs">
              <Plus className="h-3 w-3 stroke-[2.75]" aria-hidden="true" />
            </span>
          </button>
          <span className="mt-1.5 max-w-full truncate text-[11px] font-semibold text-slate-800">
            My Story
          </span>
          {myActiveNote && (
            <button
              type="button"
              onClick={() => openComposer('note')}
              title={myActiveNote}
              className="mt-0.5 max-w-full truncate text-[10px] font-medium text-blue-600 hover:underline"
            >
              “{myActiveNote}”
            </button>
          )}
        </div>

        {/* Friends with active stories or notes */}
        {friendItems.map((item) => {
          const hasStories = item.stories.length > 0;
          const allSeen =
            hasStories && item.stories.every((s) => viewedStoryIds.has(s.id));

          return (
            <div key={item.user.id} className="flex w-16 shrink-0 flex-col items-center">
              <button
                type="button"
                onClick={() => {
                  if (hasStories) {
                    openStoryViewer(item.user, item.stories);
                  } else {
                    setNotePreviewUser(item.user);
                  }
                }}
                className="group relative flex items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                title={
                  hasStories
                    ? `View ${item.user.displayName}'s story`
                    : `${item.user.displayName}'s note`
                }
              >
                <div
                  className={`rounded-2xl p-[2.5px] transition-transform group-hover:scale-[1.03] ${
                    hasStories
                      ? allSeen
                        ? 'bg-slate-300'
                        : 'bg-gradient-to-tr from-[#FFEC1F] via-amber-500 to-blue-600'
                      : 'bg-slate-200'
                  }`}
                >
                  <div className="rounded-[13px] bg-white p-[2px]">
                    <Avatar
                      name={item.user.displayName}
                      color={item.user.avatarColor}
                      avatarUrl={item.user.avatarUrl}
                      size="md"
                    />
                  </div>
                </div>
              </button>
              <span className="mt-1.5 max-w-full truncate text-[11px] font-medium text-slate-700">
                {item.user.displayName.split(' ')[0]}
              </span>
              {item.note && (
                <button
                  type="button"
                  onClick={() => setNotePreviewUser(item.user)}
                  title={item.note}
                  className="mt-0.5 max-w-full truncate text-[10px] font-medium text-slate-500 hover:text-slate-900"
                >
                  “{item.note}”
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Note & Story Composer Modal */}
      <AnimatePresence>
        {composerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4"
            onClick={() => !saving && setComposerOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Share 24-hour note or story"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 mb-4">
                <h2 className="font-display text-base font-bold text-slate-900">
                  24h Status &amp; Story
                </h2>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setComposerOpen(false)}
                  aria-label="Close modal"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setComposerTab('note');
                    setError(null);
                  }}
                  className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all ${
                    composerTab === 'note'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Status Note</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposerTab('story');
                    setError(null);
                  }}
                  className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all ${
                    composerTab === 'story'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Photo Story</span>
                </button>
              </div>

              {error && (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              {composerTab === 'note' ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Share a quick 60-character status note visible to your friends for 24 hours.
                  </p>
                  <div>
                    <input
                      type="text"
                      maxLength={60}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="What's on your mind right now?"
                      className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:outline-none"
                    />
                    <div className="mt-1 flex justify-end font-mono text-[11px] text-slate-400 tabular-nums">
                      {noteDraft.length}/60
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    {myActiveNote && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleClearNote()}
                        className="min-h-[40px] rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Clear Note
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSaveNote()}
                      className="min-h-[40px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {saving ? 'Saving...' : 'Save Note'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Post a photo story that only your accepted friends can view for 24 hours.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleStoryFileChange}
                    className="hidden"
                  />
                  {storyImageUrl ? (
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
                      <img
                        src={storyImageUrl}
                        alt="Story preview"
                        className="max-h-60 w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setStoryImageUrl(null)}
                        aria-label="Remove selected story photo"
                        className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/80 text-white hover:bg-slate-900"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full min-h-[124px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 p-4 text-xs font-semibold text-slate-600 hover:border-slate-900 hover:bg-slate-100/70 transition-colors"
                    >
                      <Camera className="h-6 w-6 text-slate-900" aria-hidden="true" />
                      <span>Choose a photo for your story</span>
                    </button>
                  )}

                  <input
                    type="text"
                    maxLength={160}
                    value={storyCaption}
                    onChange={(e) => setStoryCaption(e.target.value)}
                    placeholder="Add a caption (optional)"
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:outline-none"
                  />

                  <div className="flex items-center justify-end gap-2 pt-1">
                    {myStories.length > 0 && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setComposerOpen(false);
                          openStoryViewer(currentUser, myStories);
                        }}
                        className="min-h-[40px] rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        View My Story ({myStories.length})
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={saving || !storyImageUrl}
                      onClick={() => void handlePublishStory()}
                      className="min-h-[40px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-[#FFEC1F] hover:bg-slate-800 disabled:opacity-50"
                    >
                      {saving ? 'Posting...' : 'Share Story'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friend Status Note Preview Modal */}
      <AnimatePresence>
        {notePreviewUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4"
            onClick={() => setNotePreviewUser(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Friend status note"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-xs rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <Avatar
                  name={notePreviewUser.displayName}
                  color={notePreviewUser.avatarColor}
                  avatarUrl={notePreviewUser.avatarUrl}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {notePreviewUser.displayName}
                  </p>
                  <p className="truncate font-mono text-xs text-slate-500">
                    @{notePreviewUser.username}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-800">
                {notePreviewUser.statusNote}
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNotePreviewUser(null)}
                  className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                {onOpenFriendChat && (
                  <button
                    type="button"
                    onClick={() => {
                      const uid = notePreviewUser.id;
                      setNotePreviewUser(null);
                      onOpenFriendChat(uid);
                    }}
                    className="min-h-[38px] rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Reply in Chat
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-Screen Story Viewer */}
      <AnimatePresence>
        {viewerStories && activeStory && viewerAuthor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-3 sm:p-6"
            onClick={() => setViewerStories(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Story viewer"
          >
            <div
              className="relative flex h-full max-h-[780px] w-full max-w-md flex-col justify-between overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 text-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top progress & header */}
              <div className="z-10 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4">
                <div className="flex items-center gap-1 mb-3">
                  {viewerStories.map((s, idx) => (
                    <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                      <div
                        className={`h-full transition-all ${
                          idx <= viewerIndex ? 'w-full bg-[#FFEC1F]' : 'w-0'
                        }`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      name={viewerAuthor.displayName}
                      color={viewerAuthor.avatarColor}
                      avatarUrl={viewerAuthor.avatarUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{viewerAuthor.displayName}</p>
                      <p className="text-[11px] text-slate-300">
                        {formatTimeAgo(activeStory.createdAtMs)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {activeStory.authorId === currentUser.id && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteCurrentStory()}
                        aria-label="Delete story"
                        title="Delete story"
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-red-300 hover:bg-red-500/20"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setViewerStories(null)}
                      aria-label="Close story viewer"
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Story Image + Left/Right navigation */}
              <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
                <img
                  src={activeStory.imageUrl}
                  alt={activeStory.caption || `Story by ${viewerAuthor.displayName}`}
                  referrerPolicy="no-referrer"
                  className="max-h-full max-w-full object-contain"
                />
                {viewerIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setViewerIndex((i) => Math.max(0, i - 1))}
                    aria-label="Previous story"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/80"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                )}
                {viewerIndex < viewerStories.length - 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setViewerIndex((i) => Math.min(viewerStories.length - 1, i + 1))
                    }
                    aria-label="Next story"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/80"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Caption & Viewers Footer */}
              <div className="z-10 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4">
                {activeStory.caption && (
                  <p className="mb-2 text-center text-sm text-white leading-relaxed">
                    {activeStory.caption}
                  </p>
                )}

                {activeStory.authorId === currentUser.id && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowViewersList((v) => !v)}
                      className="mx-auto flex min-h-[36px] items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        Seen by {ownViews.filter((v) => v.viewerId !== currentUser.id).length}
                      </span>
                    </button>

                    {showViewersList && (
                      <div className="mt-2.5 max-h-36 overflow-y-auto rounded-2xl border border-white/15 bg-slate-900/95 p-3 space-y-1.5">
                        {ownViews.filter((v) => v.viewerId !== currentUser.id).length === 0 ? (
                          <p className="text-center text-xs text-slate-400">No friend views yet</p>
                        ) : (
                          ownViews
                            .filter((v) => v.viewerId !== currentUser.id)
                            .map((v) => {
                              const u = userById.get(v.viewerId);
                              return (
                                <div
                                  key={v.viewerId}
                                  className="flex items-center justify-between gap-2 text-xs"
                                >
                                  <span className="truncate font-medium text-slate-100">
                                    {u?.displayName || 'Friend'}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    {formatTimeAgo(v.viewedAt)}
                                  </span>
                                </div>
                              );
                            })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
