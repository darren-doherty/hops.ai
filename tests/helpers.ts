// Integration test harness: a real Postgres (TEST_DATABASE_URL), reset before
// each test. Tests drive the worker directly and make deliveries due by
// updating next_attempt_at, instead of sleeping, so they're fast and deterministic.
import { readFileSync } from 'node:fs';
import { v7 as uuidv7 } from 'uuid';
import { pool, withTx } from '../server/db.js';
import { createMessage, deleteMessage, editMessage } from '../server/domain/messages.js';
import { setReaction } from '../server/domain/reactions.js';
import { faults } from '../server/fakes/network.js';
import { drain } from '../server/worker.js';
import type { ConsumerName } from '../server/consumers/registry.js';

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

export type Fixture = {
  users: Record<'alice' | 'bob' | 'carol' | 'erin' | 'dave', string>;
  eng: string; // alice, bob, carol, erin (not dave)
  dm: string; // alice + bob
};

/** Fresh schema, a handful of users, one channel and one DM. Faults off, no latency. */
export async function resetDb(): Promise<Fixture> {
  await pool.query(schema);
  faults.search = { latencyMs: [0, 0], failureRate: 0 };
  faults.notify = { latencyMs: [0, 0], failureRate: 0 };

  const users = {} as Fixture['users'];
  for (const handle of ['alice', 'bob', 'carol', 'erin', 'dave'] as const) {
    users[handle] = uuidv7();
    await pool.query('INSERT INTO users (id, handle, name, color) VALUES ($1, $2, $3, $4)', [
      users[handle],
      handle,
      handle[0].toUpperCase() + handle.slice(1),
      '#000',
    ]);
  }
  const addChannel = async (kind: 'public' | 'dm', members: string[]) => {
    const id = uuidv7();
    await pool.query("INSERT INTO channels (id, name, kind) VALUES ($1, 'test', $2)", [id, kind]);
    for (const m of members) await pool.query('INSERT INTO channel_members VALUES ($1, $2)', [id, m]);
    return id;
  };
  const eng = await addChannel('public', [users.alice, users.bob, users.carol, users.erin]);
  const dm = await addChannel('dm', [users.alice, users.bob]);
  return { users, eng, dm };
}

export const post = (authorId: string, channelId: string, body: string, opts: { parentId?: string; createdAt?: Date } = {}) =>
  withTx(async (tx) => (await createMessage(tx, { id: uuidv7(), channelId, authorId, body, ...opts })).message);

export const edit = (userId: string, id: string, body: string, expectedVersion: number) =>
  withTx(async (tx) => (await editMessage(tx, { id, userId, body, expectedVersion })).message);

export const remove = (userId: string, id: string) => withTx(async (tx) => (await deleteMessage(tx, { id, userId })).message);

export const react = (userId: string, messageId: string, emoji: string, on = true) =>
  withTx((tx) => setReaction(tx, { messageId, userId, emoji, on }));

/** Make every pending delivery (optionally one consumer's) due now, skipping any backoff or grace period. */
export async function makeDue(consumer?: ConsumerName) {
  await pool.query(
    `UPDATE event_deliveries SET next_attempt_at = now(), locked_until = NULL
      WHERE status = 'pending' AND ($1::text IS NULL OR consumer = $1)`,
    [consumer ?? null],
  );
}

/** Put deliveries back to pending (as if redelivered) and process them again. */
export async function redeliver(consumer: ConsumerName, where = 'true') {
  await pool.query(
    `UPDATE event_deliveries SET status = 'pending', next_attempt_at = now(), locked_until = NULL, done_at = NULL
      WHERE consumer = $1 AND ${where}`,
    [consumer],
  );
  await drain({ consumers: [consumer] });
}

export async function deliveries(consumer?: ConsumerName) {
  const { rows } = await pool.query(
    `SELECT d.event_id, e.type, d.consumer, d.status, d.attempts, d.next_attempt_at, d.last_error
       FROM event_deliveries d JOIN outbox_events e ON e.id = d.event_id
      WHERE $1::text IS NULL OR d.consumer = $1 ORDER BY d.event_id, d.consumer`,
    [consumer ?? null],
  );
  return rows;
}

export { drain, faults, pool };
