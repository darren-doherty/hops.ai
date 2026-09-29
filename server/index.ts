import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { pool } from './db.js';
import { HttpError } from './errors.js';
import { requireUser } from './auth.js';
import * as worker from './worker.js';
import { publicUserRoutes, userRoutes } from './routes/users.js';
import { channelRoutes } from './routes/channels.js';
import { messageRoutes } from './routes/messages.js';
import { searchRoutes } from './routes/search.js';
import { realtimeRoutes } from './routes/realtime.js';

const app = Fastify({ logger: { level: 'info' }, disableRequestLogging: true });

app.setErrorHandler((err, req, reply) => {
  if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, ...err.body });
  const status = (err as { statusCode?: number }).statusCode;
  if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
  req.log.error(err);
  return reply.code(500).send({ error: 'Internal server error' });
});

await app.register(websocket);
await app.register(realtimeRoutes);
await app.register(
  async (api) => {
    await api.register(publicUserRoutes);
    await api.register(async (authed) => {
      authed.addHook('preHandler', requireUser);
      await authed.register(userRoutes);
      await authed.register(channelRoutes);
      await authed.register(messageRoutes);
      await authed.register(searchRoutes);
    });
  },
  { prefix: '/api' },
);

await app.listen({ port: config.port, host: '127.0.0.1' });
worker.start(app.log);

const shutdown = async () => {
  worker.stop();
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
