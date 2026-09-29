-- Hops schema. Running this file resets the database completely (see scripts/db-reset.ts).
-- Design references (§) point to system-design.md.

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ─── Core domain (source of truth) ──────────────────────────────────────────

CREATE TABLE users (
  id          uuid PRIMARY KEY,
  handle      text NOT NULL UNIQUE,          -- used for @mentions and ?as=
  name        text NOT NULL,
  color       text NOT NULL,                 -- avatar background (initials avatar)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE channels (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,                 -- DMs: internal name; display name is the other member
  kind        text NOT NULL CHECK (kind IN ('public', 'dm')),
  topic       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE channel_members (
  channel_id  uuid NOT NULL REFERENCES channels(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX channel_members_user_idx ON channel_members (user_id);

CREATE TABLE messages (
  id          uuid PRIMARY KEY,              -- client-generated UUIDv7 → idempotent create (§4.1)
  channel_id  uuid NOT NULL REFERENCES channels(id),
  author_id   uuid NOT NULL REFERENCES users(id),
  parent_id   uuid NULL REFERENCES messages(id),  -- a reply is a message with a parent
  body        text NOT NULL,                 -- retained on soft delete, never serialised
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  version     int  NOT NULL DEFAULT 1,       -- bumped on every edit/delete; drives stale-write checks
  created_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz NULL
);
CREATE INDEX messages_channel_idx ON messages (channel_id, created_at, id) WHERE parent_id IS NULL;
CREATE INDEX messages_parent_idx  ON messages (parent_id, created_at) WHERE parent_id IS NOT NULL;

CREATE TABLE mentions (
  message_id  uuid NOT NULL REFERENCES messages(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX mentions_user_idx ON mentions (user_id);

CREATE TABLE reactions (
  message_id  uuid NOT NULL REFERENCES messages(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- Who follows a thread: root author, repliers, anyone mentioned in it (§2.2).
-- Source data written in the same transaction as the message, not a projection.
CREATE TABLE thread_subscriptions (
  root_id     uuid NOT NULL REFERENCES messages(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (root_id, user_id)
);

-- ─── Activity feed (local projection, §4.3) ─────────────────────────────────

CREATE TABLE activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  group_key   text NOT NULL,                 -- msg:{id} | reaction:{id} | dm:{channelId}
  reason      text NOT NULL CHECK (reason IN ('mention', 'dm', 'participating', 'reaction')),
  message_id  uuid NOT NULL REFERENCES messages(id),  -- subject (DM groups: latest message)
  channel_id  uuid NOT NULL REFERENCES channels(id),
  actor_ids   uuid[] NOT NULL DEFAULT '{}',  -- newest first
  count       int  NOT NULL DEFAULT 1,
  latest_at   timestamptz NOT NULL,          -- advancing this marks the group unread again
  read_at     timestamptz NULL,
  UNIQUE (user_id, group_key)
);
CREATE INDEX activities_feed_idx   ON activities (user_id, latest_at DESC);
CREATE INDEX activities_unread_idx ON activities (user_id) WHERE read_at IS NULL;

-- ─── Transactional outbox (§4) ──────────────────────────────────────────────

-- Immutable once written. Thin payloads: consumers load current state.
CREATE TABLE outbox_events (
  id          bigserial PRIMARY KEY,
  type        text NOT NULL CHECK (type IN ('MessageCreated', 'MessageEdited', 'MessageDeleted', 'ReactionChanged')),
  message_id  uuid NOT NULL REFERENCES messages(id),
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per (event, consumer): consumers succeed and fail independently.
CREATE TABLE event_deliveries (
  event_id        bigint NOT NULL REFERENCES outbox_events(id),
  consumer        text NOT NULL CHECK (consumer IN ('search', 'activity', 'notifications')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'dead')),
  attempts        int  NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until    timestamptz NULL,          -- lease: expires if a worker crashes mid-flight
  last_error      text NULL,
  done_at         timestamptz NULL,
  PRIMARY KEY (event_id, consumer)
);
CREATE INDEX event_deliveries_due_idx ON event_deliveries (status, next_attempt_at);

-- ─── Fake external systems' own storage ─────────────────────────────────────
-- Only accessed through server/fakes/*. They stand in for storage owned by
-- external services, so no foreign keys into the domain tables.

CREATE TABLE fake_search_docs (
  id          uuid PRIMARY KEY,
  version     int  NOT NULL,                 -- writes apply only if newer (external versioning)
  deleted     boolean NOT NULL DEFAULT false,-- tombstone: stops late retries resurrecting deletes
  body        text NOT NULL,
  channel_id  uuid NOT NULL,
  author_id   uuid NOT NULL,
  parent_id   uuid NULL,
  created_at  timestamptz NOT NULL,
  indexed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fake_notifications_sent (
  idempotency_key text PRIMARY KEY,          -- messageId:userId
  user_id     uuid NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now()
);
