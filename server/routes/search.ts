import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { ExternalUnavailableError } from '../fakes/network.js';
import { searchIndex } from '../fakes/searchIndex.js';

export async function searchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string } }>('/search', async (req, reply) => {
    const q = (req.query.q ?? '').trim();
    if (q.length < 2) return [];

    // Only the user's channels, so DMs stay private.
    const { rows } = await pool.query<{ channel_id: string }>(
      'SELECT channel_id FROM channel_members WHERE user_id = $1',
      [req.user.id],
    );
    try {
      return await searchIndex.query(q, rows.map((r) => r.channel_id));
    } catch (err) {
      if (err instanceof ExternalUnavailableError) {
        return reply.code(503).send({ error: 'Search is temporarily unavailable. Try again in a moment.' });
      }
      throw err;
    }
  });
}
