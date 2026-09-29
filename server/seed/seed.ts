// Seeds users, channels, memberships and DMs. Messages are added in later phases,
// always through the domain service so the outbox fills search and activity (§7).
// Run after `pnpm db:reset`.
import { v7 as uuidv7 } from 'uuid';
import { pool, withTx } from '../db.js';
import { AVATAR_COLORS, CHANNELS, DMS, USERS } from './data.js';

const existing = await pool.query('SELECT count(*)::int AS n FROM users');
if (existing.rows[0].n > 0) {
  console.error('Database already has data. Run `pnpm db:reset` first.');
  process.exit(1);
}

await withTx(async (tx) => {
  const userIds = new Map<string, string>();
  for (const [i, u] of USERS.entries()) {
    const id = uuidv7();
    userIds.set(u.handle, id);
    await tx.query('INSERT INTO users (id, handle, name, color) VALUES ($1, $2, $3, $4)', [
      id, u.handle, u.name, AVATAR_COLORS[i % AVATAR_COLORS.length],
    ]);
  }

  const addChannel = async (name: string, kind: 'public' | 'dm', topic: string, handles: string[]) => {
    const id = uuidv7();
    await tx.query('INSERT INTO channels (id, name, kind, topic) VALUES ($1, $2, $3, $4)', [id, name, kind, topic]);
    for (const h of handles) {
      const userId = userIds.get(h);
      if (!userId) throw new Error(`Unknown handle in seed data: ${h}`);
      await tx.query('INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)', [id, userId]);
    }
  };

  for (const c of CHANNELS) {
    await addChannel(c.name, 'public', c.topic, c.members === 'all' ? USERS.map((u) => u.handle) : c.members);
  }
  for (const [a, b] of DMS) {
    await addChannel(`dm:${a}:${b}`, 'dm', '', [a, b]);
  }
});

console.log(`Seeded ${USERS.length} users, ${CHANNELS.length} channels, ${DMS.length} DMs`);
await pool.end();
