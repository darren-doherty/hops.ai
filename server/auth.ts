// Identity without real auth (cut, §8): the client sends a user handle as the
// x-user header (HTTP) or ?as= query param (WebSocket).
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from './db.js';
import type { UserDto } from '../shared/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserDto;
  }
}

export async function findUserByHandle(handle: string | undefined): Promise<UserDto | null> {
  if (!handle) return null;
  const { rows } = await pool.query<UserDto>(
    'SELECT id, handle, name, color FROM users WHERE handle = $1',
    [handle.toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const handle = (req.headers['x-user'] as string | undefined) ?? (req.query as { as?: string }).as;
  const user = await findUserByHandle(handle);
  if (!user) return reply.code(401).send({ error: 'Unknown user: pass x-user header or ?as=<handle>' });
  req.user = user;
}
