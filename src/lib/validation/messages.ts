import { z } from 'zod';

export const createChatSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
});
export type CreateChatInput = z.infer<typeof createChatSchema>;

export const listMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

const messageTextSchema = z
  .string()
  .trim()
  .min(1, 'Message cannot be empty')
  .max(4000, 'Message must be at most 4000 characters');

/**
 * A "send" request is a normal message (optionally a reply), a forward of
 * an existing message into this chat, or an attachment message (content
 * becomes an optional caption) — attachmentIds reference attachments
 * already uploaded via /api/uploads/presign + PUT /api/uploads/[fileId].
 */
export const sendMessageSchema = z
  .object({
    clientId: z.string().max(64).optional(),
    content: messageTextSchema.optional(),
    replyToMessageId: z.string().optional(),
    forwardMessageId: z.string().optional(),
    attachmentIds: z.array(z.string().min(1)).min(1).max(10).optional(),
  })
  .refine(
    (data) => {
      const hasForward = Boolean(data.forwardMessageId);
      const hasAttachments = Boolean(data.attachmentIds && data.attachmentIds.length > 0);
      const hasContent = Boolean(data.content);
      if (hasForward) return !hasAttachments && !hasContent;
      return hasAttachments || hasContent;
    },
    { message: 'Provide content and/or attachmentIds, or forwardMessageId on its own' },
  );
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  content: messageTextSchema,
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

export const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(8),
});
export type ReactionInput = z.infer<typeof reactionSchema>;

export const readReceiptSchema = z.object({
  messageId: z.string().min(1, 'messageId is required'),
});
export type ReadReceiptInput = z.infer<typeof readReceiptSchema>;

export const pinMessageSchema = z.object({
  messageId: z.string().min(1, 'messageId is required'),
});
export type PinMessageInput = z.infer<typeof pinMessageSchema>;

export const chatMemberSettingsSchema = z.object({
  isMuted: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});
export type ChatMemberSettingsInput = z.infer<typeof chatMemberSettingsSchema>;
