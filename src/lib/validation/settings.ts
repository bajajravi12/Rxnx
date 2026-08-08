import { z } from 'zod';
import { bioSchema, displayNameSchema } from './auth';

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  bio: bioSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const blockUserSchema = z.object({
  userId: z.string().min(1),
});
export type BlockUserInput = z.infer<typeof blockUserSchema>;
