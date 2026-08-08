import { resolveAttachmentKind } from '@/lib/utils/mime';
import { extractMediaMetadata } from '@/lib/utils/media-metadata';
import { api, ApiClientError } from '@/lib/api/client';

export interface UploadFileOptions {
  isVoiceNote?: boolean;
  onProgress?: (fraction: number) => void;
}

export interface UploadFileResult {
  attachmentId: string;
}

/**
 * Uploads a single file: validates its type client-side (fast feedback
 * before hitting the network), asks the server for a pending attachment
 * (POST /api/uploads/presign), then streams the bytes via XHR — chosen
 * over fetch() specifically because only XHR exposes upload progress
 * events, which the staging UI needs for a real progress bar.
 */
export async function uploadFile(file: File, chatId: string, options: UploadFileOptions = {}): Promise<UploadFileResult> {
  const kind = resolveAttachmentKind(file.type, options.isVoiceNote);
  if (!kind) {
    throw new ApiClientError(`"${file.type || 'this file type'}" is not supported.`, 415, 'UNSUPPORTED_TYPE');
  }

  const metadata = await extractMediaMetadata(file, kind);

  const { attachmentId, uploadUrl } = await api.post<{ attachmentId: string; uploadUrl: string }>('/api/uploads/presign', {
    chatId,
    fileName: file.name || `${kind}-${Date.now()}`,
    mimeType: file.type,
    sizeBytes: file.size,
    isVoiceNote: options.isVoiceNote ?? false,
    width: metadata.width,
    height: metadata.height,
    durationSeconds: metadata.durationSeconds,
  });

  await putWithProgress(uploadUrl, file, options.onProgress);

  return { attachmentId };
}

function putWithProgress(url: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        let message = `Upload failed with status ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error?.message) message = body.error.message;
        } catch {
          // non-JSON error body — keep the generic message
        }
        reject(new ApiClientError(message, xhr.status));
      }
    };

    xhr.onerror = () => reject(new ApiClientError('Network error during upload.', 0));
    xhr.send(file);
  });
}
