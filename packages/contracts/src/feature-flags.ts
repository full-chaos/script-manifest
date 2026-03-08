import { z } from "zod";

// ── Feature Flag ────────────────────────────────────────────────────

export const FeatureFlagSchema = z.object({
  key: z.string().min(1),
  description: z.string(),
  enabled: z.boolean(),
  rolloutPct: z.number().int().min(0).max(100),
  userAllowlist: z.array(z.string()),
  updatedBy: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

// ── Create Flag ─────────────────────────────────────────────────────

export const CreateFeatureFlagRequestSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/),
  description: z.string().max(1000).default(""),
  enabled: z.boolean().default(false)
});
export type CreateFeatureFlagRequest = z.infer<typeof CreateFeatureFlagRequestSchema>;

// ── Update Flag ─────────────────────────────────────────────────────

export const UpdateFeatureFlagRequestSchema = z.object({
  enabled: z.boolean().optional(),
  description: z.string().max(1000).optional(),
  rolloutPct: z.number().int().min(0).max(100).optional(),
  userAllowlist: z.array(z.string()).optional()
});
export type UpdateFeatureFlagRequest = z.infer<typeof UpdateFeatureFlagRequestSchema>;

// ── Client-facing flags response ────────────────────────────────────

export const ClientFlagsResponseSchema = z.object({
  flags: z.record(z.string(), z.boolean())
});
export type ClientFlagsResponse = z.infer<typeof ClientFlagsResponseSchema>;
