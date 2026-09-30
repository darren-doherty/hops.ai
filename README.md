# Hops

A small Slack-like messaging app built around one question: **what deserves someone's attention, and how does it reliably get to them?**

It has channels, DMs, threads, mentions, reactions, edit and delete, and an **activity feed**. Every change also has to reach three independent systems (a search index, a notification sender and the activity feed) that can be slow or unavailable. That's done with a transactional outbox, with separate delivery tracking per system.

- **[system-design.md](system-design.md)**: the decisions and why. Covers the attention model, guarantees, and what was deliberately cut. **Start here.**
- **[implementation-plan.md](implementation-plan.md)**: how it was built, as six vertical slices, one commit each.

---

## Running it

**Prerequisites:** Node 24+, pnpm 9, and a local PostgreSQL (15+).

```sh
pnpm install
cp .env.example .env        # then set DATABASE_URL / TEST_DATABASE_URL for your Postgres
pnpm db:reset               # creates the `hops` database if needed and applies db/schema.sql
pnpm seed                   # ~635 messages over a week, built through the real write path (~3s)
pnpm dev                    # server on :3000, web on :5173
```

Open **two windows side by side**:

- http://localhost:5173/?as=alice
- http://localhost:5173/?as=bob

There's no real auth: `?as=<handle>` picks who you are, and the switcher at the top of the sidebar changes it. Handles are `alice`, `bob`, `carol`, `dave`, `erin` and 15 others.

**Tests:** `pnpm db:reset:test && pnpm test`. That's 34 tests in about 10s, against a real Postgres (`hops_test`).

| Command | What it does |
|---|---|
| `pnpm dev` | API + worker (Fastify, `tsx watch`) and web (Vite) together |
| `pnpm db:reset` / `pnpm db:reset:test` | Drop and recreate the schema (dev / test database) |
| `pnpm seed` | Seed data. Run after `db:reset` |
| `pnpm test` | Unit + integration tests |
| `pnpm typecheck` | TypeScript across server, web and tests |
| `pnpm sql "<query>"` | Run a query against the dev database and print a table |

---

## A 5-minute demo

With Alice and Bob side by side. Alice's feed starts with a few unread items from the seed.

1. **Realtime + optimistic send.** As Alice, post in `#engineering`. It appears instantly (dimmed until the server confirms) and shows up in Bob's window live.
2. **Threads → activity.** As Bob, hover Alice's message → 💬 → reply. Alice's **Activity** badge goes up, and the item reads *"Bob replied to your thread"* with a **Thread** label.
3. **Grouped reactions.** As Bob, hover Alice's message → ☺+ → 🎉. React as Carol too (`?as=carol`). Alice sees **one** item: *"Carol and Bob reacted 🎉 to your message"*. Un-react and it shrinks, then disappears.
4. **Mention → notification.** As Alice, write `@bob can you check this?`. Bob's feed shows the mention **immediately**. About **10 seconds later** a 🔔 toast arrives (the notification). Click it to jump to the message.
5. **The grace period.** As Alice, mention `@bob` again, then hover → 🗑 delete it within 10 seconds. It vanishes from Bob's feed at once, and **no toast ever arrives**. The server console logs `🔕 not sent: message was deleted during the grace period`.
6. **Edits.** Edit a message that mentions Bob. His feed item shows the new text with *(edited)* and **stays read** if he'd read it. Edit the `@bob` out, and his mention item disappears.
7. **Failure and recovery.** Take search "down" and watch everything else carry on:

   ```sh
   curl -X POST localhost:5173/api/debug/faults -H 'content-type: application/json' -d '{"search":{"failureRate":1}}'
   ```

   Send a few messages. Chat, activity and notifications all keep working. Open http://localhost:5173/api/debug/deliveries: search deliveries pile up in `retrying` with their `lastError`, while `activity` and `notifications` stay fully `done`. Searching shows *"Search is temporarily unavailable"* rather than wrong results. Bring it back with `'{"search":{"failureRate":0}}'` and the retries drain. New messages become searchable, and deleted ones never do.

The shorter version of this script is in [system-design.md §11](system-design.md).

### Fault injection

The search index and notification sender are in-process fakes, but the rest of the code treats them like remote services. Every call gets random latency, and can fail in one of two ways:

- **request lost:** nothing happened;
- **response lost:** the call **succeeded**, but the caller sees an error and will retry.

The second kind is what really tests idempotency.

| Setting | `.env` | Runtime |
|---|---|---|
| Search failure rate / latency | `SEARCH_FAILURE_RATE=0.5`, `SEARCH_LATENCY_MS=100-800` | `POST /api/debug/faults {"search":{"failureRate":0.5,"latencyMs":[100,800]}}` |
| Notification failure rate / latency | `NOTIFY_FAILURE_RATE`, `NOTIFY_LATENCY_MS` | `POST /api/debug/faults {"notify":{...}}` |
| Notification grace period | `GRACE_MS=10000` (try `3000` for snappier demos) | — |
| Notification staleness cut-off | `STALE_MS=900000` (15 min) | — |

`GET /api/debug/deliveries` shows, per system:
- deliveries done, due, scheduled (in the grace period), retrying and dead;
- the retrying deliveries with their last error;
- dead deliveries;
- the last 10 notifications sent.

---

## How it works, briefly

```
 React ──HTTP──► Fastify ──one transaction──► Postgres
   ▲                │                          ├ messages, mentions, reactions, thread_subscriptions
   │                │ after commit             ├ outbox_events       (what happened; never modified)
   └──WebSocket─────┤                          └ event_deliveries    (one row per event × system)
                    │                                   │
                    │                  Worker: one loop per system, claims due rows
                    │                  (SKIP LOCKED + lease), retries with backoff
                    │               ┌───────────────────┼────────────────────┐
                    │               ▼                   ▼                    ▼
                    │        Search (fake)        Activity feed        Notifications (fake)
                    │        versioned writes,    recomputed from      after a 10s grace period,
                    │        tombstones           source, same tx      idempotency key + acks
                    └───── activity.changed / notification.received
```

- **Every write records what happened in the same transaction**: the message, an outbox event, and one delivery row for each system. Nothing reaches search, activity or notifications unless the message is committed, and nothing committed is lost.
- **Thin events.** An event carries just a message ID, and each system reads the message's *current* state when it processes it. A late retry can't push old data anywhere.
- **Each system has its own delivery state and its own worker loop**, so a failing search index never delays anyone's activity feed or notifications.
- **The activity feed is recomputed from the source data** instead of adding and subtracting counts. Processing events twice, or out of order, gives the same feed. It's written in the same transaction that marks its delivery done, so each event takes effect exactly once.
- **The feed stores references, not copies of the text.** Items are rendered from the live message, so edits show immediately, and deleted messages and removed mentions are hidden as soon as the change commits.

### What gets your attention

| Something happens | Who hears | Activity item | Notification (toast) |
|---|---|---|---|
| `@mention` | the mentioned person (if they're in the channel) | *mentioned you* | ✅ after the grace period |
| DM | the other person | *sent you N messages* (one item per conversation) | ✅ after the grace period |
| Thread reply | the thread's original author, anyone who replied, anyone mentioned in it | *replied in a thread you're in* | — |
| Reaction | the message's author | *Carol, Bob and 2 others reacted 🎉 👍* (one item per message) | — |

Rules:
- Never for your own actions.
- One item per person per message. A mention wins over a thread reply.
- Replying in a DM marks it read, as in Slack.

This borrows Slack's model for messaging, GitHub's "why am I seeing this?" reason labels, and Linear's single grouped inbox. The design doc explains why.

### Guarantees

| | Guaranteed | Not guaranteed |
|---|---|---|
| Messages | Saved once the API returns; a retried send never duplicates | — |
| Delivery to search, activity, notifications | Every committed change reaches each system **at least once** | How fast: they catch up *eventually*; after 10 failures a delivery goes `dead` |
| Activity feed | Each event takes effect **exactly once**; same result whatever the order | — |
| Search | Ends at the latest version; a deleted message can't come back | May be briefly behind |
| Notifications | Never twice; never for a message deleted within the grace period | Can't be recalled once sent |
| Realtime | — | Best-effort; a reconnect refetches, and the database is the source of truth |

---

## Found while building

Testing each phase against real failure conditions turned up five design-level bugs, each fixed and covered by a regression test:

1. **One worker loop for all systems.** A batch waited for its slowest delivery, so slow search calls delayed activity updates. That contradicted the design's promise that the systems are independent. **Fix:** one loop per system.
2. **DM counts included the whole history.** An item's `read_at` was being used for both "is this unread?" and "read up to where?". Marking the item unread again cleared the second. **Fix:** a separate `last_read_at`.
3. **Replying in a DM didn't mark it read**, so a conversation you'd just replied to still showed as unread. **Fix:** your own reply counts as having read up to that point.
4. **Notification retries re-sent to every recipient.** An attempt only succeeded if every call did: about 6% per attempt for 4 recipients at a 50% failure rate. **Fix:** record which recipients the provider acknowledged, and retry only the rest. The idempotency key still covers "sent, but the response was lost".
5. **Notifications were only visible in the server log**, so in the app they looked missing. **Fix:** the fake provider delivers to the recipient's open tabs as a toast.

Every guarantee test was **mutation-checked**: its protection was removed, and the test was confirmed to fail.

## Cut corners

These are listed with the fix I'd make in [system-design.md §8](system-design.md). Highlights:
- no real auth,
- no pagination (last 100 messages),
- no thread muting,
- no UI for replaying dead deliveries,
- no presence (so a toast shows even if you're looking at that conversation),
- reaction realtime events aren't versioned,
- the WebSocket hub is single-process.

## Project layout

```
db/schema.sql            the whole data model, one file
server/
  domain/                messages, reactions, attention rules, activity feed reads, outbox
  consumers/             search, activity, notifications (+ which events each receives)
  worker.ts              claim → deliver → done / retry with backoff / dead
  fakes/                 search index + notification sender, with latency and fault injection
  routes/                HTTP + WebSocket; debug endpoints
  seed/                  hand-written story + deterministic generated traffic
web/                     React client: normalised store, optimistic actions, realtime
shared/types.ts          contracts shared by server and web
tests/                   integration (real Postgres) + client store/action tests
```
