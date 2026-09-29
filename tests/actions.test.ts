// Optimistic actions and their rollbacks (§5.2), with the HTTP API mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageDto } from '../shared/types';

const api = vi.hoisted(() => ({
  react: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
}));

vi.mock('../web/api', () => {
  class ApiError extends Error {
    constructor(public status: number, message: string, public body?: unknown) {
      super(message);
    }
  }
  return { api, ApiError, currentHandle: 'alice' };
});

const { useStore } = await import('../web/store');
const { toggleReaction, editMessage, deleteMessage } = await import('../web/actions');
const { ApiError } = await import('../web/api');

const ME = { id: 'me', handle: 'alice', name: 'Alice Chen', color: '#000' };
const s = () => useStore.getState();

function msg(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 'm1', channelId: 'c1', authorId: 'me', parentId: null, body: 'original', status: 'active', version: 1,
    createdAt: '2026-09-29T10:00:00.000Z', editedAt: null, replyCount: 0, lastReplyAt: null, reactions: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  useStore.setState({ me: ME, messagesById: {}, channelOrder: {}, threadOrder: {}, sendState: {} });
  s().setChannelMessages('c1', [msg({ reactions: [{ emoji: '👍', userIds: ['bob'] }] })]);
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('toggleReaction', () => {
  it('shows my reaction immediately, then adopts the server summary', async () => {
    let resolve!: (v: unknown) => void;
    api.react.mockReturnValue(new Promise((r) => (resolve = r)));
    toggleReaction('m1', '👍');
    expect(s().messagesById.m1.reactions).toEqual([{ emoji: '👍', userIds: ['bob', 'me'] }]);
    expect(api.react).toHaveBeenCalledWith('m1', '👍', true);

    resolve([{ emoji: '👍', userIds: ['bob', 'carol', 'me'] }]); // someone else reacted meanwhile
    await flush();
    expect(s().messagesById.m1.reactions[0].userIds).toEqual(['bob', 'carol', 'me']);
  });

  it('rolls back when the request fails', async () => {
    api.react.mockRejectedValue(new Error('offline'));
    toggleReaction('m1', '🎉');
    expect(s().messagesById.m1.reactions).toHaveLength(2);
    await flush();
    expect(s().messagesById.m1.reactions).toEqual([{ emoji: '👍', userIds: ['bob'] }]);
  });

  it('removes an emoji entirely when my reaction was the last one', () => {
    s().setReactions('m1', [{ emoji: '🎉', userIds: ['me'] }]);
    api.react.mockReturnValue(new Promise(() => {}));
    toggleReaction('m1', '🎉');
    expect(s().messagesById.m1.reactions).toEqual([]);
    expect(api.react).toHaveBeenCalledWith('m1', '🎉', false);
  });
});

describe('editMessage', () => {
  it('shows the edit immediately and applies the saved version', async () => {
    let resolve!: (v: unknown) => void;
    api.editMessage.mockReturnValue(new Promise((r) => (resolve = r)));
    const done = editMessage('m1', 'new text');
    expect(s().messagesById.m1.body).toBe('new text');
    expect(s().messagesById.m1.editedAt).not.toBeNull();
    expect(api.editMessage).toHaveBeenCalledWith('m1', { body: 'new text', expectedVersion: 1 });

    resolve(msg({ body: 'new text', version: 2, editedAt: '2026-09-29T10:05:00.000Z' }));
    expect(await done).toBeNull();
    expect(s().messagesById.m1.version).toBe(2);
  });

  it('on a version conflict, shows the version that won and explains why', async () => {
    api.editMessage.mockRejectedValue(
      new ApiError(409, 'Message was changed elsewhere', { current: msg({ body: 'edited in another tab', version: 2 }) }),
    );
    const note = await editMessage('m1', 'my edit');
    expect(s().messagesById.m1.body).toBe('edited in another tab');
    expect(note).toMatch(/changed elsewhere/);
  });

  it('restores the original text when saving fails', async () => {
    api.editMessage.mockRejectedValue(new Error('offline'));
    const note = await editMessage('m1', 'my edit');
    expect(s().messagesById.m1.body).toBe('original');
    expect(s().messagesById.m1.editedAt).toBeNull();
    expect(note).toMatch(/Couldn't save/);
  });
});

describe('deleteMessage', () => {
  it('shows the tombstone immediately and restores the message if the delete fails', async () => {
    let reject!: (e: unknown) => void;
    api.deleteMessage.mockReturnValue(new Promise((_, r) => (reject = r)));
    const done = deleteMessage('m1');
    expect(s().messagesById.m1.status).toBe('deleted');
    expect(s().messagesById.m1.body).toBe('');

    reject(new Error('offline'));
    expect(await done).toMatch(/Couldn't delete/);
    expect(s().messagesById.m1.status).toBe('active');
    expect(s().messagesById.m1.body).toBe('original');
  });
});
