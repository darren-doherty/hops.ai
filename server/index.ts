import Fastify from 'fastify';
import { config } from './config.js';
import { requireUser } from './auth.js';
import { publicUserRoutes, userRoutes } from './routes/users.js';
import { channelRoutes } from './routes/channels.js';

const app = Fastify({ logger: { level: 'info' } });

await app.register(
  async (api) => {
    await api.register(publicUserRoutes);
    await api.register(async (authed) => {
      authed.addHook('preHandler', requireUser);
      await authed.register(userRoutes);
      await authed.register(channelRoutes);
    });
  },
  { prefix: '/api' },
);

await app.listen({ port: config.port, host: '127.0.0.1' });
