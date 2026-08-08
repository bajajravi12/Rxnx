import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required').max(200),
  chatId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
