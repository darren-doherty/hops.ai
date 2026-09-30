// Notifications (§2.6). Deliveries are scheduled GRACE_MS after the change, and
// this consumer decides from the message's *current* state, so:
//   - deleted during the grace period       → nothing is sent
//   - mention edited out during the period  → that person isn't notified
//   - edited during the period              → the latest text is sent
// It can't recall a notification once sent; the grace period is the guarantee.
import { config } from '../config.js';
import { pool } from '../db.js';
import { computeRecipients, type AttentionMessage } from '../domain/attention.js';
import { notificationSender } from '../fakes/notificationSender.js';
import type { ExternalConsumer } from './types.js';

type Row = AttentionMessage & {
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  authorName: string;
  channelName: string;
};

const PREVIEW_LENGTH = 140;

export const notificationsConsumer: ExternalConsumer = {
  name: 'notifications',
  local: false,
  async handle(event) {
    const { rows } = await pool.query<Row>(
      `SELECT m.id, m.channel_id AS "channelId", c.kind AS "channelKind", m.author_id AS "authorId",
              m.parent_id AS "parentId", m.status, m.body, m.created_at AS "createdAt", m.edited_at AS "editedAt",
              u.name AS "authorName", c.name AS "channelName"
         FROM messages m
         JOIN channels c ON c.id = m.channel_id
         JOIN users u ON u.id = m.author_id
        WHERE m.id = $1`,
      [event.messageId],
    );
    const m = rows[0];
    if (!m) return;

    // After an outage, don't flood people with old news. Also keeps seeding quiet.
    const changedAt = (m.editedAt ?? m.createdAt).getTime();
    if (Date.now() - changedAt > config.staleMs) return;

    if (m.status === 'deleted') {
      console.log(`🔕 not sent: message was deleted during the grace period (${event.type} ${m.id})`);
      return; // skipping counts as success
    }

    // Current state: a mention removed by an edit is simply no longer a recipient.
    const recipients = (await computeRecipients(pool, m)).filter((r) => r.alert);
    const preview = m.body.length > PREVIEW_LENGTH ? `${m.body.slice(0, PREVIEW_LENGTH - 1)}…` : m.body;
    const firstName = m.authorName.split(' ')[0];

    // The key is per message and person, not per event: a later edit doesn't
    // notify again, but a mention added by an edit does (new person, new key).
    const keys = recipients.map((r) => `${m.id}:${r.userId}`);
    const { rows: acked } = await pool.query<{ idempotency_key: string }>(
      'SELECT idempotency_key FROM notification_acks WHERE idempotency_key = ANY($1::text[])',
      [keys],
    );
    const done = new Set(acked.map((a) => a.idempotency_key));

    // Try everyone still outstanding; record each acknowledgement as it comes
    // back. Retries then only cover the failures, instead of needing every
    // recipient to succeed in the same attempt.
    const failures: unknown[] = [];
    for (const [i, r] of recipients.entries()) {
      if (done.has(keys[i])) continue;
      const title = r.reason === 'dm' ? `${firstName} sent you a message` : `${firstName} mentioned you in #${m.channelName}`;
      try {
        await notificationSender.send({
          idempotencyKey: keys[i],
          userId: r.userId,
          title,
          body: preview,
          link: { channelId: m.channelId, messageId: m.id, parentId: m.parentId },
        });
        await pool.query('INSERT INTO notification_acks (idempotency_key) VALUES ($1) ON CONFLICT DO NOTHING', [keys[i]]);
      } catch (err) {
        failures.push(err);
      }
    }
    if (failures.length) {
      throw new Error(`${failures.length} of ${recipients.length} notifications failed: ${String(failures[0])}`);
    }
  },
};
