'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCheck, Copy, Forward, MoreHorizontal, Pencil, Reply, SmilePlus, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { MessageAttachments } from './message-attachments';
import { cn } from '@/lib/utils/cn';
import { formatMessageTime } from '@/lib/utils/format';
import type { PublicMessage } from '@/lib/db/messages';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export interface MessageBubbleProps {
  message: PublicMessage;
  isOwn: boolean;
  showSenderInfo: boolean;
  readStatus: 'sent' | 'read' | null;
  isHighlighted?: boolean;
  onReply: (message: PublicMessage) => void;
  onEdit: (message: PublicMessage) => void;
  onDelete: (messageId: string, forEveryone: boolean) => void;
  onForward: (message: PublicMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
}

export function MessageBubble({
  message,
  isOwn,
  showSenderInfo,
  readStatus,
  isHighlighted,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onReact,
  onRemoveReaction,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isDeleted = message.deletedForEveryone;
  const myReaction = message.reactions.find((r) => r.reactedByMe);

  function handleQuickReact(emoji: string) {
    setPickerOpen(false);
    if (myReaction?.emoji === emoji) {
      onRemoveReaction(message.id);
    } else {
      onReact(message.id, emoji);
    }
  }

  function handleCopy() {
    if (message.content) navigator.clipboard.writeText(message.content);
    setMenuOpen(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn('group flex gap-2 px-4', isOwn ? 'justify-end' : 'justify-start')}
    >
      {!isOwn && (
        <div className="w-8 shrink-0">
          {showSenderInfo && message.sender && <Avatar src={message.sender.avatarUrl} name={message.sender.displayName} size="sm" />}
        </div>
      )}

      <div className={cn('flex max-w-[70%] flex-col', isOwn ? 'items-end' : 'items-start')}>
        {showSenderInfo && !isOwn && message.sender && (
          <span className="mb-0.5 px-1 text-xs font-medium text-nova-600 dark:text-nova-300">
            {message.sender.displayName}
          </span>
        )}

        <div className={cn('relative flex items-center gap-1.5', isOwn ? 'flex-row-reverse' : 'flex-row')}>
          {/* Hover toolbar */}
          {!isDeleted && (
            <div
              className={cn(
                'flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100',
                (menuOpen || pickerOpen) && 'opacity-100',
              )}
            >
              <button
                type="button"
                onClick={() => onReply(message)}
                className="nova-focus-ring rounded-full p-1.5 text-foreground-subtle hover:bg-surface-sunken hover:text-foreground"
                aria-label="Reply"
              >
                <Reply size={14} />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="nova-focus-ring rounded-full p-1.5 text-foreground-subtle hover:bg-surface-sunken hover:text-foreground"
                  aria-label="React"
                >
                  <SmilePlus size={14} />
                </button>
                {pickerOpen && (
                  <div
                    className={cn(
                      'absolute top-8 z-10 flex gap-0.5 rounded-full border border-border bg-surface-raised p-1 shadow-panel dark:shadow-panel-dark',
                      isOwn ? 'right-0' : 'left-0',
                    )}
                  >
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleQuickReact(emoji)}
                        className="nova-focus-ring rounded-full p-1 text-lg hover:bg-surface-sunken"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="nova-focus-ring rounded-full p-1.5 text-foreground-subtle hover:bg-surface-sunken hover:text-foreground"
                  aria-label="More actions"
                >
                  <MoreHorizontal size={14} />
                </button>
                {menuOpen && (
                  <div
                    className={cn(
                      'absolute top-8 z-10 w-40 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-panel dark:shadow-panel-dark',
                      isOwn ? 'right-0' : 'left-0',
                    )}
                  >
                    {message.content && (
                      <MenuItem icon={Copy} label="Copy" onClick={handleCopy} />
                    )}
                    <MenuItem
                      icon={Forward}
                      label="Forward"
                      onClick={() => {
                        setMenuOpen(false);
                        onForward(message);
                      }}
                    />
                    {isOwn && message.contentType === 'text' && (
                      <MenuItem
                        icon={Pencil}
                        label="Edit"
                        onClick={() => {
                          setMenuOpen(false);
                          onEdit(message);
                        }}
                      />
                    )}
                    <MenuItem
                      icon={Trash2}
                      label="Delete for me"
                      danger
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete(message.id, false);
                      }}
                    />
                    {isOwn && (
                      <MenuItem
                        icon={Trash2}
                        label="Delete for everyone"
                        danger
                        onClick={() => {
                          setMenuOpen(false);
                          onDelete(message.id, true);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div
            className={cn(
              'rounded-bubble px-3.5 py-2 transition-shadow duration-500',
              isOwn ? 'rounded-br-bubble-tail bg-bubble-own text-bubble-own-foreground' : 'rounded-bl-bubble-tail bg-bubble-other text-bubble-other-foreground',
              isDeleted && 'italic opacity-60',
              isHighlighted && 'ring-2 ring-nova-500 ring-offset-2 ring-offset-surface',
            )}
          >
            {message.forwardedFrom && (
              <p className={cn('mb-1 text-xs font-medium', isOwn ? 'text-white/70' : 'text-foreground-subtle')}>
                Forwarded from {message.forwardedFrom.displayName}
              </p>
            )}

            {message.replyTo && (
              <div
                className={cn(
                  'mb-1.5 rounded-md border-l-2 px-2 py-1 text-xs',
                  isOwn ? 'border-white/40 bg-white/10' : 'border-nova-500 bg-surface-sunken',
                )}
              >
                <p className="font-medium">{message.replyTo.senderDisplayName}</p>
                <p className="truncate opacity-80">{message.replyTo.preview ?? 'Message deleted'}</p>
              </div>
            )}

            {!isDeleted && message.attachments.length > 0 && (
              <MessageAttachments attachments={message.attachments} isOwn={isOwn} />
            )}

            {(isDeleted || message.content) && (
              <p className="whitespace-pre-wrap break-words text-sm">
                {isDeleted ? 'This message was deleted' : message.content}
              </p>
            )}

            <div className={cn('mt-1 flex items-center gap-1 text-[11px]', isOwn ? 'text-white/70' : 'text-foreground-subtle')}>
              {message.isEdited && !isDeleted && <span>edited</span>}
              <span>{formatMessageTime(message.createdAt)}</span>
              {isOwn && readStatus && (
                readStatus === 'read' ? (
                  <CheckCheck size={13} className="text-white" />
                ) : (
                  <Check size={13} />
                )
              )}
            </div>
          </div>
        </div>

        {message.reactions.length > 0 && (
          <div className={cn('mt-1 flex flex-wrap gap-1', isOwn ? 'justify-end' : 'justify-start')}>
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => handleQuickReact(reaction.emoji)}
                className={cn(
                  'nova-focus-ring flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs',
                  reaction.reactedByMe
                    ? 'border-nova-400 bg-nova-100 dark:bg-nova-900'
                    : 'border-border bg-surface-sunken',
                )}
              >
                <span>{reaction.emoji}</span>
                <span className="text-foreground-muted">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'nova-focus-ring flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-sunken',
        danger ? 'text-danger' : 'text-foreground',
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
