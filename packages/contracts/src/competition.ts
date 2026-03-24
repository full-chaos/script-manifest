import { z } from "zod";

export const CompetitionStatusSchema = z.enum(["active", "cancelled"]);
export type CompetitionStatus = z.infer<typeof CompetitionStatusSchema>;

export const CompetitionVisibilitySchema = z.enum(["listed", "unlisted"]);
export type CompetitionVisibility = z.infer<typeof CompetitionVisibilitySchema>;

export const CompetitionAccessTypeSchema = z.enum(["open", "invite_only"]);
export type CompetitionAccessType = z.infer<typeof CompetitionAccessTypeSchema>;

export const CompetitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  format: z.string().min(1),
  genre: z.string().min(1),
  feeUsd: z.number().nonnegative().default(0),
  deadline: z.string().datetime({ offset: true }),
  status: CompetitionStatusSchema.default("active"),
  visibility: CompetitionVisibilitySchema.default("listed"),
  accessType: CompetitionAccessTypeSchema.default("open")
});

export type Competition = z.infer<typeof CompetitionSchema>;

export const CompetitionUpsertRequestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  format: z.string().min(1),
  genre: z.string().min(1),
  feeUsd: z.number().nonnegative().default(0),
  deadline: z.string().datetime({ offset: true })
});

export type CompetitionUpsertRequest = z.infer<typeof CompetitionUpsertRequestSchema>;

export const CompetitionVisibilityUpdateSchema = z.object({
  visibility: CompetitionVisibilitySchema
});

export type CompetitionVisibilityUpdate = z.infer<typeof CompetitionVisibilityUpdateSchema>;

export const CompetitionAccessTypeUpdateSchema = z.object({
  accessType: CompetitionAccessTypeSchema
});

export type CompetitionAccessTypeUpdate = z.infer<typeof CompetitionAccessTypeUpdateSchema>;

export const CompetitionFiltersSchema = z.object({
  query: z.string().trim().min(1).optional(),
  format: z.string().trim().min(1).optional(),
  genre: z.string().trim().min(1).optional(),
  maxFeeUsd: z.coerce.number().nonnegative().optional(),
  deadlineBefore: z.coerce.date().optional(),
  includeHidden: z.coerce.boolean().optional(),
  includeCancelled: z.coerce.boolean().optional()
});

export type CompetitionFilters = z.infer<typeof CompetitionFiltersSchema>;

export const CompetitionIndexDocumentSchema = CompetitionSchema;
export const CompetitionIndexBulkRequestSchema = z.array(CompetitionIndexDocumentSchema);
