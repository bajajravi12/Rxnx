-- =============================================================================
-- Nova — local development seed data
-- Run with: npm run db:seed:local
--
-- Demo accounts (all use the same password for convenience in dev only):
--   username: alice   password: password123
--   username: bob     password: password123
--   username: carol   password: password123
--
-- NOTE: password_hash/password_salt below are placeholder values and will
-- NOT authenticate — the auth module (Step 8) hashes with PBKDF2 via Web
-- Crypto, which isn't available in plain sqlite3/wrangler d1 execute. After
-- Step 8 is built, register these three usernames through the real
-- /api/auth/register endpoint instead of relying on this seed for login;
-- this file exists to populate chats/messages/groups for UI development
-- without having to click through onboarding every time.
-- =============================================================================

INSERT INTO users (id, username, username_lower, display_name, bio, avatar_url, avatar_r2_key, password_hash, password_salt, password_iterations, is_online, last_seen_at, created_at, updated_at) VALUES
  ('user_alice', 'alice', 'alice', 'Alice Chen', 'Building things at Nova ✨', NULL, NULL, 'SEED_PLACEHOLDER', 'SEED_PLACEHOLDER', 210000, 1, NULL, 1737000000000, 1737000000000),
  ('user_bob',   'bob',   'bob',   'Bob Martinez', 'Coffee, code, repeat.', NULL, NULL, 'SEED_PLACEHOLDER', 'SEED_PLACEHOLDER', 210000, 0, 1737003600000, 1737000000000, 1737000000000),
  ('user_carol', 'carol', 'carol', 'Carol Nguyen', 'Product design & cats 🐈', NULL, NULL, 'SEED_PLACEHOLDER', 'SEED_PLACEHOLDER', 210000, 0, 1736996400000, 1737000000000, 1737000000000);

-- Direct chat: alice <-> bob
INSERT INTO chats (id, type, direct_key, last_message_preview, last_message_sender_id, last_message_type, last_message_at, created_at, updated_at) VALUES
  ('chat_alice_bob', 'direct', 'user_alice:user_bob', 'Sounds good, see you then!', 'user_bob', 'text', 1737003700000, 1737000100000, 1737003700000);

INSERT INTO chat_members (id, chat_id, user_id, last_read_message_id, last_read_at, is_muted, is_archived, is_pinned, joined_at, left_at) VALUES
  ('cm_alice_bob_alice', 'chat_alice_bob', 'user_alice', NULL, NULL, 0, 0, 1, 1737000100000, NULL),
  ('cm_alice_bob_bob',   'chat_alice_bob', 'user_bob',   NULL, NULL, 0, 0, 0, 1737000100000, NULL);

INSERT INTO messages (id, chat_id, sender_id, client_id, content_type, content, created_at) VALUES
  ('msg_ab_1', 'chat_alice_bob', 'user_alice', NULL, 'text', 'Hey! Are we still on for the design review?', 1737003600000),
  ('msg_ab_2', 'chat_alice_bob', 'user_bob',   NULL, 'text', 'Yep, 3pm works for me.', 1737003650000),
  ('msg_ab_3', 'chat_alice_bob', 'user_bob',   NULL, 'text', 'Sounds good, see you then!', 1737003700000);

-- Saved Messages for alice (self-chat)
INSERT INTO chats (id, type, direct_key, last_message_preview, last_message_sender_id, last_message_type, last_message_at, created_at, updated_at) VALUES
  ('chat_alice_saved', 'direct', 'user_alice:user_alice', 'Remember to update the roadmap doc', 'user_alice', 'text', 1737002000000, 1737000050000, 1737002000000);

INSERT INTO chat_members (id, chat_id, user_id, last_read_message_id, last_read_at, is_muted, is_archived, is_pinned, joined_at, left_at) VALUES
  ('cm_alice_saved', 'chat_alice_saved', 'user_alice', NULL, NULL, 0, 0, 0, 1737000050000, NULL);

INSERT INTO messages (id, chat_id, sender_id, client_id, content_type, content, created_at) VALUES
  ('msg_saved_1', 'chat_alice_saved', 'user_alice', NULL, 'text', 'Remember to update the roadmap doc', 1737002000000);

-- Group chat: "Nova Team" with alice, bob, carol
INSERT INTO chats (id, type, direct_key, last_message_preview, last_message_sender_id, last_message_type, last_message_at, created_at, updated_at) VALUES
  ('chat_nova_team', 'group', NULL, 'Welcome Carol! 🎉', 'user_alice', 'text', 1737004000000, 1737000200000, 1737004000000);

INSERT INTO groups (id, chat_id, name, description, avatar_url, avatar_r2_key, created_by, created_at, updated_at) VALUES
  ('group_nova_team', 'chat_nova_team', 'Nova Team', 'Core team chat for Nova.', NULL, NULL, 'user_alice', 1737000200000, 1737000200000);

INSERT INTO group_members (id, group_id, user_id, role, invited_by, joined_at, left_at) VALUES
  ('gm_1', 'group_nova_team', 'user_alice', 'owner',  NULL,          1737000200000, NULL),
  ('gm_2', 'group_nova_team', 'user_bob',   'admin',  'user_alice',  1737000210000, NULL),
  ('gm_3', 'group_nova_team', 'user_carol', 'member', 'user_alice',  1737003900000, NULL);

INSERT INTO chat_members (id, chat_id, user_id, last_read_message_id, last_read_at, is_muted, is_archived, is_pinned, joined_at, left_at) VALUES
  ('cm_team_alice', 'chat_nova_team', 'user_alice', NULL, NULL, 0, 0, 0, 1737000200000, NULL),
  ('cm_team_bob',   'chat_nova_team', 'user_bob',   NULL, NULL, 0, 0, 0, 1737000210000, NULL),
  ('cm_team_carol', 'chat_nova_team', 'user_carol', NULL, NULL, 0, 0, 0, 1737003900000, NULL);

INSERT INTO messages (id, chat_id, sender_id, client_id, content_type, content, created_at) VALUES
  ('msg_team_1', 'chat_nova_team', 'user_alice', NULL, 'system', 'user_alice created the group', 1737000200000),
  ('msg_team_2', 'chat_nova_team', 'user_alice', NULL, 'text', 'Welcome everyone to the Nova team chat!', 1737000300000),
  ('msg_team_3', 'chat_nova_team', 'user_bob',   NULL, 'text', 'Excited to be here 🚀', 1737000400000),
  ('msg_team_4', 'chat_nova_team', 'user_alice', NULL, 'system', 'user_carol joined the group', 1737003900000),
  ('msg_team_5', 'chat_nova_team', 'user_alice', NULL, 'text', 'Welcome Carol! 🎉', 1737004000000);

INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES
  ('react_1', 'msg_team_3', 'user_alice', '🚀', 1737000410000),
  ('react_2', 'msg_team_5', 'user_carol', '❤️', 1737004010000);

INSERT INTO pinned_messages (id, chat_id, message_id, pinned_by, pinned_at) VALUES
  ('pin_1', 'chat_nova_team', 'msg_team_2', 'user_alice', 1737000310000);
