import { z } from "zod";

// ── Search Sync Events (Kafka / Redpanda) ───────────────────────────

export const SearchSyncCollectionSchema = z.enum(["competitions", "talent", "projects"]);
export type SearchSyncCollection = z.infer<typeof SearchSyncCollectionSchema>;

export const SearchSyncOperationSchema = z.enum(["upsert", "delete"]);
export type SearchSyncOperation = z.infer<typeof SearchSyncOperationSchema>;

export const SearchSyncEventSchema = z.object({
  collection: SearchSyncCollectionSchema,
  documentId: z.string().min(1),
  operation: SearchSyncOperationSchema,
  payload: z.record(z.string(), z.unknown()).nullable(),
});
export type SearchSyncEvent = z.infer<typeof SearchSyncEventSchema>;
