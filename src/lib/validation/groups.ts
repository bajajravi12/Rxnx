import { z } from 'zod';

export const groupNameSchema = z.string().trim().min(1, 'Group name is required').max(100, 'Group name must be at most 100 characters');
export const groupDescriptionSchema = z.string().max(500, 'Description must be at most 500 characters');

export const createGroupSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema.optional().default(''),
  memberIds: z.array(z.string().min(1)).min(1, 'Add at least one other member').max(200, 'Too many members'),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z.object({
  name: groupNameSchema.optional(),
  description: groupDescriptionSchema.optional(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const addGroupMembersSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, 'Select at least one person to add').max(200, 'Too many members'),
});
export type AddGroupMembersInput = z.infer<typeof addGroupMembersSchema>;

export const updateGroupMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});
export type UpdateGroupMemberRoleInput = z.infer<typeof updateGroupMemberRoleSchema>;
