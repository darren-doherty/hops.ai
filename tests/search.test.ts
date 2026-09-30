// Guarantee: search converges to the latest version through failures, and
// a deleted message can never be resurrected by a late or repeated write (§4.3).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { searchIndex } from '../server/fakes/searchIndex.js';
import { deliveries, drain, edit, faults, makeDue, pool, post, redeliver, remove, resetDb, type Fixture } from './helpers.js';

let f: Fixture;
beforeEach(async () => {
  f = await resetDb();
});
afterAll(() => pool.end());

const doc = async (id: string) =>
  (await pool.query('SELECT version, deleted, body FROM fake_search_docs WHERE id = $1', [id])).rows[0];

describe('search consumer', () => {
  it('retries while search is down, then converges to the latest version', async () => {
    const m = await post(f.users.alice, f.eng, 'first draft');
    faults.search.failureRate = 1;
    await drain({ consumers: ['search'] });

    const [failed] = await deliveries('search');
    expect(failed).toMatchObject({ status: 'pending', attempts: 1 });
    expect(failed.last_error).toMatch(/search unavailable/);
    expect(new Date(failed.next_attempt_at).getTime()).toBeGreaterThan(Date.now()); // backing off

    // Meanwhile the message is edited. Search recovers and the retries run.
    await edit(f.users.alice, m.id, 'final text', 1);
    faults.search.failureRate = 0;
    await makeDue('search');
    await drain({ consumers: ['search'] });

    expect((await deliveries('search')).every((d) => d.status === 'done')).toBe(true);
    expect(await doc(m.id)).toEqual({ version: 2, deleted: false, body: 'final text' });
    expect((await searchIndex.query('final', [f.eng])).map((h) => h.id)).toEqual([m.id]);
  });

  it('never resurrects a deleted message', async () => {
    const m = await post(f.users.alice, f.eng, 'secret plans');
    await edit(f.users.alice, m.id, 'secret plans v2', 1);
    await remove(f.users.alice, m.id);
    await drain({ consumers: ['search'] });
    expect(await doc(m.id)).toEqual({ version: 3, deleted: true, body: '' });

    // Layer 1, thin events: redelivering the old MessageEdited event re-reads
    // current state (deleted), so it can only ever re-send the tombstone.
    await redeliver('search', "event_id = (SELECT id FROM outbox_events WHERE type = 'MessageEdited')");
    expect(await doc(m.id)).toEqual({ version: 3, deleted: true, body: '' });

    // Layer 2, the index's version check: even a stale write carrying the old
    // text (e.g. a slow worker from before the delete) is rejected.
    const stale = await searchIndex.index({
      id: m.id, version: 2, deleted: false, body: 'secret plans v2',
      channelId: f.eng, authorId: f.users.alice, parentId: null, createdAt: new Date(),
    });
    expect(stale.applied).toBe(false);
    expect(await doc(m.id)).toEqual({ version: 3, deleted: true, body: '' });
    expect(await searchIndex.query('secret', [f.eng])).toEqual([]);
  });
});
