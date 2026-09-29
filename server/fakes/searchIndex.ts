// Fake external search service. Only reachable through this client, and only
// touches its own table (fake_search_docs), as a real service would own its storage.
import { pool } from '../db.js';
import { callExternal } from './network.js';

export type SearchDoc = {
  id: string;
  version: number;
  deleted: boolean;
  body: string;
  channelId: string;
  authorId: string;
  parentId: string | null;
  createdAt: Date | string;
};

export type SearchHit = Omit<SearchDoc, 'version' | 'deleted'>;

export const searchIndex = {
  /**
   * Versioned upsert (like Elasticsearch's version_type=external): a write only
   * applies if it is newer than what's stored. Deletes are stored as tombstones,
   * so a late retry of an older version can't resurrect a deleted message.
   */
  index(doc: SearchDoc): Promise<{ applied: boolean }> {
    return callExternal('search', async () => {
      const { rowCount } = await pool.query(
        `INSERT INTO fake_search_docs (id, version, deleted, body, channel_id, author_id, parent_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           version = EXCLUDED.version, deleted = EXCLUDED.deleted, body = EXCLUDED.body, indexed_at = now()
         WHERE fake_search_docs.version < EXCLUDED.version`,
        [doc.id, doc.version, doc.deleted, doc.body, doc.channelId, doc.authorId, doc.parentId, doc.createdAt],
      );
      return { applied: rowCount === 1 };
    });
  },

  /** Substring match within the given channels, newest first. Tombstones are excluded. */
  query(q: string, channelIds: string[]): Promise<SearchHit[]> {
    return callExternal('search', async () => {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const { rows } = await pool.query<SearchHit>(
        `SELECT id, body, channel_id AS "channelId", author_id AS "authorId",
                parent_id AS "parentId", created_at AS "createdAt"
           FROM fake_search_docs
          WHERE NOT deleted AND channel_id = ANY($2::uuid[]) AND body ILIKE $1
          ORDER BY created_at DESC LIMIT 20`,
        [pattern, channelIds],
      );
      return rows;
    });
  },
};
