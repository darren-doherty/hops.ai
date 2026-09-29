import type { PoolClient } from 'pg';
import type { ConsumerName, EventType } from './registry.js';

/** Thin event: consumers load current state rather than trusting the payload (§4.1). */
export type OutboxEvent = {
  id: string;
  type: EventType;
  messageId: string;
  createdAt: Date;
};

/** Talks to an external system: at-least-once, made safe by versions or idempotency keys. */
export type ExternalConsumer = {
  name: ConsumerName;
  local: false;
  handle(event: OutboxEvent): Promise<void>;
};

/**
 * Writes to our own database: runs in the same transaction that marks the
 * delivery done, so each event takes effect exactly once. May return a
 * callback to run after commit (e.g. realtime pushes).
 */
export type LocalConsumer = {
  name: ConsumerName;
  local: true;
  handle(event: OutboxEvent, tx: PoolClient): Promise<(() => void) | void>;
};

export type Consumer = ExternalConsumer | LocalConsumer;
