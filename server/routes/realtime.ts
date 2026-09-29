import type { FastifyInstance } from 'fastify';
import { findUserByHandle } from '../auth.js';
import { pool } from '../db.js';
import { channelTopic, subscribe, userTopic } from '../realtime/hub.js';

export async function realtimeRoutes(app: FastifyInstance) {
  app.get('/realtime', { websocket: true }, async (socket, req) => {
    const user = await findUserByHandle((req.query as { as?: string }).as);
    if (!user) {
      socket.close(4001, 'Unknown user');
      return;
    }
    const { rows } = await pool.query<{ channel_id: string }>(
      'SELECT channel_id FROM channel_members WHERE user_id = $1',
      [user.id],
    );
    subscribe(socket, [userTopic(user.id), ...rows.map((r) => channelTopic(r.channel_id))]);
  });
}
