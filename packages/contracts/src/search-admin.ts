import { z } from "zod";

// ── Search Index Status ─────────────────────────────────────────────

export const SearchIndexStatusSchema = z.object({
  clusterHealth: z.string(),
  indexName: z.string(),
  documentCount: z.number().int().nonnegative(),
  indexSizeBytes: z.number().int().nonnegative(),
  lastSyncAt: z.string().datetime({ offset: true }).nullable()
});
export type SearchIndexStatus = z.infer<typeof SearchIndexStatusSchema>;

// ── Reindex Request ─────────────────────────────────────────────────

export const ReindexTypeSchema = z.enum(["competitions", "all"]);
export type ReindexType = z.infer<typeof ReindexTypeSchema>;

export const ReindexRequestSchema = z.object({
  type: ReindexTypeSchema.default("all")
});
export type ReindexRequest = z.infer<typeof ReindexRequestSchema>;

export const ReindexResponseSchema = z.object({
  jobId: z.string().min(1),
  type: ReindexTypeSchema,
  status: z.string(),
  startedAt: z.string().datetime({ offset: true })
});
export type ReindexResponse = z.infer<typeof ReindexResponseSchema>;
