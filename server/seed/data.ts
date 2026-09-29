// Static seed data: people and places for a busy ~20-person team.

export const USERS: { handle: string; name: string }[] = [
  { handle: 'alice', name: 'Alice Chen' },
  { handle: 'bob', name: 'Bob Okafor' },
  { handle: 'carol', name: 'Carol Martínez' },
  { handle: 'dave', name: 'Dave Kowalski' },
  { handle: 'erin', name: 'Erin Walsh' },
  { handle: 'farid', name: 'Farid Haddad' },
  { handle: 'grace', name: 'Grace Liu' },
  { handle: 'hiro', name: 'Hiro Tanaka' },
  { handle: 'ines', name: 'Inês Costa' },
  { handle: 'jamal', name: 'Jamal Wright' },
  { handle: 'kate', name: 'Kate Novak' },
  { handle: 'leo', name: 'Leo Fischer' },
  { handle: 'maya', name: 'Maya Patel' },
  { handle: 'nate', name: 'Nate Brooks' },
  { handle: 'olga', name: 'Olga Ivanova' },
  { handle: 'priya', name: 'Priya Raman' },
  { handle: 'quinn', name: 'Quinn Murphy' },
  { handle: 'rosa', name: 'Rosa Delgado' },
  { handle: 'sam', name: 'Sam Adeyemi' },
  { handle: 'tom', name: 'Tom Lindqvist' },
];

export const AVATAR_COLORS = [
  '#e11d48', '#d97706', '#059669', '#0284c7', '#7c3aed',
  '#db2777', '#65a30d', '#0891b2', '#4f46e5', '#c2410c',
];

/**
 * members: 'all', or an explicit handle list. A few channels are deliberately
 * small so "mentions of non-members are ignored" (§2.2) can be exercised —
 * e.g. dave is not in #engineering.
 */
export const CHANNELS: { name: string; topic: string; members: 'all' | string[] }[] = [
  { name: 'general', topic: 'Company-wide announcements and chatter', members: 'all' },
  { name: 'random', topic: 'Non-work banter', members: 'all' },
  {
    name: 'engineering',
    topic: 'Building the thing',
    members: ['alice', 'bob', 'carol', 'erin', 'farid', 'hiro', 'jamal', 'leo', 'nate', 'olga', 'quinn', 'tom'],
  },
  {
    name: 'product',
    topic: 'Roadmap, specs and customer feedback',
    members: ['alice', 'bob', 'carol', 'dave', 'grace', 'ines', 'kate', 'maya', 'priya', 'sam'],
  },
  { name: 'design', topic: 'Critiques and inspiration', members: ['alice', 'carol', 'grace', 'ines', 'maya', 'rosa'] },
  { name: 'incidents', topic: 'Something is on fire', members: ['alice', 'bob', 'erin', 'farid', 'hiro', 'nate', 'olga', 'tom'] },
  {
    name: 'releases',
    topic: 'What shipped and when',
    members: ['alice', 'bob', 'carol', 'dave', 'erin', 'hiro', 'kate', 'leo', 'priya', 'quinn'],
  },
  { name: 'leadership', topic: 'Planning and priorities', members: ['alice', 'dave', 'kate', 'priya', 'sam'] },
];

type SeedReply = { author: string; text: string; after: number /* minutes after parent */ };
export type SeedMessage = {
  /** Channel name, or dm:<a>:<b> for DMs */
  channel: string;
  author: string;
  text: string;
  minutesAgo: number;
  replies?: SeedReply[];
  /** [handle, emoji, minutes after the message] */
  reactions?: [string, string, number][];
  edit?: { text: string; after: number };
  /** Deleted after its replies were written: shows the tombstone-with-replies case */
  deleted?: boolean;
};

/**
 * Hand-written conversation so the app looks like a real team. Phase 5 adds a
 * generated bulk seed on top. Note: @dave in #engineering is intentional
 * (dave isn't a member, so the mention is ignored).
 */
export const SEED_MESSAGES: SeedMessage[] = [
  // #general
  { channel: 'general', author: 'kate', text: 'Morning all! Reminder that the all-hands moved to Thursday 3pm.', minutesAgo: 2880 },
  { channel: 'general', author: 'sam', text: 'Welcome @tom to the team! Tom is joining platform engineering 🎉', minutesAgo: 2700,
    reactions: [['alice', '🎉', 3], ['bob', '🎉', 4], ['kate', '❤️', 6], ['grace', '🎉', 9], ['tom', '🙏', 10]],
    replies: [
      { author: 'tom', text: 'Thanks everyone, excited to be here!', after: 5 },
      { author: 'alice', text: 'Welcome Tom! Grab me any time if you want a tour of the codebase.', after: 12 },
    ] },
  { channel: 'general', author: 'priya', text: 'Q3 customer survey results are in the product drive. NPS is up 8 points.', minutesAgo: 1500 },
  { channel: 'general', author: 'grace', text: 'Office wifi will be down for maintenance tonight 10pm–midnight.', minutesAgo: 400 },
  { channel: 'general', author: 'kate', text: 'Friendly reminder to submit expenses by Friday.', minutesAgo: 90 },

  // #engineering
  { channel: 'engineering', author: 'bob', text: 'Heads up: I\'m bumping the Postgres minor version on staging this afternoon.', minutesAgo: 2600 },
  { channel: 'engineering', author: 'erin', text: 'CI is flaky on the payments suite again. Anyone looking at it?', minutesAgo: 2400,
    replies: [
      { author: 'farid', text: 'I think it\'s the clock-dependent test. I\'ll pin the time.', after: 8 },
      { author: 'erin', text: 'Thanks @farid 🙏', after: 10 },
    ] },
  { channel: 'engineering', author: 'alice', text: 'RFC for the new activity feed is up for review: projection-based, fed by the outbox. Feedback welcome @bob @carol', minutesAgo: 1440,
    reactions: [['bob', '👍', 20], ['carol', '❤️', 50], ['erin', '👀', 90]],
    replies: [
      { author: 'bob', text: 'Read it. Love the per-consumer delivery rows. How do we handle a consumer being down for a day?', after: 30 },
      { author: 'alice', text: 'Exponential backoff capped at 5 minutes, then dead-letter after 10 attempts. Notifications also drop anything older than 15 min.', after: 42 },
      { author: 'carol', text: 'Can we make sure deleted messages disappear from the feed straight away, not just when the consumer catches up?', after: 55 },
    ] },
  { channel: 'engineering', author: 'hiro', text: 'Anyone else seeing slow builds since the Node 24 upgrade?', minutesAgo: 900 },
  { channel: 'engineering', author: 'jamal', text: 'Can someone from product confirm the rollout plan? cc @dave', minutesAgo: 700 },
  { channel: 'engineering', author: 'nate', text: 'Deploy of api v2.14 is done ✅', minutesAgo: 300,
    edit: { text: 'Deploy of api v2.14 is done ✅ (search change rolled back, see #incidents)', after: 7 } },
  { channel: 'engineering', author: 'olga', text: 'Search latency p95 is up to 800ms, I\'m investigating.', minutesAgo: 120 },
  { channel: 'engineering', author: 'quinn', text: 'PR for the rate limiter is ready: tiny change, big impact. @alice would you mind taking a look?', minutesAgo: 25 },
  { channel: 'engineering', author: 'leo', text: 'Lunch order going in at 12:30 if anyone wants in', minutesAgo: 6 },
  { channel: 'engineering', author: 'alice', text: 'Shipping the activity feed behind a flag tomorrow morning.', minutesAgo: 50,
    reactions: [['bob', '🎉', 12], ['carol', '🎉', 31], ['hiro', '👍', 35], ['erin', '👀', 40]],
    replies: [
      { author: 'bob', text: '🚀 nice! I\'ll keep an eye on the worker metrics.', after: 10 },
      { author: 'carol', text: '@alice can we demo it at the all-hands?', after: 30 },
    ] },

  // #product
  { channel: 'product', author: 'maya', text: 'Draft spec for thread muting is ready. Mostly borrowing Slack\'s model.', minutesAgo: 2000 },
  { channel: 'product', author: 'ines', text: 'Customer interview notes from Acme: they want a digest instead of per-message notifications.', minutesAgo: 1300,
    replies: [
      { author: 'priya', text: 'That lines up with the survey. Grouping is the #1 request.', after: 20 },
      { author: 'dave', text: 'Let\'s prioritise it for next quarter. @maya can you size it?', after: 45 },
    ] },
  { channel: 'product', author: 'carol', text: 'Should reactions notify? My gut says no: activity yes, push no.', minutesAgo: 500 },
  { channel: 'product', author: 'dave', text: 'Roadmap review moved to Monday.', minutesAgo: 60 },

  // #design
  { channel: 'design', author: 'rosa', text: 'New empty-state illustrations are in Figma 🎨', minutesAgo: 1800 },
  { channel: 'design', author: 'grace', text: 'Crit at 2pm: activity feed layouts. @alice @carol please join if you can.', minutesAgo: 240 },

  // #incidents
  { channel: 'incidents', author: 'olga', text: '🔴 Elevated 5xx on search API. Investigating.', minutesAgo: 1100,
    replies: [
      { author: 'hiro', text: 'Looks like the index nodes ran out of disk.', after: 6 },
      { author: 'olga', text: 'Mitigated. Writes were queued and replayed, nothing lost.', after: 25 },
      { author: 'bob', text: 'Nice, this is exactly why we buffer writes. Postmortem tomorrow?', after: 30 },
    ] },

  // #releases
  { channel: 'releases', author: 'leo', text: 'v2.14.0 released: threads in search results, faster channel loads.', minutesAgo: 1200 },
  { channel: 'releases', author: 'kate', text: 'Release notes for v2.15 due Wednesday. @priya can you review the copy?', minutesAgo: 200 },

  // #random
  { channel: 'random', author: 'jamal', text: 'Who left the sourdough starter in the fridge 😅', minutesAgo: 1600 },
  { channel: 'random', author: 'rosa', text: 'Photos from the team hike are up!', minutesAgo: 800 },
  { channel: 'random', author: 'sam', text: 'Coffee machine is fixed ☕', minutesAgo: 45, reactions: [['jamal', '🙏', 2], ['rosa', '🎉', 5]] },
  { channel: 'random', author: 'sam', text: 'Anyone up for a board game night on Friday?', minutesAgo: 600, deleted: true,
    replies: [
      { author: 'jamal', text: "I'm in! I'll bring Catan.", after: 5 },
      { author: 'leo', text: 'Count me in 🎲', after: 8 },
    ] },
  { channel: 'random', author: 'tom', text: 'oops, wrong channel', minutesAgo: 20, deleted: true },

  // #leadership
  { channel: 'leadership', author: 'priya', text: 'Hiring plan draft for H1 is in the shared folder.', minutesAgo: 3000 },
  { channel: 'leadership', author: 'dave', text: 'Board deck review Thursday. @kate can you pull the metrics?', minutesAgo: 350 },

  // DMs
  { channel: 'dm:alice:bob', author: 'bob', text: 'Got a sec to pair on the outbox worker later?', minutesAgo: 180 },
  { channel: 'dm:alice:bob', author: 'alice', text: 'Sure, after 3?', minutesAgo: 170 },
  { channel: 'dm:alice:bob', author: 'bob', text: 'Perfect 👍', minutesAgo: 168 },
  { channel: 'dm:alice:bob', author: 'bob', text: 'Also, could you look at my PR when you get a chance?', minutesAgo: 12 },
  { channel: 'dm:alice:bob', author: 'bob', text: 'No rush, tomorrow is fine', minutesAgo: 11 },
  { channel: 'dm:alice:carol', author: 'carol', text: 'Loved your RFC. One question about read state: per item or a watermark?', minutesAgo: 600 },
  { channel: 'dm:alice:dave', author: 'dave', text: 'Can you give me a 2-line summary of the feed work for the board?', minutesAgo: 30 },
  { channel: 'dm:bob:carol', author: 'carol', text: 'Are you going to the crit today?', minutesAgo: 250 },
  { channel: 'dm:bob:erin', author: 'erin', text: 'Thanks for fixing staging!', minutesAgo: 100 },
];

export const DMS: [string, string][] = [
  ['alice', 'bob'],
  ['alice', 'carol'],
  ['alice', 'dave'],
  ['bob', 'carol'],
  ['bob', 'erin'],
];
