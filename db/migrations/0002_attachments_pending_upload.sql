-- =============================================================================
-- Nova — migration 0002: decouple attachment upload from message creation
-- =============================================================================
-- The upload flow is: (1) client requests a pending attachment row and
-- uploads bytes to R2 referencing it, (2) only once the upload succeeds does
-- the client create the message, atomically linking the attachment(s) to it.
-- This means an attachment can briefly exist with no message yet, so
-- `message_id` can no longer be NOT NULL. `uploaded_by` is added so the
-- upload/link routes can authorize "is this your pending attachment?"
-- without needing a message to check ownership against.
--
-- SQLite (and D1) has no ALTER COLUMN for dropping a NOT NULL constraint,
-- so this uses the standard recreate-copy-drop-rename pattern. `attachments`
-- has no other tables referencing it as a parent, so recreating it does not
-- trigger any cascade deletes elsewhere (unlike recreating a table that
-- OTHER tables point to with ON DELETE CASCADE, which — per D1's documented
-- behavior — fires even when a table is dropped, not just on DELETE).
-- =============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE attachments_new (
  id                  TEXT PRIMARY KEY,
  message_id          TEXT REFERENCES messages(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'voice', 'document')),
  r2_key              TEXT NOT NULL,
  thumbnail_r2_key    TEXT,
  file_name           TEXT NOT NULL,
  mime_type           TEXT NOT NULL,
  size_bytes          INTEGER NOT NULL,
  width               INTEGER,
  height              INTEGER,
  duration_seconds    INTEGER,
  uploaded_by         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at          INTEGER NOT NULL
);

-- Derives uploaded_by from the linked message's sender for any pre-existing
-- rows (there are none in a fresh deploy, but this keeps the migration
-- correct regardless of when it's actually run).
INSERT INTO attachments_new (
  id, message_id, kind, r2_key, thumbnail_r2_key, file_name, mime_type,
  size_bytes, width, height, duration_seconds, uploaded_by, created_at
)
SELECT
  a.id, a.message_id, a.kind, a.r2_key, a.thumbnail_r2_key, a.file_name, a.mime_type,
  a.size_bytes, a.width, a.height, a.duration_seconds, m.sender_id, a.created_at
FROM attachments a
JOIN messages m ON m.id = a.message_id;

DROP TABLE attachments;
ALTER TABLE attachments_new RENAME TO attachments;

CREATE INDEX idx_attachments_message ON attachments(message_id);
CREATE INDEX idx_attachments_uploaded_by ON attachments(uploaded_by, message_id);
