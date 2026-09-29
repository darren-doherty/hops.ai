// Seeds users, channels, memberships, DMs and messages. Messages go through the
// domain service (not bulk SQL), so the outbox fills search and activity just
// as it would for real traffic (§7). Run after `pnpm db:reset`.
import { v7 as uuidv7 } from 'uuid';
import { pool, withTx } from '../db.js';
import { createMessage, deleteMessage, editMessage } from '../domain/messages.js';
import { setReaction } from '../domain/reactions.js';
import { drain } from '../worker.js';
import { AVATAR_COLORS, CHANNELS, DMS, SEED_MESSAGES, USERS } from './data.js';

const existing = await pool.query('SELECT count(*)::int AS n FROM users');
if (existing.rows[0].n > 0) {
  console.error('Database already has data. Run `pnpm db:reset` first.');
  process.exit(1);
}

const userIds = new Map<string, string>();
const channelIds = new Map<string, string>();

await withTx(async (tx) => {
  for (const [i, u] of USERS.entries()) {
    const id = uuidv7();
    userIds.set(u.handle, id);
    await tx.query('INSERT INTO users (id, handle, name, color) VALUES ($1, $2, $3, $4)', [
      id, u.handle, u.name, AVATAR_COLORS[i % AVATAR_COLORS.length],
    ]);
  }

  const addChannel = async (name: string, kind: 'public' | 'dm', topic: string, handles: string[]) => {
    const id = uuidv7();
    channelIds.set(name, id);
    await tx.query('INSERT INTO channels (id, name, kind, topic) VALUES ($1, $2, $3, $4)', [id, name, kind, topic]);
    for (const h of handles) {
      await tx.query('INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)', [id, lookup(userIds, h)]);
    }
  };

  for (const c of CHANNELS) {
    await addChannel(c.name, 'public', c.topic, c.members === 'all' ? USERS.map((u) => u.handle) : c.members);
  }
  for (const [a, b] of DMS) {
    await addChannel(`dm:${a}:${b}`, 'dm', '', [a, b]);
  }
});

// Oldest first, so replies and events happen in a plausible order.
const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000);
let messageCount = 0;

await withTx(async (tx) => {
  for (const m of [...SEED_MESSAGES].sort((a, b) => b.minutesAgo - a.minutesAgo)) {
    const channelId = lookup(channelIds, m.channel);
    const { message } = await createMessage(tx, {
      id: uuidv7(),
      channelId,
      authorId: lookup(userIds, m.author),
      body: m.text,
      createdAt: minutesAgo(m.minutesAgo),
    });
    messageCount++;
    for (const r of m.replies ?? []) {
      await createMessage(tx, {
        id: uuidv7(),
        channelId,
        authorId: lookup(userIds, r.author),
        body: r.text,
        parentId: message.id,
        createdAt: minutesAgo(m.minutesAgo - r.after),
      });
      messageCount++;
    }
    for (const [handle, emoji, after] of m.reactions ?? []) {
      await setReaction(tx, {
        messageId: message.id,
        userId: lookup(userIds, handle),
        emoji,
        on: true,
        createdAt: minutesAgo(m.minutesAgo - after),
      });
    }
    if (m.edit) {
      await editMessage(tx, {
        id: message.id,
        userId: message.authorId,
        body: m.edit.text,
        expectedVersion: message.version,
        editedAt: minutesAgo(m.minutesAgo - m.edit.after),
      });
    }
    if (m.deleted) await deleteMessage(tx, { id: message.id, userId: message.authorId });
  }
});

// Build activity feeds now (search is left for the server's worker to catch up
// on, which is itself worth watching), then mark anything older than 2 hours
// as read so feeds look lived-in rather than hundreds of items unread.
const processed = await drain({ consumers: ['activity'] });
const { rowCount: markedRead } = await pool.query(
  "UPDATE activities SET read_at = latest_at, last_read_at = latest_at WHERE latest_at < now() - interval '2 hours'",
);

console.log(`Seeded ${USERS.length} users, ${CHANNELS.length} channels, ${DMS.length} DMs, ${messageCount} messages`);
console.log(`Activity: processed ${processed} deliveries, marked ${markedRead} older items read`);
await pool.end();

function lookup(map: Map<string, string>, key: string): string {
  const value = map.get(key);
  if (!value) throw new Error(`Unknown seed reference: ${key}`);
  return value;
}
