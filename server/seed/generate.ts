// Deterministic bulk seed (§7): ~500 messages that make the app feel like a
// busy team. A fixed PRNG seed means every `pnpm seed` produces the same data,
// so demos are repeatable. Output uses the same shape as the hand-written seed.
import { CHANNELS, DMS, USERS, type SeedMessage } from './data.js';

/** mulberry32: tiny, fast, good enough for seed data. */
function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOPICS: Record<string, string[]> = {
  general: [
    'Reminder: team lunch is on Friday this week',
    'The quarterly OKR doc is ready for comments',
    'Parking garage is closed tomorrow morning for maintenance',
    'Great work on the launch everyone 👏',
    'New hire onboarding session at 11am in the big room',
    'Heads up: the VPN certificate rotates tonight',
    'Who has the spare HDMI adapter from the meeting room?',
    'Benefits enrolment closes at the end of the month',
    'Customer webinar recording is up on the drive',
    'Please update your emergency contact details in the HR portal',
  ],
  random: [
    'Anyone watching the match tonight?',
    'The new coffee beans are excellent ☕',
    'Dog photos thread, go 🐶',
    'Recommendations for a good sci-fi book?',
    'It is way too hot in the office today',
    'Found a great ramen place around the corner',
    'Who wants to join the running club?',
    'Friday playlist suggestions welcome 🎵',
    'The plants on the third floor need watering',
  ],
  engineering: [
    'Merged the migration for the new indexes',
    'Flaky test in the checkout suite again, looking into it',
    'Can someone review the PR for the retry middleware?',
    'Bumped the Node version in CI',
    'The staging database is running low on disk',
    'Refactored the auth middleware, should be a no-op',
    'Build times are down 30% after the cache change',
    'Anyone know why the linter is complaining about imports?',
    'Rolling out the feature flag to 10% of users',
    'Postmortem notes from yesterday are in the wiki',
    'Dependency upgrade PR is green, merging after lunch',
    'We should add an index on messages(channel_id, created_at)',
    'Profiling shows most of the time is in JSON serialisation',
    'Heads up: I am rotating the API keys this afternoon',
  ],
  product: [
    'Updated the roadmap with the Q4 priorities',
    'Customer feedback: the onboarding flow is confusing',
    'Spec for notification preferences is ready for review',
    'Should we sunset the legacy export feature?',
    'Interview notes from three enterprise customers are up',
    'The pricing page experiment is showing a 4% lift',
    'Drafting the release notes for the next version',
    'Churn analysis for last month is in the dashboard',
    'Competitive teardown of the new entrant is in the drive',
  ],
  design: [
    'New icon set is ready for review',
    'Updated the colour tokens for dark mode',
    'Usability test recordings are in the research folder',
    'Exploring a denser layout for the activity feed',
    'Figma file for the settings redesign is shared',
    'Accessibility audit found a few contrast issues',
    'Draft illustrations for the empty states',
  ],
  incidents: [
    'Elevated error rates on the API gateway, investigating',
    'Mitigated: rolled back the last deploy',
    'Latency spike on the search cluster',
    'Third-party email provider is degraded',
    'All clear, error rates back to normal',
    'Queue backlog is draining, ETA 10 minutes',
    'Paging the on-call for the payments service',
  ],
  releases: [
    'v2.15.0 is out 🎉',
    'Hotfix v2.14.2 deployed to production',
    'Release branch is cut, code freeze until Thursday',
    'Changelog draft is ready for review',
    'Mobile app 4.2 submitted to the app stores',
    'Canary looks healthy, promoting to 100%',
  ],
  leadership: [
    'Headcount plan draft for next year',
    'Board meeting prep: metrics due Wednesday',
    'Offsite agenda is in the shared folder',
    'Budget review moved to next Tuesday',
    'Hiring pipeline update: 3 offers out',
  ],
};

const REPLIES = [
  'Thanks!', 'On it 👍', 'Nice work', 'Can you share the link?', 'Agreed', 'Looks good to me',
  'I can take a look this afternoon', 'Good catch', '+1', 'Let me check and get back to you',
  'Is there a ticket for this?', 'That would be great', 'Done ✅', 'Interesting, why is that?',
  'I had the same issue last week', 'Let\'s discuss in standup', 'Makes sense', 'Following',
  'Can we pair on this?', 'Shipped!', 'I think so, yes', 'Not sure, maybe ask in #engineering?',
];

const DM_LINES = [
  'Hey, got a minute?', 'Sure, what\'s up?', 'Can you look at my PR when you get a chance?',
  'Thanks for the help earlier', 'Are you joining the 3pm?', 'Running 5 min late', 'Lunch today?',
  'Did you see the email from the customer?', 'I\'ll send you the doc', 'Sounds good 👍',
  'Quick question about the spec', 'No worries', 'Let\'s catch up tomorrow', 'Perfect, thanks!',
];

const MENTION_PHRASES = ['can you take a look?', 'what do you think?', 'FYI', 'could you review?', 'any thoughts?'];
const EMOJI = ['👍', '❤️', '😂', '🎉', '👀', '🙏'];

// How many top-level messages land in each age band (minutes ago).
const BANDS: { count: number; from: number; to: number }[] = [
  { count: 12, from: 0.5, to: 5 },
  { count: 40, from: 5, to: 60 },
  { count: 150, from: 60, to: 12 * 60 },
  { count: 118, from: 12 * 60, to: 7 * 24 * 60 },
];

export function generateSeedMessages(seed = 42): SeedMessage[] {
  const rand = prng(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const between = (min: number, max: number) => min + rand() * (max - min);
  const allHandles = USERS.map((u) => u.handle);
  const membersOf = (channel: string) => {
    const c = CHANNELS.find((x) => x.name === channel)!;
    return c.members === 'all' ? allHandles : c.members;
  };
  // Busier channels get more traffic.
  const weighted = ['general', 'general', 'random', 'engineering', 'engineering', 'engineering', 'product', 'product', 'design', 'incidents', 'releases', 'leadership'];

  const out: SeedMessage[] = [];
  for (const band of BANDS) {
    for (let i = 0; i < band.count; i++) {
      const channel = pick(weighted);
      const members = membersOf(channel);
      const author = pick(members);
      const minutesAgo = between(band.from, band.to);
      let text = pick(TOPICS[channel]);

      if (rand() < 0.1) {
        const target = pick(members.filter((h) => h !== author));
        text = `${text}. @${target} ${pick(MENTION_PHRASES)}`;
      }

      const message: SeedMessage = { channel, author, text, minutesAgo };

      if (rand() < 0.2) {
        const replyCount = 1 + Math.floor(rand() * 4);
        let after = 0;
        message.replies = [];
        for (let r = 0; r < replyCount; r++) {
          after += between(1, 20);
          if (after >= minutesAgo) break; // replies can't be in the future
          const replier = pick(members);
          const replyText = rand() < 0.1 && replier !== author ? `@${author} ${pick(REPLIES)}` : pick(REPLIES);
          message.replies.push({ author: replier, text: replyText, after });
        }
      }

      if (rand() < 0.25) {
        message.reactions = [];
        const n = 1 + Math.floor(rand() * 4);
        for (let r = 0; r < n; r++) {
          const after = between(0.5, Math.min(60, minutesAgo));
          message.reactions.push([pick(members), pick(EMOJI), after]);
        }
      }

      const roll = rand();
      if (roll < 0.03 && minutesAgo > 10) message.edit = { text: `${text} (updated with the latest numbers)`, after: between(1, 5) };
      else if (roll < 0.05) message.deleted = true;

      out.push(message);
    }
  }

  // DM conversations: short back-and-forth bursts spread over the week.
  for (const [a, b] of DMS) {
    let minutesAgo = between(3 * 24 * 60, 7 * 24 * 60);
    while (minutesAgo > 90) {
      const burst = 2 + Math.floor(rand() * 4);
      for (let i = 0; i < burst && minutesAgo > 90; i++) {
        out.push({ channel: `dm:${a}:${b}`, author: rand() < 0.5 ? a : b, text: pick(DM_LINES), minutesAgo });
        minutesAgo -= between(1, 10);
      }
      minutesAgo -= between(6 * 60, 30 * 60);
    }
  }

  return out;
}
