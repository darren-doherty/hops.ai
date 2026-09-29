import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import type { ChannelDto } from '../../shared/types.js';

export async function channelRoutes(app: FastifyInstance) {
  // Only channels the user is a member of. DMs are named after the other member.
  app.get('/channels', async (req): Promise<ChannelDto[]> => {
    const { rows } = await pool.query<ChannelDto>(
      `SELECT c.id, c.kind, c.topic,
              CASE WHEN c.kind = 'dm' THEN (
                SELECT u.name FROM channel_members om JOIN users u ON u.id = om.user_id
                WHERE om.channel_id = c.id AND om.user_id <> $1 LIMIT 1
              ) ELSE c.name END AS name,
              ARRAY(SELECT user_id FROM channel_members WHERE channel_id = c.id) AS "memberIds"
         FROM channels c
         JOIN channel_members m ON m.channel_id = c.id AND m.user_id = $1
        ORDER BY c.kind DESC, name`,
      [req.user.id],
    );
    return rows;
  });
}
