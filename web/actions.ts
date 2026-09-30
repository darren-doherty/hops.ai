// User-facing operations that combine the store with the API.
import { v7 as uuidv7 } from 'uuid';
import { api, ApiError } from './api';
import { useStore } from './store';
import type { ActivityItemDto, MessageDto, NotificationDto } from '../shared/types';

const store = () => useStore.getState();

export async function loadChannel(channelId: string) {
  const messages = await api.messages(channelId);
  store().setChannelMessages(channelId, messages);
}

export async function loadThread(rootId: string) {
  const { root, replies } = await api.thread(rootId);
  store().setThread(root, replies);
}

export async function loadActivity() {
  store().setActivity(await api.activity());
}

/** Refetch whatever is on screen: after (re)connecting, realtime events may have been missed. */
export async function refreshCurrentView() {
  const { view, threadRootId } = store();
  await Promise.all([
    view?.kind === 'channel' ? loadChannel(view.channelId) : undefined,
    threadRootId ? loadThread(threadRootId) : undefined,
    loadActivity(), // always: keeps the unread badge right
  ]);
}

/**
 * Optimistic reaction toggle (§5.2): flip it locally at once, then replace it
 * with the server's absolute summary, or roll back if the request fails.
 */
export function toggleReaction(messageId: string, emoji: string) {
  const me = store().me!;
  const message = store().messagesById[messageId];
  if (!message) return;
  const previous = message.reactions;
  const existing = previous.find((r) => r.emoji === emoji);
  const on = !existing?.userIds.includes(me.id);

  const next = on
    ? existing
      ? previous.map((r) => (r.emoji === emoji ? { ...r, userIds: [...r.userIds, me.id] } : r))
      : [...previous, { emoji, userIds: [me.id] }]
    : previous
        .map((r) => (r.emoji === emoji ? { ...r, userIds: r.userIds.filter((u) => u !== me.id) } : r))
        .filter((r) => r.userIds.length > 0);

  store().setReactions(messageId, next);
  api
    .react(messageId, emoji, on)
    .then((reactions) => store().setReactions(messageId, reactions))
    .catch(() => store().setReactions(messageId, previous));
}

/**
 * Optimistic edit with a version check: shows the new text at once. If
 * someone (e.g. another tab) edited first, the server's 409 carries the
 * current message, which replaces ours. Resolves to a note for the user, or null.
 */
export async function editMessage(messageId: string, body: string): Promise<string | null> {
  const previous = store().messagesById[messageId];
  if (!previous || previous.body === body) return null;
  store().setMessageLocal({ ...previous, body, editedAt: new Date().toISOString() });
  try {
    store().upsertMessage(await api.editMessage(messageId, { body, expectedVersion: previous.version }));
    return null;
  } catch (err) {
    store().setMessageLocal(previous);
    const current = (err as ApiError).body as { current?: MessageDto } | undefined;
    if (err instanceof ApiError && err.status === 409 && current?.current) {
      store().upsertMessage(current.current);
      return 'This message changed elsewhere, so your edit was not saved. Showing the latest version.';
    }
    return "Couldn't save your edit. Please try again.";
  }
}

/** Optimistic delete: shows the tombstone at once, restores the message if the request fails. */
export async function deleteMessage(messageId: string): Promise<string | null> {
  const previous = store().messagesById[messageId];
  if (!previous) return null;
  store().setMessageLocal({ ...previous, status: 'deleted', body: '', reactions: [] });
  try {
    store().upsertMessage(await api.deleteMessage(messageId));
    return null;
  } catch {
    store().setMessageLocal(previous);
    return "Couldn't delete the message. Please try again.";
  }
}

/** Mark read, then take the user to the message in context: the thread for replies, the channel otherwise. */
export function openActivityItem(item: ActivityItemDto) {
  if (!item.readAt) {
    store().markActivityRead(item.id);
    api.markActivityRead(item.id).catch(() => void loadActivity());
  }
  store().setView({ kind: 'channel', channelId: item.channelId });
  if (item.parentId) store().openThread(item.parentId);
  store().setHighlight(item.messageId);
}

/** Follow a notification's deep link: the channel, plus the thread for replies. */
export function openNotification(notification: NotificationDto) {
  const { channelId, messageId, parentId } = notification.link;
  store().dismissToast(notification.id);
  store().setView({ kind: 'channel', channelId });
  if (parentId) store().openThread(parentId);
  store().setHighlight(messageId);
}

export function markAllActivityRead() {
  store().markAllActivityRead();
  api.markAllActivityRead().catch(() => void loadActivity());
}

/**
 * Optimistic send (§5.2): the client generates the id, shows the message
 * immediately as pending, and the server's copy (HTTP response or realtime
 * echo, whichever lands first) replaces it. Retrying re-sends the same id, and
 * the server treats that as the same message.
 */
export function sendMessage(channelId: string, body: string, parentId: string | null = null) {
  const me = store().me!;
  const pending: MessageDto = {
    id: uuidv7(),
    channelId,
    authorId: me.id,
    parentId,
    body,
    status: 'active',
    version: 0, // any server copy (version >= 1) supersedes it
    createdAt: new Date().toISOString(),
    editedAt: null,
    replyCount: 0,
    lastReplyAt: null,
    reactions: [],
  };
  store().addPending(pending);
  void post(pending);
}

export function retrySend(id: string) {
  const message = store().messagesById[id];
  if (!message) return;
  store().setSendState(id, 'pending');
  void post(message);
}

async function post(message: MessageDto) {
  try {
    const saved = await api.postMessage(message.channelId, {
      id: message.id,
      body: message.body,
      parentId: message.parentId,
    });
    store().upsertMessage(saved);
  } catch {
    store().setSendState(message.id, 'failed');
  }
}
