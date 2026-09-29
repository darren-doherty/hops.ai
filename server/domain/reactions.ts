import type { PoolClient } from 'pg';
import { HttpError } from '../errors.js';
import { assertMember, getMessageDto } from './messages.js';
import { enqueue } from './outbox.js';
import { REACTION_EMOJI, type ReactionSummary } from '../../shared/types.js';

/**
 * Adds or removes one user's reaction. Idempotent: adding twice or removing
 * something absent changes nothing and emits no event. Returns the absolute
 * summary, so clients replace their copy rather than applying +1/-1.
 */
export async function setReaction(
  tx: PoolClient,
  input: { messageId: string; userId: string; emoji: string; on: boolean; createdAt?: Date },
): Promise<{ channelId: string; reactions: ReactionSummary[]; changed: boolean }> {
  if (!REACTION_EMOJI.includes(input.emoji)) throw new HttpError(400, 'Unsupported emoji');

  const { rows } = await tx.query<{ channel_id: string; status: string }>(
    'SELECT channel_id, status FROM messages WHERE id = $1',
    [input.messageId],
  );
  const message = rows[0];
  if (!message) throw new HttpError(404, 'Message not found');
  await assertMember(tx, message.channel_id, input.userId);
  if (message.status === 'deleted') throw new HttpError(409, "Can't react to a deleted message");

  const result = input.on
    ? await tx.query(
        `INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES ($1, $2, $3, COALESCE($4, now()))
         ON CONFLICT DO NOTHING`,
        [input.messageId, input.userId, input.emoji, input.createdAt ?? null],
      )
    : await tx.query('DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [
        input.messageId,
        input.userId,
        input.emoji,
      ]);

  const changed = (result.rowCount ?? 0) > 0;
  if (changed) await enqueue(tx, 'ReactionChanged', input.messageId);

  const dto = await getMessageDto(tx, input.messageId);
  return { channelId: message.channel_id, reactions: dto!.reactions, changed };
}
