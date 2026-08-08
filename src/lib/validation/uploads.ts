import { z } from 'zod';

export const presignUploadSchema = z.object({
  chatId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  isVoiceNote: z.boolean().optional().default(false),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().int().positive().optional(),
});
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;
