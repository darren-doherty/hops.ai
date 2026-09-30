// Fake push/email notification service. Honours an idempotency key, as real
// providers do (e.g. Stripe, APNs collapse ids): at-least-once delivery from
// our side, de-duplicated on theirs, so a retry after a lost response can't
// notify someone twice.
//
// "Delivery to the device" is simulated by pushing to the recipient's open
// tabs, which show a toast: the in-app stand-in for a phone buzzing.
import { pool } from '../db.js';
import { publish, userTopic } from '../realtime/hub.js';
import { callExternal } from './network.js';
import type { NotificationDto } from '../../shared/types.js';

export type Notification = {
  idempotencyKey: string;
  userId: string;
  title: string;
  body: string;
  link: NotificationDto['link'];
};

export const notificationSender = {
  send(n: Notification): Promise<{ delivered: boolean }> {
    return callExternal('notify', async () => {
      const { rowCount } = await pool.query(
        `INSERT INTO fake_notifications_sent (idempotency_key, user_id, title, body)
         VALUES ($1, $2, $3, $4) ON CONFLICT (idempotency_key) DO NOTHING`,
        [n.idempotencyKey, n.userId, n.title, n.body],
      );
      const delivered = rowCount === 1;
      if (delivered) {
        publish(userTopic(n.userId), {
          type: 'notification.received',
          notification: { id: n.idempotencyKey, title: n.title, body: n.body, link: n.link },
        });
      }
      // Plain console lines (not JSON logs) so they're easy to spot in a demo.
      console.log(delivered ? `🔔 ${n.title}: "${n.body}"` : `🔕 duplicate suppressed by idempotency key ${n.idempotencyKey}`);
      return { delivered };
    });
  },
};
