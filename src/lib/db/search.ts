import { toPublicUser, type PublicUser } from './users';

const MAX_SEARCH_TERMS = 8;
const SNIPPET_TOKENS = 10;

/**
 * Converts free-text user input into a safe FTS5 MATCH expression. Every
 * term is wrapped as a quoted phrase (stripping any literal `"` first),
 * which neutralizes FTS5's query-syntax operators (AND/OR/NOT, `-`, `(`,
 * `:`, etc.) — verified against real SQLite with adversarial input like
 * embedded quotes and SQL-injection-shaped strings, which the FTS5 layer
 * itself already parameterizes safely, but a malformed query string could
 * otherwise still throw a syntax error back at the user. The final term
 * gets a trailing `*` for prefix matching, so results start appearing
 * before the user finishes typing the last word.
 */
function buildFtsQuery(raw: string): string | null {
  const terms = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TERMS);

  const escaped = terms
    .map((term, i) => {
      const cleaned = term.replace(/"/g, '');
      if (!cleaned) return null;
      const isLast = i === terms.length - 1;
      return isLast ? `"${cleaned}"*` : `"${cleaned}"`;
    })
    .filter((t): t is string => t !== null);

  return escaped.length > 0 ? escaped.join(' ') : null;
}

export interface MessageSearchResult {
  messageId: string;
  chatId: string;
  chatTitle: string;
  senderId: string;
  senderDisplayName: string;
  /**
   * The match snippet as plain-text segments rather than an HTML string —
   * `snippet()` embeds raw message content around the highlighted term,
   * and that content is user-authored text, not markup. Returning
   * pre-built HTML here would mean any `<script>`-shaped message content
   * gets interpolated into a string a client might render with
   * dangerouslySetInnerHTML. Segments are always safe to render as plain
   * React text content (auto-escaped) regardless of what's in them.
   */
  snippetParts: Array<{ text: string; highlighted: boolean }>;
  createdAt: number;
}

interface MessageSearchRow {
  message_id: string;
  chat_id: string;
  sender_id: string;
  sender_display_name: string;
  chat_type: 'direct' | 'group';
  direct_key: string | null;
  group_name: string | null;
  snippet: string;
  created_at: number;
}

/**
 * Searches message content, scoped to chats the searching user is
 * currently an active member of (a JOIN against chat_members enforces
 * this — there is no way for this query to surface a message from a chat
 * the user isn't in), optionally narrowed to one specific chat.
 */
export async function searchMessages(
  db: D1Database,
  userId: string,
  rawQuery: string,
  options: { chatId?: string; limit?: number } = {},
): Promise<MessageSearchResult[]> {
  const ftsQuery = buildFtsQuery(rawQuery);
  if (!ftsQuery) return [];

  const limit = Math.min(options.limit ?? 30, 50);
  const chatClause = options.chatId ? 'AND m.chat_id = ?3' : '';
  const bindings: unknown[] = [userId, ftsQuery];
  if (options.chatId) bindings.push(options.chatId);

  const { results } = await db
    .prepare(
      `SELECT
         m.id as message_id,
         m.chat_id as chat_id,
         m.sender_id as sender_id,
         u.display_name as sender_display_name,
         c.type as chat_type,
         c.direct_key as direct_key,
         g.name as group_name,
         snippet(messages_fts, 0, '\u0001', '\u0002', '…', ${SNIPPET_TOKENS}) as snippet,
         m.created_at as created_at
       FROM messages_fts
       JOIN messages m ON m.rowid = messages_fts.rowid
       JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?1 AND cm.left_at IS NULL
       JOIN chats c ON c.id = m.chat_id
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN groups g ON g.chat_id = c.id
       WHERE messages_fts MATCH ?2
         AND m.deleted_for_everyone = 0
         AND m.content_type != 'system'
         AND m.id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = ?1)
         ${chatClause}
       ORDER BY rank
       LIMIT ${limit}`,
    )
    .bind(...bindings)
    .all<MessageSearchRow>();

  return (results ?? []).map((row) => ({
    messageId: row.message_id,
    chatId: row.chat_id,
    chatTitle:
      row.chat_type === 'group'
        ? (row.group_name ?? 'Group')
        : row.direct_key === `${userId}:${userId}`
          ? 'Saved Messages'
          : row.sender_display_name,
    senderId: row.sender_id,
    senderDisplayName: row.sender_display_name,
    snippetParts: parseSnippetMarkers(row.snippet),
    createdAt: row.created_at,
  }));
}

/** Splits a snippet() result on the \u0001/\u0002 markers into plain-text segments — see MessageSearchResult.snippetParts for why this isn't an HTML string. */
function parseSnippetMarkers(raw: string): Array<{ text: string; highlighted: boolean }> {
  const parts: Array<{ text: string; highlighted: boolean }> = [];
  const regex = /\u0001([^\u0002]*)\u0002|([^\u0001]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    if (match[1] !== undefined) {
      parts.push({ text: match[1], highlighted: true });
    } else if (match[2] !== undefined) {
      parts.push({ text: match[2], highlighted: false });
    }
  }
  return parts;
}

/**
 * Prefix/substring search over username and display name. SQLite can use
 * the existing index for a `LIKE 'prefix%'` pattern but not `'%substr%'`
 * (leading wildcard), so this checks prefix matches on both fields — good
 * enough for a contacts-style search without needing a second FTS index
 * just for names.
 */
export async function searchUsers(
  db: D1Database,
  currentUserId: string,
  rawQuery: string,
  limit = 20,
): Promise<PublicUser[]> {
  const term = rawQuery.trim();
  if (!term) return [];
  const likePattern = `${term.toLowerCase()}%`;

  const { results } = await db
    .prepare(
      `SELECT u.* FROM users u
       WHERE u.id != ?
         AND (u.username_lower LIKE ? OR u.display_name LIKE ? COLLATE NOCASE)
         AND u.id NOT IN (
           SELECT blocked_user_id FROM blocked_users WHERE user_id = ?
           UNION
           SELECT user_id FROM blocked_users WHERE blocked_user_id = ?
         )
       ORDER BY u.username_lower ASC
       LIMIT ?`,
    )
    .bind(currentUserId, likePattern, likePattern, currentUserId, currentUserId, limit)
    .all<Parameters<typeof toPublicUser>[0]>();

  return (results ?? []).map(toPublicUser);
}

export interface GroupSearchResult {
  groupId: string;
  chatId: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
}

/** Searches only among groups the user is already a member of — groups aren't publicly discoverable in this build, only joinable by invite. */
export async function searchGroups(db: D1Database, userId: string, rawQuery: string, limit = 20): Promise<GroupSearchResult[]> {
  const term = rawQuery.trim();
  if (!term) return [];
  const likePattern = `%${term}%`;

  const { results } = await db
    .prepare(
      `SELECT g.id as group_id, g.chat_id as chat_id, g.name as name, g.avatar_url as avatar_url,
              (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.left_at IS NULL) as member_count
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ? AND gm.left_at IS NULL
       WHERE g.name LIKE ? COLLATE NOCASE
       ORDER BY g.name ASC
       LIMIT ?`,
    )
    .bind(userId, likePattern, limit)
    .all<{ group_id: string; chat_id: string; name: string; avatar_url: string | null; member_count: number }>();

  return (results ?? []).map((row) => ({
    groupId: row.group_id,
    chatId: row.chat_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    memberCount: row.member_count,
  }));
}
