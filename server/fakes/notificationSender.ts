// Fake push/email notification service. Honours an idempotency key, as real
// providers do (e.g. Stripe, APNs collapse ids): at-least-once delivery from
// our side, de-duplicated on theirs, so a retry after a lost response can't
// notify someone twice.
import { pool } from '../db.js';
import { callExternal } from './network.js';

export type Notification = { idempotencyKey: string; userId: string; title: string; body: string };

export const notificationSender = {
  send(n: Notification): Promise<{ delivered: boolean }> {
    return callExternal('notify', async () => {
      const { rowCount } = await pool.query(
        `INSERT INTO fake_notifications_sent (idempotency_key, user_id, title, body)
         VALUES ($1, $2, $3, $4) ON CONFLICT (idempotency_key) DO NOTHING`,
        [n.idempotencyKey, n.userId, n.title, n.body],
      );
      const delivered = rowCount === 1;
      // Plain console lines (not JSON logs) so they're easy to spot in a demo.
      console.log(delivered ? `🔔 ${n.title}: "${n.body}"` : `🔕 duplicate suppressed by idempotency key ${n.idempotencyKey}`);
      return { delivered };
    });
  },
};
