// Development-only visibility into the delivery pipeline (the dev control
// panel is cut, §8: this JSON is its stand-in). Not authenticated.
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { faults, type Service } from '../fakes/network.js';

type FaultPatch = Partial<Record<Service, { failureRate?: number; latencyMs?: [number, number] }>>;

export async function debugRoutes(app: FastifyInstance) {
  app.get('/debug/deliveries', async () => {
    const [byStatus, failing, dead, recentNotifications] = await Promise.all([
      pool.query(
        `SELECT consumer,
                count(*) FILTER (WHERE status = 'done')::int AS done,
                -- Disjoint buckets for pending: first attempt due now, first attempt
                -- in the future (e.g. notification grace period), or failed and retrying.
                count(*) FILTER (WHERE status = 'pending' AND attempts = 0 AND next_attempt_at <= now())::int AS due,
                count(*) FILTER (WHERE status = 'pending' AND attempts = 0 AND next_attempt_at > now())::int AS scheduled,
                count(*) FILTER (WHERE status = 'pending' AND attempts > 0)::int AS retrying,
                count(*) FILTER (WHERE status = 'dead')::int AS dead,
                max(attempts) AS max_attempts
           FROM event_deliveries GROUP BY consumer ORDER BY consumer`,
      ),
      pool.query(
        `SELECT d.event_id AS "eventId", d.consumer, e.type, d.attempts, d.last_error AS "lastError",
                d.next_attempt_at AS "nextAttemptAt"
           FROM event_deliveries d JOIN outbox_events e ON e.id = d.event_id
          WHERE d.status = 'pending' AND d.attempts > 0
          ORDER BY d.next_attempt_at LIMIT 20`,
      ),
      pool.query(
        `SELECT d.event_id AS "eventId", d.consumer, e.type, d.attempts, d.last_error AS "lastError"
           FROM event_deliveries d JOIN outbox_events e ON e.id = d.event_id
          WHERE d.status = 'dead' ORDER BY d.event_id DESC LIMIT 20`,
      ),
      pool.query(
        `SELECT n.title, n.body, u.handle AS "to", n.sent_at AS "sentAt"
           FROM fake_notifications_sent n JOIN users u ON u.id = n.user_id
          ORDER BY n.sent_at DESC LIMIT 10`,
      ),
    ]);
    return {
      consumers: byStatus.rows,
      retrying: failing.rows,
      dead: dead.rows,
      faults,
      recentNotifications: recentNotifications.rows,
    };
  });

  /** Change fault injection at runtime, e.g. {"search": {"failureRate": 1}} to take search "down". */
  app.post<{ Body: FaultPatch }>('/debug/faults', async (req) => {
    for (const [service, patch] of Object.entries(req.body ?? {}) as [Service, FaultPatch[Service]][]) {
      if (!(service in faults) || !patch) throw new HttpError(400, `Unknown service: ${service}`);
      if (patch.failureRate !== undefined) {
        if (typeof patch.failureRate !== 'number' || patch.failureRate < 0 || patch.failureRate > 1) {
          throw new HttpError(400, 'failureRate must be between 0 and 1');
        }
        faults[service].failureRate = patch.failureRate;
      }
      if (patch.latencyMs !== undefined) {
        const [min, max] = patch.latencyMs;
        if (!(min >= 0 && max >= min)) throw new HttpError(400, 'latencyMs must be [min, max] with 0 <= min <= max');
        faults[service].latencyMs = [min, max];
      }
    }
    return faults;
  });
}
