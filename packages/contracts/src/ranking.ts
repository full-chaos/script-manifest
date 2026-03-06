import { z } from "zod";

export const LeaderboardEntrySchema = z.object({
  writerId: z.string().min(1),
  totalScore: z.number().int(),
  submissionCount: z.number().int().nonnegative(),
  placementCount: z.number().int().nonnegative(),
  lastUpdatedAt: z.string().datetime({ offset: true }).nullable()
});

export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

export const LeaderboardFiltersSchema = z.object({
  format: z.string().trim().min(1).optional(),
  genre: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
  offset: z.coerce.number().int().nonnegative().default(0).optional()
});

export type LeaderboardFilters = z.infer<typeof LeaderboardFiltersSchema>;

// ── Ranking & Leaderboard ────────────────────────────────────────────

export const PrestigeTierSchema = z.enum(["standard", "notable", "elite", "premier"]);
export type PrestigeTier = z.infer<typeof PrestigeTierSchema>;

export const CompetitionPrestigeSchema = z.object({
  competitionId: z.string().min(1),
  tier: PrestigeTierSchema,
  multiplier: z.number().positive(),
  updatedAt: z.string().datetime({ offset: true })
});
export type CompetitionPrestige = z.infer<typeof CompetitionPrestigeSchema>;

export const CompetitionPrestigeUpsertRequestSchema = z.object({
  tier: PrestigeTierSchema,
  multiplier: z.number().positive().max(10)
});
export type CompetitionPrestigeUpsertRequest = z.infer<typeof CompetitionPrestigeUpsertRequestSchema>;

export const TierDesignationSchema = z.enum(["top_25", "top_10", "top_2", "top_1"]);
export type TierDesignation = z.infer<typeof TierDesignationSchema>;

export const RankedWriterEntrySchema = z.object({
  writerId: z.string().min(1),
  rank: z.number().int().positive(),
  totalScore: z.number(),
  submissionCount: z.number().int().nonnegative(),
  placementCount: z.number().int().nonnegative(),
  tier: TierDesignationSchema.nullable(),
  badges: z.array(z.string()),
  scoreChange30d: z.number(),
  lastUpdatedAt: z.string().datetime({ offset: true }).nullable()
});
export type RankedWriterEntry = z.infer<typeof RankedWriterEntrySchema>;

export const RankedLeaderboardFiltersSchema = z.object({
  format: z.string().trim().min(1).optional(),
  genre: z.string().trim().min(1).optional(),
  tier: TierDesignationSchema.optional(),
  trending: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
  offset: z.coerce.number().int().nonnegative().default(0).optional()
});
export type RankedLeaderboardFilters = z.infer<typeof RankedLeaderboardFiltersSchema>;

export const WriterBadgeSchema = z.object({
  id: z.string().min(1),
  writerId: z.string().min(1),
  label: z.string().min(1),
  placementId: z.string().min(1),
  competitionId: z.string().min(1),
  awardedAt: z.string().datetime({ offset: true })
});
export type WriterBadge = z.infer<typeof WriterBadgeSchema>;

export const AntiGamingFlagReasonSchema = z.enum([
  "duplicate_submission",
  "suspicious_pattern",
  "manual_admin"
]);
export type AntiGamingFlagReason = z.infer<typeof AntiGamingFlagReasonSchema>;

export const AntiGamingFlagStatusSchema = z.enum(["open", "dismissed", "confirmed"]);
export type AntiGamingFlagStatus = z.infer<typeof AntiGamingFlagStatusSchema>;

export const AntiGamingFlagSchema = z.object({
  id: z.string().min(1),
  writerId: z.string().min(1),
  reason: AntiGamingFlagReasonSchema,
  details: z.string(),
  status: AntiGamingFlagStatusSchema,
  resolvedByUserId: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});
export type AntiGamingFlag = z.infer<typeof AntiGamingFlagSchema>;

export const RankingAppealStatusSchema = z.enum(["open", "under_review", "upheld", "rejected"]);
export type RankingAppealStatus = z.infer<typeof RankingAppealStatusSchema>;

export const RankingAppealSchema = z.object({
  id: z.string().min(1),
  writerId: z.string().min(1),
  reason: z.string().min(1),
  status: RankingAppealStatusSchema,
  resolutionNote: z.string().nullable(),
  resolvedByUserId: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});
export type RankingAppeal = z.infer<typeof RankingAppealSchema>;

export const RankingAppealCreateRequestSchema = z.object({
  reason: z.string().min(1).max(2000)
});
export type RankingAppealCreateRequest = z.infer<typeof RankingAppealCreateRequestSchema>;

export const RankingAppealResolveRequestSchema = z.object({
  status: z.enum(["upheld", "rejected"]),
  resolutionNote: z.string().max(2000).default("")
});
export type RankingAppealResolveRequest = z.infer<typeof RankingAppealResolveRequestSchema>;

export const ScoringMethodologySchema = z.object({
  statusWeights: z.record(z.string(), z.number()),
  prestigeMultipliers: z.record(z.string(), z.number()),
  timeDecayHalfLifeDays: z.number(),
  confidenceThreshold: z.number(),
  tierThresholds: z.object({
    top_25: z.number(),
    top_10: z.number(),
    top_2: z.number(),
    top_1: z.number()
  }),
  version: z.string()
});
export type ScoringMethodology = z.infer<typeof ScoringMethodologySchema>;
