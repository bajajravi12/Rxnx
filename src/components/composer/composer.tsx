'use client';

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { IconButton } from '@/components/ui/icon-button';
import { useAttachmentStaging } from '@/components/upload/use-attachment-staging';
import { AttachmentStagingPreview } from '@/components/upload/attachment-staging-preview';
import { VoiceRecorder } from '@/components/upload/voice-recorder';
import { accFor } from '@/lib/utils/mime';
import type { PublicMessage } from '@/lib/db/messages';

const TYPING_STOP_DELAY_MS = 2000;

export interface ComposerProps {
  chatId: string;
  replyingTo: PublicMessage | null;
  onCancelReply: () => void;
  editingMessage: PublicMessage | null;
  onCancelEdit: () => void;
  onSend: (content: string, replyToMessageId?: string, attachmentIds?: string[]) => void;
  onSubmitEdit: (messageId: string, content: string) => void;
  onTyping: (isTyping: boolean) => void;
}

export function Composer({
  chatId,
  replyingTo,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  onSend,
  onSubmitEdit,
  onTyping,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const isTypingRef = useRef(false);
  const stopTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { files, addFiles, addRecordedVoiceNote, removeFile, reset, isUploading, readyAttachmentIds } =
    useAttachmentStaging(chatId);

  useEffect(() => {
    if (editingMessage) {
      setValue(editingMessage.content ?? '');
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo]);

  // Switching chats abandons any in-flight staged uploads for the
  // previous chat rather than silently attaching them to the new one.
  useEffect(() => {
    reset();
  }, [chatId, reset]);

  function signalTyping() {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping(true);
    }
    if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    stopTypingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping(false);
    }, TYPING_STOP_DELAY_MS);
  }

  function stopTypingNow() {
    if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTyping(false);
    }
  }

  const canSubmit = !isUploading && (value.trim().length > 0 || readyAttachmentIds.length > 0);

  function handleSubmit() {
    if (!canSubmit) return;
    const trimmed = value.trim();
    stopTypingNow();

    if (editingMessage) {
      if (!trimmed) return;
      onSubmitEdit(editingMessage.id, trimmed);
    } else {
      onSend(trimmed, replyingTo?.id, readyAttachmentIds.length > 0 ? readyAttachmentIds : undefined);
      reset();
    }
    setValue('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
    if (event.key === 'Escape') {
      if (editingMessage) onCancelEdit();
      else if (replyingTo) onCancelReply();
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = '';
  }

  const banner = editingMessage
    ? { label: 'Editing message', preview: editingMessage.content ?? '', onCancel: onCancelEdit }
    : replyingTo
      ? {
          label: `Replying to ${replyingTo.sender?.displayName ?? 'message'}`,
          preview: replyingTo.content ?? '',
          onCancel: onCancelReply,
        }
      : null;

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      {banner && (
        <div className="mb-2 flex items-center justify-between rounded-lg border-l-2 border-nova-500 bg-surface-sunken px-3 py-1.5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-nova-600 dark:text-nova-300">{banner.label}</p>
            <p className="truncate text-xs text-foreground-muted">{banner.preview}</p>
          </div>
          <IconButton aria-label="Cancel" onClick={banner.onCancel} className="h-7 w-7">
            <X size={14} />
          </IconButton>
        </div>
      )}

      {!editingMessage && <AttachmentStagingPreview files={files} onRemove={removeFile} />}

      <div className="flex items-end gap-1.5 rounded-xl border border-border bg-surface-sunken px-2 py-1.5">
        {!editingMessage && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={accFor('any')}
              onChange={handleFileInputChange}
              className="hidden"
            />
            <IconButton aria-label="Attach file" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={18} />
            </IconButton>
          </>
        )}

        <Textarea
          ref={textareaRef}
          autoGrow
          maxRows={6}
          value={value}
          placeholder="Message"
          onChange={(e) => {
            setValue(e.target.value);
            if (e.target.value) signalTyping();
            else stopTypingNow();
          }}
          onKeyDown={handleKeyDown}
          onBlur={stopTypingNow}
        />

        {!editingMessage && value.trim().length === 0 && (
          <VoiceRecorder onRecorded={(blob, mimeType) => addRecordedVoiceNote(blob, mimeType)} />
        )}

        <IconButton
          aria-label={editingMessage ? 'Save edit' : 'Send message'}
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mb-1 bg-nova-600 text-white hover:bg-nova-700 disabled:bg-nova-600/40 disabled:text-white/70"
        >
          <Send size={16} />
        </IconButton>
      </div>
    </div>
  );
}
