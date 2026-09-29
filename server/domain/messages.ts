import type { PoolClient } from 'pg';
import type { Db } from '../db.js';
import { HttpError } from '../errors.js';
import { parseMentions } from './mentions.js';
import { enqueue } from './outbox.js';
import type { MessageDto, ThreadDto } from '../../shared/types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_BODY_LENGTH = 4000;

// The single place a message becomes a DTO. Deleted text is never serialised.
const DTO_SELECT = `
  SELECT m.id,
         m.channel_id  AS "channelId",
         m.author_id   AS "authorId",
         m.parent_id   AS "parentId",
         CASE WHEN m.status = 'deleted' THEN '' ELSE m.body END AS body,
         m.status,
         m.version,
         m.created_at  AS "createdAt",
         m.edited_at   AS "editedAt",
         COALESCE(r.reply_count, 0)::int AS "replyCount",
         r.last_reply_at AS "lastReplyAt",
         COALESCE(x.reactions, '[]'::json) AS reactions
    FROM messages m
    LEFT JOIN LATERAL (
      SELECT count(*) AS reply_count, max(c.created_at) AS last_reply_at
        FROM messages c WHERE c.parent_id = m.id AND c.status = 'active'
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('emoji', g.emoji, 'userIds', g.user_ids) ORDER BY g.first_at) AS reactions
        FROM (SELECT emoji, array_agg(user_id ORDER BY created_at) AS user_ids, min(created_at) AS first_at
                FROM reactions WHERE message_id = m.id GROUP BY emoji) g
    ) x ON true`;

export async function getMessageDtos(db: Db, ids: string[]): Promise<MessageDto[]> {
  if (!ids.length) return [];
  const { rows } = await db.query<MessageDto>(`${DTO_SELECT} WHERE m.id = ANY($1::uuid[]) ORDER BY m.created_at, m.id`, [ids]);
  return rows;
}

export async function getMessageDto(db: Db, id: string): Promise<MessageDto | null> {
  return (await getMessageDtos(db, [id]))[0] ?? null;
}

/** The last `limit` top-level messages in a channel, oldest first. (Pagination is cut, §8.) */
export async function listChannelMessages(db: Db, channelId: string, limit = 100): Promise<MessageDto[]> {
  const { rows } = await db.query<MessageDto>(
    `${DTO_SELECT} WHERE m.channel_id = $1 AND m.parent_id IS NULL
      ORDER BY m.created_at DESC, m.id DESC LIMIT $2`,
    [channelId, limit],
  );
  return rows.reverse();
}

/** A thread: its root (a tombstone if deleted) plus replies, oldest first. Accepts a reply's id too. */
export async function getThread(db: Db, messageId: string, viewerId: string): Promise<ThreadDto> {
  const { rows } = await db.query<{ root_id: string; channel_id: string }>(
    'SELECT COALESCE(parent_id, id) AS root_id, channel_id FROM messages WHERE id = $1',
    [messageId],
  );
  if (!rows[0]) throw new HttpError(404, 'Message not found');
  await assertMember(db, rows[0].channel_id, viewerId);
  const root = await getMessageDto(db, rows[0].root_id);
  const { rows: replies } = await db.query<MessageDto>(
    `${DTO_SELECT} WHERE m.parent_id = $1 ORDER BY m.created_at, m.id`,
    [rows[0].root_id],
  );
  return { root: root!, replies };
}

export async function assertMember(db: Db, channelId: string, userId: string): Promise<void> {
  const { rowCount } = await db.query('SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2', [
    channelId,
    userId,
  ]);
  if (!rowCount) throw new HttpError(403, 'Not a member of this channel');
}

export type CreateMessageInput = {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  parentId?: string | null;
  /** Seeding only: backdates the message. Not exposed over HTTP. */
  createdAt?: Date;
};

/**
 * Creates a message, its mentions and thread subscriptions, and a
 * MessageCreated outbox event, all in the caller's transaction.
 *
 * Idempotent on the client-generated id: retrying the same create returns the
 * existing message (`created: false`) instead of duplicating it.
 */
export async function createMessage(
  tx: PoolClient,
  input: CreateMessageInput,
): Promise<{ message: MessageDto; created: boolean }> {
  const body = validateBody(input.body);
  const parentId = input.parentId ?? null;
  if (!UUID_RE.test(input.id)) throw new HttpError(400, 'id must be a UUID');
  await assertMember(tx, input.channelId, input.authorId);

  if (parentId) {
    const { rows } = await tx.query<{ channel_id: string; parent_id: string | null }>(
      'SELECT channel_id, parent_id FROM messages WHERE id = $1',
      [parentId],
    );
    const parent = rows[0];
    if (!parent || parent.channel_id !== input.channelId) throw new HttpError(404, 'Parent message not found in this channel');
    if (parent.parent_id) throw new HttpError(400, 'Replies can only be made to top-level messages');
  }

  const inserted = await tx.query(
    `INSERT INTO messages (id, channel_id, author_id, parent_id, body, created_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [input.id, input.channelId, input.authorId, parentId, body, input.createdAt ?? null],
  );

  if (!inserted.rowCount) {
    // Same id already exists: a retry of the same create, or a collision.
    const existing = await getMessageDto(tx, input.id);
    if (!existing || existing.authorId !== input.authorId || existing.channelId !== input.channelId) {
      throw new HttpError(409, 'A different message already uses this id');
    }
    return { message: existing, created: false };
  }

  const mentionedIds = await resolveMentions(tx, input.channelId, body);
  if (mentionedIds.length) {
    await tx.query('INSERT INTO mentions (message_id, user_id) SELECT $1, unnest($2::uuid[])', [input.id, mentionedIds]);
  }
  // Thread subscribers: root author, repliers, anyone mentioned in the thread (§2.2).
  await subscribeToThread(tx, parentId ?? input.id, [input.authorId, ...mentionedIds]);

  await enqueue(tx, 'MessageCreated', input.id);

  const message = await getMessageDto(tx, input.id);
  return { message: message!, created: true };
}

/**
 * Edits a message's text. Optimistic concurrency: the client says which
 * version it edited, and a mismatch is a 409 carrying the current message so
 * the client can show what changed (§4.1).
 */
export async function editMessage(
  tx: PoolClient,
  input: {
    id: string;
    userId: string;
    body: string;
    expectedVersion: number;
    /** Seeding only: backdates the edit. Not exposed over HTTP. */
    editedAt?: Date;
  },
): Promise<{ message: MessageDto; changed: boolean }> {
  const body = validateBody(input.body);
  const current = await lockOwnMessage(tx, input.id, input.userId);
  if (current.status === 'deleted') throw new HttpError(409, 'Message was deleted', { current: await getMessageDto(tx, input.id) });
  if (current.version !== input.expectedVersion) {
    throw new HttpError(409, 'Message was changed elsewhere', { current: await getMessageDto(tx, input.id) });
  }
  if (current.body === body) return { message: (await getMessageDto(tx, input.id))!, changed: false };

  await tx.query(
    'UPDATE messages SET body = $2, version = version + 1, edited_at = COALESCE($3, now()) WHERE id = $1',
    [input.id, body, input.editedAt ?? null],
  );

  // Re-sync mentions. Newly mentioned people also join the thread; people
  // whose mention was removed keep any subscription they already had.
  const mentionedIds = await resolveMentions(tx, current.channel_id, body);
  await tx.query('DELETE FROM mentions WHERE message_id = $1 AND NOT (user_id = ANY($2::uuid[]))', [input.id, mentionedIds]);
  if (mentionedIds.length) {
    await tx.query(
      'INSERT INTO mentions (message_id, user_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING',
      [input.id, mentionedIds],
    );
    await subscribeToThread(tx, current.parent_id ?? input.id, mentionedIds);
  }

  await enqueue(tx, 'MessageEdited', input.id);
  return { message: (await getMessageDto(tx, input.id))!, changed: true };
}

/**
 * Soft delete (§4.1). The row stays because replies, activity and search all
 * reference it; the text stays in the database but is never serialised.
 * Idempotent: deleting a deleted message is a no-op.
 */
export async function deleteMessage(
  tx: PoolClient,
  input: { id: string; userId: string },
): Promise<{ message: MessageDto; changed: boolean }> {
  const current = await lockOwnMessage(tx, input.id, input.userId);
  if (current.status === 'deleted') return { message: (await getMessageDto(tx, input.id))!, changed: false };
  await tx.query("UPDATE messages SET status = 'deleted', version = version + 1 WHERE id = $1", [input.id]);
  await enqueue(tx, 'MessageDeleted', input.id);
  return { message: (await getMessageDto(tx, input.id))!, changed: true };
}

type MessageRow = {
  id: string;
  channel_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  status: 'active' | 'deleted';
  version: number;
};

/** Row-locks a message for the rest of the transaction, and checks the caller wrote it. */
async function lockOwnMessage(tx: PoolClient, id: string, userId: string): Promise<MessageRow> {
  const { rows } = await tx.query<MessageRow>(
    'SELECT id, channel_id, author_id, parent_id, body, status, version FROM messages WHERE id = $1 FOR UPDATE',
    [id],
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, 'Message not found');
  if (row.author_id !== userId) throw new HttpError(403, 'You can only change your own messages');
  return row;
}

function validateBody(raw: string): string {
  const body = raw.trim();
  if (!body) throw new HttpError(400, 'Message body is empty');
  if (body.length > MAX_BODY_LENGTH) throw new HttpError(400, `Message body exceeds ${MAX_BODY_LENGTH} characters`);
  return body;
}

/** @handles in the body that belong to channel members. Mentions of anyone else are ignored (§2.2). */
async function resolveMentions(tx: PoolClient, channelId: string, body: string): Promise<string[]> {
  const handles = parseMentions(body);
  if (!handles.length) return [];
  const { rows } = await tx.query<{ id: string }>(
    `SELECT u.id FROM users u
       JOIN channel_members cm ON cm.user_id = u.id AND cm.channel_id = $1
      WHERE u.handle = ANY($2::text[])`,
    [channelId, handles],
  );
  return rows.map((u) => u.id);
}

async function subscribeToThread(tx: PoolClient, rootId: string, userIds: string[]) {
  await tx.query(
    `INSERT INTO thread_subscriptions (root_id, user_id)
     SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
    [rootId, userIds],
  );
}
