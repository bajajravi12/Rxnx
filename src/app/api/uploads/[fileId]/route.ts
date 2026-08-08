import { getEnv } from '@/lib/cloudflare';
import { requireUser } from '@/lib/auth/guard';
import { requireActiveChatMember } from '@/lib/db/chat-members';
import { getAttachmentById, getAttachmentChatId } from '@/lib/db/attachments';
import { ApiError } from '@/lib/utils/api-error';
import { apiSuccess, handleRouteError } from '@/lib/utils/api-response';

export const runtime = 'edge';

interface RouteParams {
  params: Promise<{ fileId: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { fileId } = await params;

    const attachment = await getAttachmentById(env.DB, fileId);
    if (!attachment) throw ApiError.notFound('Upload not found — request a new one.');
    if (attachment.uploaded_by !== user.id) throw ApiError.forbidden('This upload does not belong to you.');
    if (attachment.message_id !== null) {
      throw ApiError.forbidden('This attachment has already been sent and cannot be replaced.');
    }
    if (!request.body) {
      throw new ApiError('Request body is required.', 400);
    }

    const result = await env.UPLOADS_BUCKET.put(attachment.r2_key, request.body, {
      httpMetadata: { contentType: attachment.mime_type },
    });

    // Trust the byte count R2 actually received over whatever the client
    // declared in the presign request.
    await env.DB.prepare('UPDATE attachments SET size_bytes = ? WHERE id = ?').bind(result.size, attachment.id).run();

    return apiSuccess({ uploaded: true, sizeBytes: result.size });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const env = getEnv();
    const user = await requireUser();
    const { fileId } = await params;

    const attachment = await getAttachmentById(env.DB, fileId);
    if (!attachment || attachment.message_id === null) {
      throw ApiError.notFound('File not found.');
    }

    const chatId = await getAttachmentChatId(env.DB, fileId);
    if (!chatId) throw ApiError.notFound('File not found.');
    await requireActiveChatMember(env.DB, chatId, user.id);

    const object = await env.UPLOADS_BUCKET.get(attachment.r2_key);
    if (!object || !object.body) {
      throw ApiError.notFound('File content not found in storage.');
    }

    const forceDownload = new URL(request.url).searchParams.get('download') === '1';
    const disposition = forceDownload
      ? `attachment; filename="${encodeURIComponent(attachment.file_name)}"`
      : `inline; filename="${encodeURIComponent(attachment.file_name)}"`;

    return new Response(object.body, {
      headers: {
        'content-type': attachment.mime_type,
        'content-length': String(attachment.size_bytes),
        'content-disposition': disposition,
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
