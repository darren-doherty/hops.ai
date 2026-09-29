// Which consumers receive which events. Pure data (no imports) so the outbox
// can read it without pulling in consumer implementations.

export type EventType = 'MessageCreated' | 'MessageEdited' | 'MessageDeleted' | 'ReactionChanged';
export type ConsumerName = 'search' | 'activity' | 'notifications';

export const SUBSCRIPTIONS: Record<ConsumerName, EventType[]> = {
  search: ['MessageCreated', 'MessageEdited', 'MessageDeleted'],
  activity: ['MessageCreated', 'MessageEdited', 'MessageDeleted', 'ReactionChanged'],
  notifications: ['MessageCreated', 'MessageEdited'],
};

/**
 * Consumers that get delivery rows. Grows as each phase lands, so no rows pile
 * up for consumers that don't exist yet.
 */
export const ENABLED_CONSUMERS: ConsumerName[] = ['search', 'activity', 'notifications'];

export function subscribersFor(type: EventType): ConsumerName[] {
  return ENABLED_CONSUMERS.filter((c) => SUBSCRIPTIONS[c].includes(type));
}
