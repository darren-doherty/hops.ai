// Guarantees (§2.6): nothing is sent for changes undone within the grace
// period; nobody is notified twice; retries only re-send what failed.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationSender } from '../server/fakes/notificationSender.js';
import { deliveries, drain, edit, makeDue, pool, post, redeliver, remove, resetDb, type Fixture } from './helpers.js';

let f: Fixture;
beforeEach(async () => {
  f = await resetDb();
  vi.spyOn(console, 'log').mockImplementation(() => {}); // quiet the 🔔 demo lines
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

const sent = async () =>
  (
    await pool.query(
      `SELECT u.handle, n.body FROM fake_notifications_sent n JOIN users u ON u.id = n.user_id ORDER BY u.handle, n.body`,
    )
  ).rows;

/** Skip the grace period and run the notification consumer. */
const afterGrace = async () => {
  await makeDue('notifications');
  await drain({ consumers: ['notifications'] });
};

describe('notifications', () => {
  it('waits out the grace period before sending', async () => {
    await post(f.users.alice, f.eng, 'hi @bob');
    await drain({ consumers: ['notifications'] }); // nothing is due yet
    expect(await sent()).toEqual([]);

    await afterGrace();
    expect(await sent()).toEqual([{ handle: 'bob', body: 'hi @bob' }]);
  });

  it('sends nothing for a message deleted within the grace period', async () => {
    const m = await post(f.users.alice, f.eng, 'oops @bob');
    await remove(f.users.alice, m.id);
    await afterGrace();

    expect(await sent()).toEqual([]);
    expect((await deliveries('notifications')).every((d) => d.status === 'done')).toBe(true);
  });

  it('uses the state at the end of the grace period: latest text, removed mentions skipped', async () => {
    const m = await post(f.users.alice, f.eng, 'draft for @bob and @carol');
    await edit(f.users.alice, m.id, 'final version for @bob', 1);
    await afterGrace();

    expect(await sent()).toEqual([{ handle: 'bob', body: 'final version for @bob' }]);
  });

  it('notifies each person once, however many times the event is delivered', async () => {
    const m = await post(f.users.alice, f.eng, 'hi @bob');
    await afterGrace();

    await redeliver('notifications'); // duplicate delivery: skipped via our acks
    await pool.query('DELETE FROM notification_acks'); // simulate "sent, but the response was lost"
    await redeliver('notifications'); // re-sent, and the provider's idempotency key drops it
    expect(await sent()).toEqual([{ handle: 'bob', body: 'hi @bob' }]);

    // An edit that adds a mention notifies only the new person.
    await edit(f.users.alice, m.id, 'hi @bob and @carol', 1);
    await afterGrace();
    expect((await sent()).map((n) => n.handle)).toEqual(['bob', 'carol']);
  });

  it('only retries the recipients that failed (regression: retries re-sent to everyone)', async () => {
    const send = notificationSender.send.bind(notificationSender);
    const calls: string[] = [];
    let erinFails = true;
    vi.spyOn(notificationSender, 'send').mockImplementation(async (n) => {
      calls.push(n.userId);
      if (n.userId === f.users.erin && erinFails) throw new Error('provider timeout');
      return send(n);
    });

    await post(f.users.alice, f.eng, '@bob @carol @erin standup moved');
    await afterGrace();
    expect((await sent()).map((n) => n.handle)).toEqual(['bob', 'carol']);
    expect((await deliveries('notifications'))[0]).toMatchObject({ status: 'pending', attempts: 1 });

    erinFails = false;
    await afterGrace();
    expect((await sent()).map((n) => n.handle)).toEqual(['bob', 'carol', 'erin']);
    // Bob and Carol were called once each; only Erin was retried.
    expect(calls.filter((id) => id === f.users.bob)).toHaveLength(1);
    expect(calls.filter((id) => id === f.users.carol)).toHaveLength(1);
    expect(calls.filter((id) => id === f.users.erin)).toHaveLength(2);
  });

  it('drops stale changes instead of notifying about old news', async () => {
    await post(f.users.alice, f.eng, 'ancient @bob', { createdAt: new Date(Date.now() - 60 * 60_000) });
    await afterGrace();
    expect(await sent()).toEqual([]);
  });

  it('notifies DMs but not thread replies (activity only)', async () => {
    const root = await post(f.users.bob, f.eng, 'root');
    await post(f.users.alice, f.eng, 'a reply', { parentId: root.id });
    await post(f.users.alice, f.dm, 'psst');
    await afterGrace();
    expect(await sent()).toEqual([{ handle: 'bob', body: 'psst' }]);
  });
});
