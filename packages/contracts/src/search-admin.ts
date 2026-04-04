import { z } from "zod";

// ── Search Status (Postgres FTS) ────────────────────────────────────

export const SearchStatusSchema = z.object({
  backend: z.literal("postgres_fts"),
  searchHealth: z.enum(["ready", "degraded"]),
  documentCount: z.number().int().nonnegative(),
  indexSizeBytes: z.number().int().nonnegative().nullable(),
  lastSyncAt: z.string().datetime({ offset: true }).nullable(),
  notes: z.array(z.string())
});
export type SearchStatus = z.infer<typeof SearchStatusSchema>;

// ── Legacy re-exports for backward compatibility during migration ───
// TODO: Remove after all consumers migrate to SearchStatus

/** @deprecated Use SearchStatusSchema */
export const SearchIndexStatusSchema = SearchStatusSchema;
/** @deprecated Use SearchStatus */
export type SearchIndexStatus = SearchStatus;

// ── Reindex — no longer applicable with Postgres FTS generated columns
// Kept as type stubs for contract consumers; gateway returns static responses.

export const ReindexTypeSchema = z.enum(["competitions", "all"]);
export type ReindexType = z.infer<typeof ReindexTypeSchema>;

export const ReindexRequestSchema = z.object({
  type: ReindexTypeSchema.default("all")
});
export type ReindexRequest = z.infer<typeof ReindexRequestSchema>;

export const ReindexResponseSchema = z.object({
  message: z.string(),
  type: ReindexTypeSchema,
  status: z.string()
});
export type ReindexResponse = z.infer<typeof ReindexResponseSchema>;
