import { generateId, now } from './ids';

export interface AttachmentRow {
  id: string;
  message_id: string | null;
  kind: 'image' | 'video' | 'audio' | 'voice' | 'document';
  r2_key: string;
  thumbnail_r2_key: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  uploaded_by: string;
  created_at: number;
}

export interface PublicAttachment {
  id: string;
  kind: AttachmentRow['kind'];
  url: string;
  thumbnailUrl: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export async function listAttachmentsForMessages(db: D1Database, messageIds: string[]): Promise<AttachmentRow[]> {
  if (messageIds.length === 0) return [];
  const placeholders = messageIds.map(() => '?').join(', ');
  const result = await db
    .prepare(`SELECT * FROM attachments WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`)
    .bind(...messageIds)
    .all<AttachmentRow>();
  return result.results ?? [];
}

export async function getAttachmentById(db: D1Database, attachmentId: string): Promise<AttachmentRow | null> {
  const row = await db.prepare('SELECT * FROM attachments WHERE id = ? LIMIT 1').bind(attachmentId).first<AttachmentRow>();
  return row ?? null;
}

export interface CreatePendingAttachmentInput {
  kind: AttachmentRow['kind'];
  r2Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  uploadedBy: string;
}

/**
 * Creates an attachment row with no message yet — the client uploads
 * bytes to R2 referencing this row's id, and only once that succeeds does
 * it create the message that links this attachment via
 * `linkAttachmentsToMessage`. An attachment that never gets linked (an
 * abandoned upload) is simply an orphan row pointing at an R2 object; a
 * periodic cleanup job would sweep these in a production deployment (out
 * of scope here — no Cron Trigger is wired up in this build).
 */
export async function createPendingAttachment(db: D1Database, input: CreatePendingAttachmentInput): Promise<AttachmentRow> {
  const id = generateId('att');
  const timestamp = now();

  await db
    .prepare(
      `INSERT INTO attachments (
        id, message_id, kind, r2_key, thumbnail_r2_key, file_name, mime_type,
        size_bytes, width, height, duration_seconds, uploaded_by, created_at
      ) VALUES (?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.kind,
      input.r2Key,
      input.fileName,
      input.mimeType,
      input.sizeBytes,
      input.width,
      input.height,
      input.durationSeconds,
      input.uploadedBy,
      timestamp,
    )
    .run();

  const row = await getAttachmentById(db, id);
  if (!row) throw new Error(`Failed to read back newly created attachment ${id}`);
  return row;
}

export async function getAttachmentsByIds(db: D1Database, ids: string[]): Promise<AttachmentRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const result = await db.prepare(`SELECT * FROM attachments WHERE id IN (${placeholders})`).bind(...ids).all<AttachmentRow>();
  return result.results ?? [];
}

export async function getAttachmentChatId(db: D1Database, attachmentId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT m.chat_id as chat_id FROM attachments a
       JOIN messages m ON m.id = a.message_id
       WHERE a.id = ? LIMIT 1`,
    )
    .bind(attachmentId)
    .first<{ chat_id: string }>();
  return row?.chat_id ?? null;
}

/**
 * Used when forwarding a message that has attachments: creates new
 * attachment rows (new ids, pointing at the new message) that reference
 * the *same* underlying R2 object via a shared r2_key — no re-upload or
 * storage duplication needed, since the bytes themselves don't change.
 */
export async function copyAttachmentsToMessage(
  db: D1Database,
  originalMessageId: string,
  newMessageId: string,
  copiedBy: string,
): Promise<void> {
  const originals = await listAttachmentsForMessages(db, [originalMessageId]);
  if (originals.length === 0) return;

  const timestamp = now();
  const statements = originals.map((a) =>
    db
      .prepare(
        `INSERT INTO attachments (
          id, message_id, kind, r2_key, thumbnail_r2_key, file_name, mime_type,
          size_bytes, width, height, duration_seconds, uploaded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        generateId('att'),
        newMessageId,
        a.kind,
        a.r2_key,
        a.thumbnail_r2_key,
        a.file_name,
        a.mime_type,
        a.size_bytes,
        a.width,
        a.height,
        a.duration_seconds,
        copiedBy,
        timestamp,
      ),
  );

  await db.batch(statements);
}

/**
 * Links a set of the *caller's own* pending (message_id IS NULL)
 * attachments to a newly created message. Returns the ids that were
 * actually linked, so the caller can detect and ignore any ids that were
 * invalid, already linked, or owned by someone else, rather than trusting
 * client input blindly.
 */
export async function linkAttachmentsToMessage(
  db: D1Database,
  attachmentIds: string[],
  messageId: string,
  uploadedBy: string,
): Promise<string[]> {
  if (attachmentIds.length === 0) return [];
  const placeholders = attachmentIds.map(() => '?').join(', ');
  await db
    .prepare(
      `UPDATE attachments SET message_id = ?
       WHERE id IN (${placeholders}) AND uploaded_by = ? AND message_id IS NULL`,
    )
    .bind(messageId, ...attachmentIds, uploadedBy)
    .run();

  const { results } = await db
    .prepare(`SELECT id FROM attachments WHERE message_id = ? AND id IN (${placeholders})`)
    .bind(messageId, ...attachmentIds)
    .all<{ id: string }>();
  return (results ?? []).map((r) => r.id);
}

/**
 * Attachments are never served from a raw R2 URL — R2 buckets in this
 * project are private, and downloads are streamed through the
 * authenticated /api/uploads/[fileId] proxy route so access control (chat
 * membership) applies to file downloads exactly like it does to message
 * content.
 */
export function toPublicAttachment(row: AttachmentRow): PublicAttachment {
  return {
    id: row.id,
    kind: row.kind,
    url: `/api/uploads/${row.id}`,
    thumbnailUrl: row.thumbnail_r2_key ? `/api/uploads/${row.id}?variant=thumbnail` : null,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
  };
}
