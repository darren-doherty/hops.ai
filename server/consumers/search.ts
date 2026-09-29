import { pool } from '../db.js';
import { searchIndex } from '../fakes/searchIndex.js';
import type { ExternalConsumer } from './types.js';

/**
 * Pushes the message's *current* state to the search index. The index ignores
 * anything older than what it has, so duplicates and out-of-order retries are harmless.
 */
export const searchConsumer: ExternalConsumer = {
  name: 'search',
  local: false,
  async handle(event) {
    const { rows } = await pool.query(
      `SELECT id, version, status, body, channel_id, author_id, parent_id, created_at
         FROM messages WHERE id = $1`,
      [event.messageId],
    );
    const m = rows[0];
    if (!m) return;
    const deleted = m.status === 'deleted';
    await searchIndex.index({
      id: m.id,
      version: m.version,
      deleted,
      body: deleted ? '' : m.body,
      channelId: m.channel_id,
      authorId: m.author_id,
      parentId: m.parent_id,
      createdAt: m.created_at,
    });
  },
};
