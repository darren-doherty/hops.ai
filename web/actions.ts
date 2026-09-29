// User-facing operations that combine the store with the API.
import { v7 as uuidv7 } from 'uuid';
import { api } from './api';
import { useStore } from './store';
import type { MessageDto } from '../shared/types';

const store = () => useStore.getState();

export async function loadChannel(channelId: string) {
  const messages = await api.messages(channelId);
  store().setChannelMessages(channelId, messages);
}

/** Refetch whatever is on screen: after (re)connecting, realtime events may have been missed. */
export async function refreshCurrentView() {
  const view = store().view;
  if (view?.kind === 'channel') await loadChannel(view.channelId);
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
