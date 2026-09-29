// Who should hear about a message, and why (§2.2). The single source of truth
// for both the activity feed and notifications, so their rules can't drift:
// notifications are simply the recipients with alert = true.
import type { Db } from '../db.js';
import type { ActivityReason } from '../../shared/types.js';

export type Recipient = { userId: string; reason: Exclude<ActivityReason, 'reaction'>; alert: boolean };

export type AttentionMessage = {
  id: string;
  channelId: string;
  channelKind: 'public' | 'dm';
  authorId: string;
  parentId: string | null;
  status: 'active' | 'deleted';
};

/**
 * Priority when rules overlap: dm > mention > participating. One entry per
 * user, never the author. Reactions are handled separately (they're about
 * the author's message, not a message sent to someone).
 */
export async function computeRecipients(db: Db, m: AttentionMessage): Promise<Recipient[]> {
  if (m.status === 'deleted') return [];

  // DMs: everything is for the other member(s). Mentions and threads inside a
  // DM are already covered by the DM group.
  if (m.channelKind === 'dm') {
    const { rows } = await db.query<{ user_id: string }>(
      'SELECT user_id FROM channel_members WHERE channel_id = $1 AND user_id <> $2',
      [m.channelId, m.authorId],
    );
    return rows.map((r) => ({ userId: r.user_id, reason: 'dm', alert: true }));
  }

  const recipients = new Map<string, Recipient>();

  // Mentions were already filtered to channel members when the message was written.
  const mentions = await db.query<{ user_id: string }>(
    'SELECT user_id FROM mentions WHERE message_id = $1 AND user_id <> $2',
    [m.id, m.authorId],
  );
  for (const r of mentions.rows) recipients.set(r.user_id, { userId: r.user_id, reason: 'mention', alert: true });

  if (m.parentId) {
    const subscribers = await db.query<{ user_id: string }>(
      'SELECT user_id FROM thread_subscriptions WHERE root_id = $1 AND user_id <> $2',
      [m.parentId, m.authorId],
    );
    for (const r of subscribers.rows) {
      if (!recipients.has(r.user_id)) {
        recipients.set(r.user_id, { userId: r.user_id, reason: 'participating', alert: false });
      }
    }
  }

  return [...recipients.values()];
}
