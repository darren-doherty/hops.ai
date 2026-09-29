import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { subscribersFor, type EventType } from '../consumers/registry.js';

/**
 * Records that something happened, in the caller's transaction (§4.1): one
 * immutable outbox event plus one delivery row per subscribed consumer.
 * Notifications are scheduled GRACE_MS in the future so quick edits and
 * deletes are respected before anything is sent (§2.6).
 */
export async function enqueue(tx: PoolClient, type: EventType, messageId: string): Promise<string> {
  const {
    rows: [event],
  } = await tx.query<{ id: string }>(
    'INSERT INTO outbox_events (type, message_id) VALUES ($1, $2) RETURNING id',
    [type, messageId],
  );

  const consumers = subscribersFor(type);
  if (consumers.length) {
    await tx.query(
      `INSERT INTO event_deliveries (event_id, consumer, next_attempt_at)
       SELECT $1, c, now() + (CASE WHEN c = 'notifications' THEN $3::int ELSE 0 END) * interval '1 millisecond'
         FROM unnest($2::text[]) AS c`,
      [event.id, consumers, config.graceMs],
    );
  }
  return event.id;
}
