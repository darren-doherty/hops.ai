// Guarantee: a message and the record that it needs delivering are written
// together or not at all (§4.1), and retried creates don't duplicate.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { config } from '../server/config.js';
import { withTx } from '../server/db.js';
import { createMessage } from '../server/domain/messages.js';
import { deliveries, pool, resetDb, type Fixture } from './helpers.js';

let f: Fixture;
beforeEach(async () => {
  f = await resetDb();
});
afterAll(() => pool.end());

const count = async (table: string) => (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

describe('write path', () => {
  it('writes the message, one outbox event and a delivery per consumer in one transaction', async () => {
    const id = uuidv7();
    const { created } = await withTx((tx) => createMessage(tx, { id, channelId: f.eng, authorId: f.users.alice, body: 'hi @bob' }));

    expect(created).toBe(true);
    expect(await count('messages')).toBe(1);
    const { rows: events } = await pool.query('SELECT type, message_id FROM outbox_events');
    expect(events).toEqual([{ type: 'MessageCreated', message_id: id }]);

    const rows = await deliveries();
    expect(rows.map((d) => d.consumer).sort()).toEqual(['activity', 'notifications', 'search']);
    // Notifications wait out the grace period; the others are due immediately.
    const due = (c: string) => new Date(rows.find((d) => d.consumer === c)!.next_attempt_at).getTime();
    expect(due('notifications') - due('search')).toBeGreaterThan(config.graceMs - 1000);
    expect(due('notifications') - due('search')).toBeLessThan(config.graceMs + 1000);
  });

  it('writes nothing if the transaction fails part-way', async () => {
    await expect(
      withTx(async (tx) => {
        await createMessage(tx, { id: uuidv7(), channelId: f.eng, authorId: f.users.alice, body: 'doomed' });
        throw new Error('crash after the insert, before commit');
      }),
    ).rejects.toThrow('crash');

    expect(await count('messages')).toBe(0);
    expect(await count('outbox_events')).toBe(0);
    expect(await count('event_deliveries')).toBe(0);
  });

  it('treats a retried create with the same id as the same message', async () => {
    const id = uuidv7();
    const input = { id, channelId: f.eng, authorId: f.users.alice, body: 'retry me' };
    const first = await withTx((tx) => createMessage(tx, input));
    const second = await withTx((tx) => createMessage(tx, input));

    expect(second.created).toBe(false);
    expect(second.message).toEqual(first.message);
    expect(await count('messages')).toBe(1);
    expect(await count('outbox_events')).toBe(1);
    expect(await count('event_deliveries')).toBe(3);
  });

  it('rejects the same id from a different author', async () => {
    const id = uuidv7();
    await withTx((tx) => createMessage(tx, { id, channelId: f.eng, authorId: f.users.alice, body: 'mine' }));
    await expect(
      withTx((tx) => createMessage(tx, { id, channelId: f.eng, authorId: f.users.bob, body: 'hijack' })),
    ).rejects.toMatchObject({ status: 409 });
  });
});
