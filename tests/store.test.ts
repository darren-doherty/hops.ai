// Client-side reconciliation rules (§5.1, §5.2): optimistic messages, version
// ordering, and duplicate/late realtime events.
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../web/store';
import type { MessageDto } from '../shared/types';

const CHANNEL = 'c1';

function msg(id: string, overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id,
    channelId: CHANNEL,
    authorId: 'u1',
    parentId: null,
    body: `body ${id}`,
    status: 'active',
    version: 1,
    createdAt: `2026-09-29T10:00:0${id.slice(-1)}.000Z`,
    editedAt: null,
    replyCount: 0,
    lastReplyAt: null,
    reactions: [],
    ...overrides,
  };
}

const s = () => useStore.getState();

beforeEach(() => {
  useStore.setState({ messagesById: {}, channelOrder: {}, threadOrder: {}, sendState: {}, activity: null, unreadCount: 0, toasts: [] });
});

describe('message store', () => {
  it('orders messages by time and never duplicates an id', () => {
    s().setChannelMessages(CHANNEL, [msg('m1'), msg('m3')]);
    s().upsertMessage(msg('m2'));
    s().upsertMessage(msg('m2')); // duplicate realtime event
    expect(s().channelOrder[CHANNEL]).toEqual(['m1', 'm2', 'm3']);
  });

  it('ignores stale versions (late or out-of-order events)', () => {
    s().setChannelMessages(CHANNEL, [msg('m1', { version: 3, body: 'v3' })]);
    s().upsertMessage(msg('m1', { version: 2, body: 'v2' }));
    expect(s().messagesById.m1.body).toBe('v3');
  });

  it('settles an optimistic send when the server copy arrives, via response or echo', () => {
    s().setChannelMessages(CHANNEL, [msg('m1')]);
    s().addPending(msg('m9', { version: 0, createdAt: '2026-09-29T10:00:09.000Z' }));
    expect(s().sendState.m9).toBe('pending');

    // Realtime echo lands first, with the server's timestamp.
    s().upsertMessage(msg('m9', { createdAt: '2026-09-29T10:00:05.000Z' }));
    expect(s().sendState.m9).toBeUndefined();
    expect(s().channelOrder[CHANNEL]).toEqual(['m1', 'm9']);

    // Then the HTTP response: same version, no duplicate.
    s().upsertMessage(msg('m9', { createdAt: '2026-09-29T10:00:05.000Z' }));
    expect(s().channelOrder[CHANNEL]).toEqual(['m1', 'm9']);
  });

  it('keeps unconfirmed messages visible across a refetch', () => {
    s().setChannelMessages(CHANNEL, [msg('m1')]);
    s().addPending(msg('m9', { version: 0 }));
    s().setChannelMessages(CHANNEL, [msg('m1')]); // e.g. reconnect refetch before the send lands
    expect(s().channelOrder[CHANNEL]).toEqual(['m1', 'm9']);
  });

  it('discards a failed send completely', () => {
    s().setChannelMessages(CHANNEL, [msg('m1')]);
    s().addPending(msg('m9', { version: 0 }));
    s().setSendState('m9', 'failed');
    s().discard('m9');
    expect(s().channelOrder[CHANNEL]).toEqual(['m1']);
    expect(s().messagesById.m9).toBeUndefined();
    expect(s().sendState.m9).toBeUndefined();
  });

  it('loads a thread without dropping a reply that is still sending', () => {
    s().addPending(msg('m9', { version: 0, parentId: 'm1' }));
    s().setThread(msg('m1'), [msg('m2', { parentId: 'm1' })]);
    expect(s().threadOrder.m1).toEqual(['m2', 'm9']);
    expect(s().channelOrder[CHANNEL]).toBeUndefined(); // replies never enter the channel list
  });

  it('marks an activity item read optimistically, decrementing the badge only once', () => {
    const item = {
      id: 'a1', reason: 'mention' as const, count: 1, actorIds: ['u2'], latestAt: '', readAt: null,
      channelId: CHANNEL, messageId: 'm1', parentId: null, preview: '', editedAt: null, root: null, emojis: [],
    };
    s().setActivity({ items: [item], unreadCount: 3 });
    s().markActivityRead('a1');
    s().markActivityRead('a1');
    expect(s().unreadCount).toBe(2);
    expect(s().activity![0].readAt).not.toBeNull();
  });

  it('shows each notification once, newest first, at most three at a time', () => {
    const n = (id: string) => ({ id, title: id, body: '', link: { channelId: CHANNEL, messageId: id, parentId: null } });
    for (const id of ['n1', 'n2', 'n2', 'n3', 'n4']) s().pushToast(n(id));
    expect(s().toasts.map((t) => t.id)).toEqual(['n4', 'n3', 'n2']);
    s().dismissToast('n3');
    expect(s().toasts.map((t) => t.id)).toEqual(['n4', 'n2']);
  });

  it('does not create a list for a channel that has not been loaded', () => {
    s().upsertMessage(msg('m1', { channelId: 'other' }));
    expect(s().channelOrder.other).toBeUndefined();
  });
});
