import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, LogOut, Trash2, Users, X } from 'lucide-react';
import {
  createGroup,
  deleteGroup,
  leaveGroup,
  updateGroupMembers,
} from '../services/firestoreChat';
import type { GroupChat, PublicUser } from '../types/chat';
import { Avatar } from './Avatar';

interface CreateGroupModalProps {
  open: boolean;
  editingGroup: GroupChat | null;
  currentUser: PublicUser;
  friends: PublicUser[];
  onClose: () => void;
  onGroupSelected: (groupId: string | null) => void;
}

export function CreateGroupModal({
  open,
  editingGroup,
  currentUser,
  friends,
  onClose,
  onGroupSelected,
}: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(editingGroup);
  const isCreator = !editingGroup || editingGroup.createdBy === currentUser.id;

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingGroup) {
      setName(editingGroup.name);
      setSelectedIds(
        new Set(editingGroup.memberIds.filter((id) => id !== currentUser.id)),
      );
    } else {
      setName('');
      setSelectedIds(new Set());
    }
  }, [open, editingGroup, currentUser.id]);

  function toggleFriend(uid: string) {
    if (!isCreator) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else if (next.size < 29) {
        next.add(uid);
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isCreator) return;
    setSubmitting(true);
    setError(null);
    try {
      if (editingGroup) {
        await updateGroupMembers({
          groupId: editingGroup.id,
          name,
          creatorUid: currentUser.id,
          memberUids: Array.from(selectedIds),
        });
        onClose();
      } else {
        const created = await createGroup({
          name,
          creatorUid: currentUser.id,
          memberUids: Array.from(selectedIds),
        });
        onGroupSelected(created.id);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save group.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLeave() {
    if (!editingGroup || isCreator) return;
    setSubmitting(true);
    setError(null);
    try {
      await leaveGroup(editingGroup.id, currentUser.id, editingGroup.memberIds);
      onGroupSelected(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave group.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!editingGroup || !isCreator) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteGroup(editingGroup.id);
      onGroupSelected(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete group.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4"
          onClick={() => !submitting && onClose()}
          role="dialog"
          aria-modal="true"
          aria-label={isEditing ? 'Group settings' : 'Create group chat'}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Users className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    {isEditing ? 'Group Info & Members' : 'New Friends Group'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isEditing
                      ? `${editingGroup?.memberIds.length ?? 0} members`
                      : 'Add accepted friends to start a group chat'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                aria-label="Close modal"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="group-name-input"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Group Name
                </label>
                <input
                  id="group-name-input"
                  type="text"
                  maxLength={40}
                  disabled={!isCreator || submitting}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Weekend Plans, Study Squad..."
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 focus:outline-none disabled:bg-slate-50"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700">
                    {isCreator ? 'Select Friends' : 'Group Members'}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {selectedIds.size + 1}/30
                  </span>
                </div>

                {friends.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    Add at least 1 friend first before creating a group chat.
                  </p>
                ) : (
                  <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {friends.map((f) => {
                      const isSelected = selectedIds.has(f.id);
                      if (!isCreator && !isSelected) return null;
                      return (
                        <li key={f.id}>
                          <button
                            type="button"
                            disabled={!isCreator || submitting}
                            onClick={() => toggleFriend(f.id)}
                            className="flex w-full min-h-[48px] items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-default"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar
                                name={f.displayName}
                                color={f.avatarColor}
                                avatarUrl={f.avatarUrl}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900">
                                  {f.displayName}
                                </p>
                                <p className="truncate font-mono text-xs text-slate-500">
                                  @{f.username}
                                </p>
                              </div>
                            </div>
                            {isCreator && (
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                  isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {isSelected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                {isEditing && isCreator && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDelete()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Delete Group</span>
                  </button>
                )}
                {isEditing && !isCreator && (
                  <button
                    type="button"
                    disabled={submitting || (editingGroup?.memberIds.length ?? 0) <= 2}
                    onClick={() => void handleLeave()}
                    title={
                      (editingGroup?.memberIds.length ?? 0) <= 2
                        ? 'Minimum 2 members required'
                        : 'Leave group'
                    }
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Leave Group</span>
                  </button>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onClose}
                    className="min-h-[40px] rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                  {isCreator && (
                    <button
                      type="submit"
                      disabled={submitting || name.trim().length < 2 || selectedIds.size < 1}
                      className="min-h-[40px] rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submitting
                        ? 'Saving...'
                        : isEditing
                          ? 'Save Changes'
                          : 'Create Group'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
