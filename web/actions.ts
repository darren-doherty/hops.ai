// User-facing operations that combine the store with the API.
import { v7 as uuidv7 } from 'uuid';
import { api } from './api';
import { useStore } from './store';
import type { ActivityItemDto, MessageDto } from '../shared/types';

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
