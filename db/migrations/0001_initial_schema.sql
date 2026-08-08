-- =============================================================================
-- Nova — initial D1 schema
-- =============================================================================
-- Design notes:
--   * All primary keys are app-generated nanoids (TEXT), created in
--     src/lib/db before insert — D1/SQLite has no reliable server-side UUID.
--   * All timestamps are INTEGER unix epoch *milliseconds* (Date.now()).
--   * Booleans are INTEGER 0/1 (SQLite convention, no native BOOLEAN type).
--   * "Saved Messages" has no dedicated table — like Telegram, it is
--     implemented as a direct chat where both members are the same user
--     (direct_key = "<userId>:<userId>"). This reuses all chat/message
--     infrastructure instead of duplicating it.
--   * chats <-> groups is intentionally one-directional (groups.chat_id ->
--     chats.id) to avoid a circular foreign key. To find a group from a
--     chat: SELECT * FROM groups WHERE chat_id = ?.
--   * chats does NOT store last_message_id (would create the same kind of
--     chat<->message circular reference); instead it denormalizes a preview
--     (last_message_preview/sender/type/at) updated by application code
--     whenever a message is sent — the standard pattern used by chat apps
--     for fast, join-free chat-list rendering.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  username              TEXT NOT NULL,
  username_lower        TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  bio                   TEXT NOT NULL DEFAULT '',
  avatar_url            TEXT,
  avatar_r2_key         TEXT,
  password_hash         TEXT NOT NULL,
  password_salt         TEXT NOT NULL,
  password_iterations   INTEGER NOT NULL,
  is_online             INTEGER NOT NULL DEFAULT 0,
  last_seen_at          INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_users_username_lower ON users(username_lower);
CREATE INDEX idx_users_display_name ON users(display_name COLLATE NOCASE);

-- -----------------------------------------------------------------------------
-- chats — one row per conversation (direct 1:1, group, or self/"Saved").
-- -----------------------------------------------------------------------------
CREATE TABLE chats (
  id                      TEXT PRIMARY KEY,
  type                    TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  -- Canonical "<smallerUserId>:<largerUserId>" key for direct chats, used to
  -- prevent creating duplicate 1:1 chats between the same pair of users.
  -- NULL for group chats.
  direct_key              TEXT,
  last_message_preview    TEXT,
  last_message_sender_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_message_type       TEXT,
  last_message_at         INTEGER,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_chats_direct_key ON chats(direct_key) WHERE direct_key IS NOT NULL;
CREATE INDEX idx_chats_updated_at ON chats(updated_at DESC);

-- -----------------------------------------------------------------------------
-- groups — metadata for chats of type 'group'.
-- -----------------------------------------------------------------------------
CREATE TABLE groups (
  id             TEXT PRIMARY KEY,
  chat_id        TEXT NOT NULL UNIQUE REFERENCES chats(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  avatar_url     TEXT,
  avatar_r2_key  TEXT,
  created_by     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_groups_name ON groups(name COLLATE NOCASE);
CREATE INDEX idx_groups_created_by ON groups(created_by);

-- -----------------------------------------------------------------------------
-- group_members — roles and membership lifecycle for group chats.
-- -----------------------------------------------------------------------------
CREATE TABLE group_members (
  id           TEXT PRIMARY KEY,
  group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  joined_at    INTEGER NOT NULL,
  left_at      INTEGER,
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group ON group_members(group_id, left_at);
CREATE INDEX idx_group_members_user ON group_members(user_id, left_at);

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
CREATE TABLE messages (
  id                          TEXT PRIMARY KEY,
  chat_id                     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id                   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Client-generated id, echoed back so the client can reconcile its
  -- optimistic UI message with the server-persisted row.
  client_id                   TEXT,
  reply_to_message_id         TEXT REFERENCES messages(id) ON DELETE SET NULL,
  forwarded_from_message_id   TEXT REFERENCES messages(id) ON DELETE SET NULL,
  forwarded_from_user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  content_type                TEXT NOT NULL DEFAULT 'text'
                               CHECK (content_type IN ('text', 'image', 'video', 'audio', 'voice', 'document', 'system')),
  content                     TEXT,
  is_edited                   INTEGER NOT NULL DEFAULT 0,
  edited_at                   INTEGER,
  deleted_for_everyone        INTEGER NOT NULL DEFAULT 0,
  deleted_at                  INTEGER,
  created_at                  INTEGER NOT NULL
);

CREATE INDEX idx_messages_chat_created ON messages(chat_id, created_at);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_reply_to ON messages(reply_to_message_id);
CREATE UNIQUE INDEX idx_messages_client_id ON messages(chat_id, client_id) WHERE client_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- chat_members — per-user state for a chat (works for both direct & group):
-- read position (unread counter/read receipts), mute, archive, sidebar pin.
-- Distinct from group_members, which governs group *roles/permissions*.
-- -----------------------------------------------------------------------------
CREATE TABLE chat_members (
  id                     TEXT PRIMARY KEY,
  chat_id                TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id   TEXT REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at           INTEGER,
  is_muted               INTEGER NOT NULL DEFAULT 0,
  is_archived            INTEGER NOT NULL DEFAULT 0,
  is_pinned              INTEGER NOT NULL DEFAULT 0,
  joined_at              INTEGER NOT NULL,
  left_at                INTEGER,
  UNIQUE(chat_id, user_id)
);

CREATE INDEX idx_chat_members_user ON chat_members(user_id, is_archived, left_at);
CREATE INDEX idx_chat_members_chat ON chat_members(chat_id);

-- -----------------------------------------------------------------------------
-- message_deletions — "Delete for me": hides a message for one user without
-- affecting other participants. Global "Delete for everyone" instead sets
-- messages.deleted_for_everyone / deleted_at directly.
-- -----------------------------------------------------------------------------
CREATE TABLE message_deletions (
  id           TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at   INTEGER NOT NULL,
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_message_deletions_user ON message_deletions(user_id);

-- -----------------------------------------------------------------------------
-- message_reactions — one reaction per user per message (setting a new
-- emoji replaces the previous one; enforced by the application via upsert).
-- -----------------------------------------------------------------------------
CREATE TABLE message_reactions (
  id           TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji        TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);

-- -----------------------------------------------------------------------------
-- attachments — one-to-many with messages (supports multi-file albums).
-- Binary content lives in R2; this row is the pointer + metadata.
-- -----------------------------------------------------------------------------
CREATE TABLE attachments (
  id                  TEXT PRIMARY KEY,
  message_id          TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'voice', 'document')),
  r2_key              TEXT NOT NULL,
  thumbnail_r2_key    TEXT,
  file_name           TEXT NOT NULL,
  mime_type           TEXT NOT NULL,
  size_bytes          INTEGER NOT NULL,
  width               INTEGER,
  height              INTEGER,
  duration_seconds    INTEGER,
  created_at          INTEGER NOT NULL
);

CREATE INDEX idx_attachments_message ON attachments(message_id);

-- -----------------------------------------------------------------------------
-- blocked_users
-- -----------------------------------------------------------------------------
CREATE TABLE blocked_users (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        INTEGER NOT NULL,
  UNIQUE(user_id, blocked_user_id),
  CHECK (user_id != blocked_user_id)
);

CREATE INDEX idx_blocked_users_user ON blocked_users(user_id);
CREATE INDEX idx_blocked_users_blocked ON blocked_users(blocked_user_id);

-- -----------------------------------------------------------------------------
-- pinned_messages — multiple pins per chat, most-recent first.
-- -----------------------------------------------------------------------------
CREATE TABLE pinned_messages (
  id           TEXT PRIMARY KEY,
  chat_id      TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinned_at    INTEGER NOT NULL,
  UNIQUE(chat_id, message_id)
);

CREATE INDEX idx_pinned_messages_chat ON pinned_messages(chat_id, pinned_at DESC);

-- -----------------------------------------------------------------------------
-- sessions
-- -----------------------------------------------------------------------------
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SHA-256 hash of the opaque token stored in the cookie. The raw token is
  -- never persisted — only its hash, so a leaked DB row cannot be replayed.
  token_hash    TEXT NOT NULL UNIQUE,
  remember_me   INTEGER NOT NULL DEFAULT 0,
  user_agent    TEXT,
  ip_address    TEXT,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  revoked_at    INTEGER
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- -----------------------------------------------------------------------------
-- login_attempts — audit trail backing brute-force protection. The hot-path
-- rate-limit counters live in RATE_LIMIT_KV (millisecond-latency, auto-
-- expiring); this table is the durable record used for security review and
-- for rehydrating a KV counter if it's ever evicted.
-- -----------------------------------------------------------------------------
CREATE TABLE login_attempts (
  id               TEXT PRIMARY KEY,
  username_lower   TEXT NOT NULL,
  ip_address       TEXT,
  success          INTEGER NOT NULL,
  created_at       INTEGER NOT NULL
);

CREATE INDEX idx_login_attempts_username ON login_attempts(username_lower, created_at);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address, created_at);

-- -----------------------------------------------------------------------------
-- messages_fts — FTS5 external-content index for fast message search.
-- content_rowid references SQLite's implicit rowid on `messages` (messages.id
-- is a TEXT primary key, so it is not a rowid alias, but the hidden rowid
-- still exists and is what these triggers key off of).
-- -----------------------------------------------------------------------------
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content = 'messages',
  content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER messages_fts_after_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER messages_fts_after_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER messages_fts_after_update AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
