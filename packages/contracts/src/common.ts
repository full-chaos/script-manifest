import { z } from "zod";

export const OptionalUrlStringSchema = z.union([z.literal(""), z.string().url().max(2048)]);

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(30),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export function PaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
}
export type PaginatedResponse<T> = { items: T[]; total: number; limit: number; offset: number };
