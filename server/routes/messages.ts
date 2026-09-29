import type { FastifyInstance } from 'fastify';
import { pool, withTx } from '../db.js';
import { HttpError } from '../errors.js';
import { assertMember, createMessage, getMessageDto, listChannelMessages } from '../domain/messages.js';
import { channelTopic, publish } from '../realtime/hub.js';

type ChannelParams = { id: string };
type CreateBody = { id?: string; body?: string; parentId?: string | null };

export async function messageRoutes(app: FastifyInstance) {
  app.get<{ Params: ChannelParams }>('/channels/:id/messages', async (req) => {
    await assertMember(pool, req.params.id, req.user.id);
    return listChannelMessages(pool, req.params.id);
  });

  app.post<{ Params: ChannelParams; Body: CreateBody }>('/channels/:id/messages', async (req, reply) => {
    const { id, body, parentId } = req.body ?? {};
    if (typeof id !== 'string' || typeof body !== 'string') throw new HttpError(400, 'id and body are required');

    const { message, created } = await withTx((tx) =>
      createMessage(tx, { id, channelId: req.params.id, authorId: req.user.id, body, parentId }),
    );

    // Realtime is after commit and best-effort: if it fails, the message is still saved (§5.1).
    if (created) {
      publish(channelTopic(message.channelId), { type: 'message.upserted', message });
      if (message.parentId) {
        const root = await getMessageDto(pool, message.parentId);
        if (root) publish(channelTopic(root.channelId), { type: 'message.upserted', message: root });
      }
    }
    return reply.code(created ? 201 : 200).send(message);
  });
}
