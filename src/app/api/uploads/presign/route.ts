import { getEnv, getAppConfig } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { requireActiveChatMember } from '@/lib/db/chat-members';
import { createPendingAttachment } from '@/lib/db/attachments';
import { generateId } from '@/lib/db/ids';
import { resolveAttachmentKind } from '@/lib/utils/mime';
import { presignUploadSchema } from '@/lib/validation/uploads';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';
import { parseJsonBody } from '@/lib/utils/validate';

export const runtime = 'edge';

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const config = getAppConfig(env);
    const user = await requireUser();
    const input = await parseJsonBody(request, presignUploadSchema);

    await requireActiveChatMember(env.DB, input.chatId, user.id);

    if (input.sizeBytes > config.maxUploadBytes) {
      throw new ApiError(
        `File is too large. Maximum size is ${Math.floor(config.maxUploadBytes / (1024 * 1024))} MB.`,
        413,
        { code: 'FILE_TOO_LARGE' },
      );
    }

    const kind = resolveAttachmentKind(input.mimeType, input.isVoiceNote);
    if (!kind) {
      throw new ApiError(`File type "${input.mimeType}" is not supported.`, 415, { code: 'UNSUPPORTED_TYPE' });
    }

    const r2Key = `uploads/${input.chatId}/${generateId()}/${sanitizeFileName(input.fileName)}`;

    const attachment = await createPendingAttachment(env.DB, {
      kind,
      r2Key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? null,
      uploadedBy: user.id,
    });

    return apiSuccess({ attachmentId: attachment.id, uploadUrl: `/api/uploads/${attachment.id}` }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
