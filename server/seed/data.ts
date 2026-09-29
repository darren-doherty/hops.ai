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

export const DMS: [string, string][] = [
  ['alice', 'bob'],
  ['alice', 'carol'],
  ['alice', 'dave'],
  ['bob', 'carol'],
  ['bob', 'erin'],
];
