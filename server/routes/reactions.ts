import type { FastifyInstance } from 'fastify';
import { withTx } from '../db.js';
import { setReaction } from '../domain/reactions.js';
import { channelTopic, publish } from '../realtime/hub.js';

type Params = { id: string; emoji: string };

async function toggle(messageId: string, emoji: string, userId: string, on: boolean) {
  const { channelId, reactions, changed } = await withTx((tx) => setReaction(tx, { messageId, userId, emoji, on }));
  // Absolute summary: duplicate or reordered events can't double-count (§5.1).
  if (changed) publish(channelTopic(channelId), { type: 'reactions.updated', messageId, channelId, reactions });
  return reactions;
}

export async function reactionRoutes(app: FastifyInstance) {
  app.put<{ Params: Params }>('/messages/:id/reactions/:emoji', (req) =>
    toggle(req.params.id, req.params.emoji, req.user.id, true),
  );
  app.delete<{ Params: Params }>('/messages/:id/reactions/:emoji', (req) =>
    toggle(req.params.id, req.params.emoji, req.user.id, false),
  );
}
