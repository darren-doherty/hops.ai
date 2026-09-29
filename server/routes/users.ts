import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import type { UserDto } from '../../shared/types.js';

/** Public: the user switcher needs the list before anyone is "logged in". */
export async function publicUserRoutes(app: FastifyInstance) {
  app.get('/users', async () => {
    const { rows } = await pool.query<UserDto>('SELECT id, handle, name, color FROM users ORDER BY name');
    return rows;
  });
}

export async function userRoutes(app: FastifyInstance) {
  app.get('/me', async (req) => req.user);
}
