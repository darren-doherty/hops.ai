import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { getFeed, markAllRead, markRead } from '../domain/activityFeed.js';

export async function activityRoutes(app: FastifyInstance) {
  app.get('/activity', async (req) => getFeed(pool, req.user.id));

  app.post<{ Params: { id: string } }>('/activity/:id/read', async (req, reply) => {
    await markRead(req.user.id, req.params.id);
    return reply.code(204).send();
  });

  app.post('/activity/read-all', async (req, reply) => {
    await markAllRead(req.user.id);
    return reply.code(204).send();
  });
}
