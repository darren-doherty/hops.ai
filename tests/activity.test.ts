// Guarantee: the activity feed is a pure function of current state. Processing
// events twice, or in a different order, gives the same feed (§4.3), and read
// state behaves as designed (§2.3–2.5).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { listActivity, markRead } from '../server/domain/activityFeed.js';
import { drain, edit, pool, post, react, redeliver, remove, resetDb, type Fixture } from './helpers.js';

let f: Fixture;
beforeEach(async () => {
  f = await resetDb();
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 50)); // let after-commit unread-count pushes finish
  await pool.end();
});

const snapshot = async () =>
  (
    await pool.query(
      `SELECT u.handle, a.group_key, a.reason, a.count, a.actor_ids, a.latest_at, a.read_at
         FROM activities a JOIN users u ON u.id = a.user_id ORDER BY u.handle, a.group_key`,
    )
  ).rows;

const item = async (userId: string, messageId: string, reason?: string) =>
  (await listActivity(pool, userId)).find((i) => i.messageId === messageId && (!reason || i.reason === reason));

describe('activity projection', () => {
  it('is idempotent and order-insensitive', async () => {
    const root = await post(f.users.alice, f.eng, 'root');
    await post(f.users.bob, f.eng, 'reply from bob', { parentId: root.id });
    await post(f.users.carol, f.eng, 'reply from carol @erin', { parentId: root.id });
    await react(f.users.bob, root.id, '👍');
    await react(f.users.carol, root.id, '🎉');
    await post(f.users.alice, f.dm, 'dm 1');
    await post(f.users.alice, f.dm, 'dm 2');
    await drain({ consumers: ['activity'] });
    const first = await snapshot();
    expect(first.length).toBeGreaterThan(0);

    // Every event again, newest first (the worker claims oldest next_attempt_at first).
    await pool.query(
      `UPDATE event_deliveries SET status = 'pending', done_at = NULL,
              next_attempt_at = now() - event_id * interval '1 second'
        WHERE consumer = 'activity'`,
    );
    await drain({ consumers: ['activity'] });
    expect(await snapshot()).toEqual(first);
  });

  it('applies the attention rules: one item per person, never the author, mentions win', async () => {
    const root = await post(f.users.alice, f.eng, 'root');
    const reply = await post(f.users.bob, f.eng, 'thoughts @alice?', { parentId: root.id });
    await drain({ consumers: ['activity'] });

    expect((await listActivity(pool, f.users.alice)).filter((i) => i.messageId === reply.id).map((i) => i.reason)).toEqual(['mention']);
    expect(await item(f.users.bob, reply.id)).toBeUndefined(); // no activity for your own message
  });

  it('keeps read items read on edit, but a new reaction makes the group unread again', async () => {
    const root = await post(f.users.alice, f.eng, 'root');
    const reply = await post(f.users.bob, f.eng, 'a reply', { parentId: root.id });
    await react(f.users.bob, root.id, '👍');
    await drain({ consumers: ['activity'] });

    const replyItem = (await item(f.users.alice, reply.id, 'participating'))!;
    const reactionItem = (await item(f.users.alice, root.id, 'reaction'))!;
    await markRead(f.users.alice, replyItem.id);
    await markRead(f.users.alice, reactionItem.id);

    await edit(f.users.bob, reply.id, 'a reply (edited)', 1);
    await react(f.users.erin, root.id, '🎉');
    await drain({ consumers: ['activity'] });

    const editedReply = (await item(f.users.alice, reply.id, 'participating'))!;
    expect(editedReply.readAt).not.toBeNull(); // edits never make things unread
    expect(editedReply.preview).toBe('a reply (edited)'); // live text, not a snapshot
    const reactions = (await item(f.users.alice, root.id, 'reaction'))!;
    expect(reactions.readAt).toBeNull(); // something new arrived
    expect(reactions.count).toBe(2);
  });

  it('hides deleted messages and edited-out mentions immediately, before the consumer runs', async () => {
    const mention = await post(f.users.alice, f.eng, 'hey @bob');
    const doomed = await post(f.users.alice, f.eng, 'also @bob');
    await drain({ consumers: ['activity'] });
    expect(await item(f.users.bob, mention.id)).toBeDefined();
    expect(await item(f.users.bob, doomed.id)).toBeDefined();

    await edit(f.users.alice, mention.id, 'hey everyone', 1);
    await remove(f.users.alice, doomed.id);
    // No drain: the read-time filter alone hides both.
    expect(await item(f.users.bob, mention.id)).toBeUndefined();
    expect(await item(f.users.bob, doomed.id)).toBeUndefined();
  });

  it('counts only new DMs since the last read (regression: counts included the whole history)', async () => {
    await post(f.users.alice, f.dm, 'one');
    await post(f.users.alice, f.dm, 'two');
    await drain({ consumers: ['activity'] });
    const group = (await listActivity(pool, f.users.bob)).find((i) => i.reason === 'dm')!;
    expect(group.count).toBe(2);

    await markRead(f.users.bob, group.id);
    await post(f.users.alice, f.dm, 'three');
    await post(f.users.alice, f.dm, 'four');
    await drain({ consumers: ['activity'] });
    const after = (await listActivity(pool, f.users.bob)).find((i) => i.reason === 'dm')!;
    expect(after.count).toBe(2);
    expect(after.readAt).toBeNull();

    // Replying marks the conversation read, as in Slack.
    await post(f.users.bob, f.dm, 'got it');
    await drain({ consumers: ['activity'] });
    expect((await listActivity(pool, f.users.bob)).find((i) => i.reason === 'dm')!.readAt).not.toBeNull();
  });
});
