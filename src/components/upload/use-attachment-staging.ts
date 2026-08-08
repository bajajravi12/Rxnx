'use client';

import { useCallback, useRef, useState } from 'react';
import { uploadFile } from '@/hooks/use-file-upload';
import { resolveAttachmentKind, type AttachmentKind } from '@/lib/utils/mime';
import { ApiClientError } from '@/lib/api/client';

export interface StagedFile {
  localId: string;
  file: File;
  kind: AttachmentKind | null;
  previewUrl: string | null;
  progress: number;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
  attachmentId?: string;
}

function generateLocalId(): string {
  return `staged_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useAttachmentStaging(chatId: string | null) {
  const [files, setFiles] = useState<StagedFile[]>([]);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const patchFile = useCallback((localId: string, patch: Partial<StagedFile>) => {
    setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));
  }, []);

  const stageAndUpload = useCallback(
    (file: File, opts: { isVoiceNote?: boolean } = {}) => {
      if (!chatId) return;
      const localId = generateLocalId();
      const kind = resolveAttachmentKind(file.type, opts.isVoiceNote);
      const previewUrl = kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : null;
      if (previewUrl) objectUrlsRef.current.add(previewUrl);

      setFiles((prev) => [
        ...prev,
        { localId, file, kind, previewUrl, progress: 0, status: 'uploading' },
      ]);

      uploadFile(file, chatId, {
        isVoiceNote: opts.isVoiceNote,
        onProgress: (fraction) => patchFile(localId, { progress: fraction }),
      })
        .then((result) => {
          patchFile(localId, { status: 'ready', attachmentId: result.attachmentId, progress: 1 });
        })
        .catch((err) => {
          patchFile(localId, {
            status: 'error',
            error: err instanceof ApiClientError ? err.message : 'Upload failed.',
          });
        });
    },
    [chatId, patchFile],
  );

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      for (const file of Array.from(fileList)) {
        stageAndUpload(file);
      }
    },
    [stageAndUpload],
  );

  const addRecordedVoiceNote = useCallback(
    (blob: Blob, mimeType: string) => {
      const file = new File([blob], `voice-note.${mimeType.includes('ogg') ? 'ogg' : 'webm'}`, { type: mimeType });
      stageAndUpload(file, { isVoiceNote: true });
    },
    [stageAndUpload],
  );

  const removeFile = useCallback((localId: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.localId === localId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        objectUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((f) => f.localId !== localId);
    });
  }, []);

  const reset = useCallback(() => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
    setFiles([]);
  }, []);

  const isUploading = files.some((f) => f.status === 'uploading');
  const hasErrors = files.some((f) => f.status === 'error');
  const readyAttachmentIds = files.filter((f) => f.status === 'ready' && f.attachmentId).map((f) => f.attachmentId as string);

  return { files, addFiles, addRecordedVoiceNote, removeFile, reset, isUploading, hasErrors, readyAttachmentIds };
}
