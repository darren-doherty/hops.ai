// The activity feed projection (§4.3). Every event recomputes the affected
// groups from the source of truth instead of applying +1/-1 deltas. The result
// is a pure function of current state, so duplicate, late and out-of-order
// events all converge to the same feed.
//
// Runs inside the worker's transaction together with marking the delivery
// done, so each event takes effect exactly once.
import type { PoolClient } from 'pg';
import { computeRecipients, type AttentionMessage } from '../domain/attention.js';
import { publishUnreadCounts } from '../domain/activityFeed.js';
import type { ActivityReason } from '../../shared/types.js';
import type { LocalConsumer } from './types.js';

type Row = AttentionMessage & { createdAt: Date; editedAt: Date | null };

export const activityConsumer: LocalConsumer = {
  name: 'activity',
  local: true,
  async handle(event, tx) {
    const { rows } = await tx.query<Row>(
      `SELECT m.id, m.channel_id AS "channelId", c.kind AS "channelKind", m.author_id AS "authorId",
              m.parent_id AS "parentId", m.status, m.created_at AS "createdAt", m.edited_at AS "editedAt"
         FROM messages m JOIN channels c ON c.id = m.channel_id
        WHERE m.id = $1`,
      [event.messageId],
    );
    const message = rows[0];
    if (!message) return;

    // Serialise recomputes of the same group across concurrent workers, so a
    // slower transaction can't overwrite a newer result. Lock order is fixed
    // (channel, then message) to avoid deadlocks.
    if (message.channelKind === 'dm') await lock(tx, `dm:${message.channelId}`);
    await lock(tx, `msg:${message.id}`);

    const affected = new Set<string>();
    if (message.channelKind === 'dm') {
      await recomputeDmGroup(tx, message.channelId, affected);
    } else {
      await recomputeMessageGroup(tx, message, affected);
    }
    await recomputeReactionGroup(tx, message, affected);

    // After commit: push fresh unread counts to anyone whose feed changed.
    return () => void publishUnreadCounts(affected).catch(() => {});
  },
};

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

async function lock(tx: PoolClient, key: string) {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`activity:${key}`]);
}

type Upsert = {
  userId: string;
  groupKey: string;
  reason: ActivityReason;
  messageId: string;
  channelId: string;
  actorIds: string[];
  count: number;
  latestAt: Date;
  /**
   * Whether latestAt tracks the group's newest content (reactions, DMs). If so,
   * advancing it marks the item unread again. Message groups keep their
   * original time, so edits never make an item unread.
   */
  bumpLatest: boolean;
};

async function upsert(tx: PoolClient, a: Upsert) {
  await tx.query(
    `INSERT INTO activities (user_id, group_key, reason, message_id, channel_id, actor_ids, count, latest_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, group_key) DO UPDATE SET
       reason = EXCLUDED.reason,
       message_id = EXCLUDED.message_id,
       channel_id = EXCLUDED.channel_id,
       actor_ids = EXCLUDED.actor_ids,
       count = EXCLUDED.count,
       -- Unread again when something new arrives, or when an edit newly mentions you.
       read_at = CASE
         WHEN $9 AND EXCLUDED.latest_at > activities.latest_at THEN NULL
         WHEN EXCLUDED.reason = 'mention' AND activities.reason <> 'mention' THEN NULL
         ELSE activities.read_at END,
       latest_at = CASE WHEN $9 THEN EXCLUDED.latest_at ELSE activities.latest_at END`,
    [a.userId, a.groupKey, a.reason, a.messageId, a.channelId, a.actorIds, a.count, a.latestAt, a.bumpLatest],
  );
}

/** Deletes a group's rows, except for the given users. Records who was affected. */
async function removeGroup(tx: PoolClient, groupKey: string, keepUserIds: string[], affected: Set<string>) {
  const { rows } = await tx.query<{ user_id: string }>(
    'DELETE FROM activities WHERE group_key = $1 AND NOT (user_id = ANY($2::uuid[])) RETURNING user_id',
    [groupKey, keepUserIds],
  );
  for (const r of rows) affected.add(r.user_id);
}

/** Mentions and thread replies: one item per (user, message). */
async function recomputeMessageGroup(tx: PoolClient, m: Row, affected: Set<string>) {
  const groupKey = `msg:${m.id}`;
  const recipients = await computeRecipients(tx, m); // [] when deleted
  for (const r of recipients) {
    await upsert(tx, {
      userId: r.userId,
      groupKey,
      reason: r.reason,
      messageId: m.id,
      channelId: m.channelId,
      actorIds: [m.authorId],
      count: 1,
      // A mention added by a later edit is new to that user, so it's placed at the edit time.
      latestAt: m.editedAt ?? m.createdAt,
      bumpLatest: false,
    });
    affected.add(r.userId);
  }
  // Anyone no longer a recipient (message deleted, mention edited out) loses the item.
  await removeGroup(tx, groupKey, recipients.map((r) => r.userId), affected);
}

/** Reactions on a message, grouped into one item for its author. */
async function recomputeReactionGroup(tx: PoolClient, m: Row, affected: Set<string>) {
  const groupKey = `reaction:${m.id}`;
  const { rows } = m.status === 'deleted'
    ? { rows: [] }
    : await tx.query<{ user_id: string; latest: Date }>(
        `SELECT user_id, max(created_at) AS latest FROM reactions
          WHERE message_id = $1 AND user_id <> $2
          GROUP BY user_id ORDER BY latest DESC`,
        [m.id, m.authorId],
      );

  if (!rows.length) {
    await removeGroup(tx, groupKey, [], affected);
    return;
  }
  await upsert(tx, {
    userId: m.authorId,
    groupKey,
    reason: 'reaction',
    messageId: m.id,
    channelId: m.channelId,
    actorIds: rows.map((r) => r.user_id),
    count: rows.length,
    latestAt: rows[0].latest,
    bumpLatest: true,
  });
  affected.add(m.authorId);
}

/**
 * One item per DM conversation per member: the messages from others since
 * that member last read the item ("Alice sent you 3 messages"). Counts from
 * last_read_at, not read_at: read_at is cleared as soon as a new message makes
 * the item unread, and counting from it would then include the whole history.
 */
async function recomputeDmGroup(tx: PoolClient, channelId: string, affected: Set<string>) {
  const groupKey = `dm:${channelId}`;
  const { rows: members } = await tx.query<{
    user_id: string;
    read_at: Date | null;
    last_read_at: Date | null;
    last_sent_at: Date | null;
    has_row: boolean;
  }>(
    `SELECT cm.user_id, a.read_at, a.last_read_at, a.id IS NOT NULL AS has_row,
            (SELECT max(created_at) FROM messages
              WHERE channel_id = cm.channel_id AND author_id = cm.user_id) AS last_sent_at
       FROM channel_members cm
       LEFT JOIN activities a ON a.user_id = cm.user_id AND a.group_key = $1
      WHERE cm.channel_id = $2`,
    [groupKey, channelId],
  );

  for (const member of members) {
    // Replying in a conversation means you've read it up to that point (as in Slack).
    const seenUntil = latest(member.last_read_at, member.last_sent_at);
    const { rows: unread } = await tx.query<{ id: string; author_id: string; created_at: Date }>(
      `SELECT id, author_id, created_at FROM messages
        WHERE channel_id = $1 AND author_id <> $2 AND status = 'active'
          AND created_at > COALESCE($3::timestamptz, '-infinity')
        ORDER BY created_at DESC, id DESC`,
      [channelId, member.user_id, seenUntil],
    );

    if (!unread.length) {
      // Nothing new. If the member replied since, the item is read; if its
      // messages were deleted instead, it disappears. A read item stays as history.
      if (member.has_row && !member.read_at) {
        if (member.last_sent_at && seenUntil === member.last_sent_at) {
          await tx.query(
            'UPDATE activities SET read_at = $3, last_read_at = $3 WHERE user_id = $1 AND group_key = $2',
            [member.user_id, groupKey, member.last_sent_at],
          );
        } else {
          await tx.query('DELETE FROM activities WHERE user_id = $1 AND group_key = $2', [member.user_id, groupKey]);
        }
        affected.add(member.user_id);
      }
      continue;
    }
    await upsert(tx, {
      userId: member.user_id,
      groupKey,
      reason: 'dm',
      messageId: unread[0].id,
      channelId,
      actorIds: [...new Set(unread.map((r) => r.author_id))],
      count: unread.length,
      latestAt: unread[0].created_at,
      bumpLatest: true,
    });
    affected.add(member.user_id);
  }
}
