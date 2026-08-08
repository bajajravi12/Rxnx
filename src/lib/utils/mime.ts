export type AttachmentKind = 'image' | 'video' | 'audio' | 'voice' | 'document';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']);
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a']);
// Voice notes are always recorded client-side via MediaRecorder, which
// (across supported browsers) produces one of these container/codec types.
const VOICE_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4']);
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/json',
]);

/**
 * Determines the attachment kind for a given mime type + the caller's
 * intent (a webm audio blob could be either a regular audio upload or a
 * recorded voice note — `preferVoice` disambiguates that one overlapping
 * case). Returns null for anything not in the allow-list, which the
 * upload route rejects rather than guessing.
 */
export function resolveAttachmentKind(mimeType: string, preferVoice = false): AttachmentKind | null {
  if (preferVoice && VOICE_TYPES.has(mimeType)) return 'voice';
  if (IMAGE_TYPES.has(mimeType)) return 'image';
  if (VIDEO_TYPES.has(mimeType)) return 'video';
  if (AUDIO_TYPES.has(mimeType)) return 'audio';
  if (DOCUMENT_TYPES.has(mimeType)) return 'document';
  return null;
}

export function accFor(kind: AttachmentKind | 'any'): string {
  switch (kind) {
    case 'image':
      return Array.from(IMAGE_TYPES).join(',');
    case 'video':
      return Array.from(VIDEO_TYPES).join(',');
    case 'audio':
      return Array.from(AUDIO_TYPES).join(',');
    case 'voice':
      return Array.from(VOICE_TYPES).join(',');
    case 'document':
      return Array.from(DOCUMENT_TYPES).join(',');
    case 'any':
      return [...IMAGE_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES, ...DOCUMENT_TYPES].join(',');
    default:
      return '';
  }
}
