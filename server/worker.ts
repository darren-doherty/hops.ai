// Delivers outbox events to consumers (§4.2). Each (event, consumer) delivery
// is claimed, processed and retried independently, so a failing search index
// never blocks the activity feed or notifications.
import type pg from 'pg';
import { pool, withTx, type Db } from './db.js';
import { handlers } from './consumers/index.js';
import type { ConsumerName, EventType } from './consumers/registry.js';
import type { OutboxEvent } from './consumers/types.js';

const BATCH_SIZE = 50;
const LEASE = '30 seconds';
const TICK_INTERVAL_MS = 250;
export const MAX_ATTEMPTS = 10;
const MAX_BACKOFF_MS = 5 * 60_000;

type Delivery = {
  eventId: string;
  consumer: ConsumerName;
  attempts: number;
  type: EventType;
  messageId: string;
  eventCreatedAt: Date;
};

type Logger = { warn(msg: string): void; error(msg: string): void };
let log: Logger = console;

/** 1s, 2s, 4s … capped at 5 minutes, with ±20% jitter so retries don't stampede. */
export function backoffMs(attempt: number, random = Math.random): number {
  const base = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return Math.round(base * (0.8 + random() * 0.4));
}

/**
 * Claims due deliveries by taking a lease (locked_until). SKIP LOCKED makes
 * this safe with several workers; if a worker crashes, its lease expires and
 * the delivery becomes claimable again.
 */
async function claim(limit: number, consumers?: ConsumerName[]): Promise<Delivery[]> {
  const { rows } = await pool.query<Delivery>(
    `WITH due AS (
       SELECT event_id, consumer FROM event_deliveries
        WHERE status = 'pending'
          AND next_attempt_at <= now()
          AND (locked_until IS NULL OR locked_until < now())
          AND ($2::text[] IS NULL OR consumer = ANY($2::text[]))
        ORDER BY next_attempt_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE event_deliveries d
        SET locked_until = now() + interval '${LEASE}'
       FROM due, outbox_events e
      WHERE d.event_id = due.event_id AND d.consumer = due.consumer AND e.id = d.event_id
     RETURNING d.event_id AS "eventId", d.consumer, d.attempts, e.type,
               e.message_id AS "messageId", e.created_at AS "eventCreatedAt"`,
    [limit, consumers ?? null],
  );
  return rows;
}

async function markDone(db: Db, d: Delivery) {
  await db.query(
    `UPDATE event_deliveries
        SET status = 'done', done_at = now(), attempts = attempts + 1, locked_until = NULL, last_error = NULL
      WHERE event_id = $1 AND consumer = $2 AND status = 'pending'`,
    [d.eventId, d.consumer],
  );
}

async function markFailed(d: Delivery, err: unknown) {
  const attempt = d.attempts + 1;
  const dead = attempt >= MAX_ATTEMPTS;
  const delay = backoffMs(attempt);
  const message = err instanceof Error ? err.message : String(err);
  await pool.query(
    `UPDATE event_deliveries
        SET attempts = $3, last_error = $4, locked_until = NULL,
            status = CASE WHEN $5 THEN 'dead' ELSE 'pending' END,
            next_attempt_at = now() + $6::int * interval '1 millisecond'
      WHERE event_id = $1 AND consumer = $2`,
    [d.eventId, d.consumer, attempt, message, dead, delay],
  );
  log.warn(
    `[worker] ${d.consumer} failed ${d.type} (event ${d.eventId}, attempt ${attempt}): ${message}` +
      (dead ? ' → dead' : ` → retry in ${(delay / 1000).toFixed(1)}s`),
  );
}

async function deliver(d: Delivery) {
  const handler = handlers[d.consumer];
  const event: OutboxEvent = { id: d.eventId, type: d.type, messageId: d.messageId, createdAt: d.eventCreatedAt };
  try {
    if (!handler) throw new Error(`No handler registered for consumer "${d.consumer}"`);
    if (handler.local) {
      // Projection write and delivery bookkeeping commit together: exactly-once effect.
      const afterCommit = await withTx(async (tx: pg.PoolClient) => {
        const callback = await handler.handle(event, tx);
        await markDone(tx, d);
        return callback;
      });
      afterCommit?.();
    } else {
      await handler.handle(event);
      await markDone(pool, d);
    }
  } catch (err) {
    await markFailed(d, err).catch((e) => log.error(`[worker] could not record failure: ${String(e)}`));
  }
}

/** Claims one batch of due deliveries and processes them concurrently. Returns how many were claimed. */
export async function tick(opts: { consumers?: ConsumerName[] } = {}): Promise<number> {
  const batch = await claim(BATCH_SIZE, opts.consumers);
  await Promise.allSettled(batch.map(deliver));
  return batch.length;
}

/** Processes until nothing is due. For tests and seeding. */
export async function drain(opts: { consumers?: ConsumerName[] } = {}): Promise<number> {
  let total = 0;
  for (let n = await tick(opts); n > 0; n = await tick(opts)) total += n;
  return total;
}

let running = false;
let timer: NodeJS.Timeout | undefined;

/** Single-flight loop: the next tick is scheduled only after the current one finishes. */
export function start(logger: Logger = console) {
  log = logger;
  if (running) return;
  running = true;
  const loop = async () => {
    try {
      await tick();
    } catch (err) {
      log.error(`[worker] tick failed: ${String(err)}`);
    }
    if (running) timer = setTimeout(loop, TICK_INTERVAL_MS);
  };
  void loop();
}

export function stop() {
  running = false;
  clearTimeout(timer);
}
