import type { FastifyInstance } from 'fastify';
import { pool, withTx } from '../db.js';
import { HttpError } from '../errors.js';
import {
  assertMember,
  createMessage,
  deleteMessage,
  editMessage,
  getMessageDto,
  getThread,
  listChannelMessages,
} from '../domain/messages.js';
import { channelTopic, publish } from '../realtime/hub.js';
import type { MessageDto } from '../../shared/types.js';

type ChannelParams = { id: string };
type CreateBody = { id?: string; body?: string; parentId?: string | null };
type EditBody = { body?: string; expectedVersion?: number };

/**
 * Realtime is after commit and best-effort: if it fails, the change is still
 * saved (§5.1). A reply's root is re-sent too, because its reply count changed.
 */
async function broadcast(message: MessageDto) {
  publish(channelTopic(message.channelId), { type: 'message.upserted', message });
  if (message.parentId) {
    const root = await getMessageDto(pool, message.parentId);
    if (root) publish(channelTopic(root.channelId), { type: 'message.upserted', message: root });
  }
}

export async function messageRoutes(app: FastifyInstance) {
  app.get<{ Params: ChannelParams }>('/channels/:id/messages', async (req) => {
    await assertMember(pool, req.params.id, req.user.id);
    return listChannelMessages(pool, req.params.id);
  });

  app.get<{ Params: { id: string } }>('/messages/:id/thread', async (req) => getThread(pool, req.params.id, req.user.id));

  app.post<{ Params: ChannelParams; Body: CreateBody }>('/channels/:id/messages', async (req, reply) => {
    const { id, body, parentId } = req.body ?? {};
    if (typeof id !== 'string' || typeof body !== 'string') throw new HttpError(400, 'id and body are required');

    const { message, created } = await withTx((tx) =>
      createMessage(tx, { id, channelId: req.params.id, authorId: req.user.id, body, parentId }),
    );
    if (created) await broadcast(message);
    return reply.code(created ? 201 : 200).send(message);
  });

  app.patch<{ Params: { id: string }; Body: EditBody }>('/messages/:id', async (req) => {
    const { body, expectedVersion } = req.body ?? {};
    if (typeof body !== 'string' || typeof expectedVersion !== 'number') {
      throw new HttpError(400, 'body and expectedVersion are required');
    }
    const { message, changed } = await withTx((tx) =>
      editMessage(tx, { id: req.params.id, userId: req.user.id, body, expectedVersion }),
    );
    if (changed) await broadcast(message);
    return message;
  });

  app.delete<{ Params: { id: string } }>('/messages/:id', async (req) => {
    const { message, changed } = await withTx((tx) => deleteMessage(tx, { id: req.params.id, userId: req.user.id }));
    if (changed) await broadcast(message);
    return message;
  });
}
