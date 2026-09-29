// Reading the activity feed (§2.4). Items store references, not snapshots:
// every read joins to the live message, so edits show up immediately and
// deleted messages / removed mentions are hidden even before the activity
// consumer has caught up.
import { pool, type Db } from '../db.js';
import { HttpError } from '../errors.js';
import { publish, userTopic } from '../realtime/hub.js';
import type { ActivityFeedDto, ActivityItemDto } from '../../shared/types.js';

// Shared by the list and the unread badge, so the two can never disagree.
const VISIBLE_WHERE = `
   WHERE a.user_id = $1
     AND m.status = 'active'
     AND (a.reason <> 'mention' OR EXISTS (
           SELECT 1 FROM mentions x WHERE x.message_id = a.message_id AND x.user_id = a.user_id))`;

export async function listActivity(db: Db, userId: string, limit = 50): Promise<ActivityItemDto[]> {
  const { rows } = await db.query<ActivityItemDto>(
    `SELECT a.id, a.reason, a.count,
            a.actor_ids   AS "actorIds",
            a.latest_at   AS "latestAt",
            a.read_at     AS "readAt",
            a.channel_id  AS "channelId",
            m.id          AS "messageId",
            m.parent_id   AS "parentId",
            m.body        AS preview,
            m.edited_at   AS "editedAt",
            CASE WHEN m.parent_id IS NULL THEN NULL ELSE json_build_object(
              'authorId', root.author_id,
              'body', CASE WHEN root.status = 'deleted' THEN '' ELSE root.body END,
              'deleted', root.status = 'deleted') END AS root,
            CASE WHEN a.reason = 'reaction' THEN ARRAY(
              SELECT emoji FROM reactions r WHERE r.message_id = m.id AND r.user_id <> m.author_id
               GROUP BY emoji ORDER BY min(r.created_at)) ELSE '{}' END AS emojis
       FROM activities a
       JOIN messages m ON m.id = a.message_id
       LEFT JOIN messages root ON root.id = m.parent_id
     ${VISIBLE_WHERE}
      ORDER BY a.latest_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

export async function unreadCount(db: Db, userId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM activities a JOIN messages m ON m.id = a.message_id
     ${VISIBLE_WHERE} AND a.read_at IS NULL`,
    [userId],
  );
  return rows[0].n;
}

export async function getFeed(db: Db, userId: string): Promise<ActivityFeedDto> {
  const [items, count] = await Promise.all([listActivity(db, userId), unreadCount(db, userId)]);
  return { items, unreadCount: count };
}

export async function markRead(userId: string, activityId: string): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE activities SET read_at = COALESCE(read_at, now()), last_read_at = COALESCE(read_at, now())
      WHERE id = $1 AND user_id = $2`,
    [activityId, userId],
  );
  if (!rowCount) throw new HttpError(404, 'Activity not found');
  await publishUnreadCounts([userId]);
}

export async function markAllRead(userId: string): Promise<void> {
  await pool.query(
    'UPDATE activities SET read_at = now(), last_read_at = now() WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  await publishUnreadCounts([userId]);
}

/** Tells each user's open tabs that their feed changed. Best-effort, after commit. */
export async function publishUnreadCounts(userIds: Iterable<string>): Promise<void> {
  await Promise.all(
    [...new Set(userIds)].map(async (userId) => {
      publish(userTopic(userId), { type: 'activity.changed', unreadCount: await unreadCount(pool, userId) });
    }),
  );
}
