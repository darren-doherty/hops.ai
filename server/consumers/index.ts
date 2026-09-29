import { activityConsumer } from './activity.js';
import type { ConsumerName } from './registry.js';
import { searchConsumer } from './search.js';
import type { Consumer } from './types.js';

export const handlers: Partial<Record<ConsumerName, Consumer>> = {
  search: searchConsumer,
  activity: activityConsumer,
};
