import { z } from "zod";
import { OptionalUrlStringSchema } from "./common.js";
import { PlacementListItemSchema } from "./submission.js";
import { ProjectSchema } from "./project.js";

export const ResumeProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().default(""),
  headshotUrl: OptionalUrlStringSchema.default(""),
  customProfileUrl: z.string().default(""),
  representationStatus: z.enum(["represented", "unrepresented", "seeking_rep"]),
  genres: z.array(z.string()).default([]),
  resumePublic: z.boolean().optional()
});

export const ResumeBadgeSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1),
  placementId: z.string().min(1).optional(),
  competitionId: z.string().min(1).optional(),
  awardedAt: z.string().optional()
});

export const ResumeRankingSchema = z.object({
  totalScore: z.number().default(0),
  rank: z.number().int().nonnegative().default(0),
  tier: z.string().default("unranked"),
  scoreChange30d: z.number().default(0)
});

export const HostedScriptSchema = z.object({
  scriptId: z.string().min(1),
  ownerUserId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  registeredAt: z.string(),
  viewerPath: z.string().min(1),
  viewerUrl: z.string().min(1).optional()
});

export const ResumeProofMetricsSchema = z.object({
  totalViews7d: z.number().int().nonnegative(),
  totalViews30d: z.number().int().nonnegative(),
  totalScriptDownloads: z.number().int().nonnegative(),
  verifiedPlacementsCount: z.number().int().nonnegative(),
  projectsCount: z.number().int().nonnegative()
});

export const WriterResumeSchema = z.object({
  profile: ResumeProfileSchema,
  projects: z.array(ProjectSchema),
  placements: z.array(PlacementListItemSchema),
  badges: z.array(ResumeBadgeSchema),
  ranking: ResumeRankingSchema,
  hostedScripts: z.array(HostedScriptSchema),
  proofMetrics: ResumeProofMetricsSchema
});

export type WriterResume = z.infer<typeof WriterResumeSchema>;

export const ResumeMetricsResponseSchema = ResumeProofMetricsSchema.extend({
  writerId: z.string().min(1)
});

export type ResumeMetricsResponse = z.infer<typeof ResumeMetricsResponseSchema>;

export const ResumePageViewCreateRequestSchema = z.object({
  viewerUserId: z.string().min(1).optional(),
  referrer: z.string().max(2048).optional(),
  userAgentHash: z.string().min(1),
  ipHash: z.string().min(1),
  viewedAt: z.string().datetime({ offset: true }).optional()
});

export type ResumePageViewCreateRequest = z.infer<typeof ResumePageViewCreateRequestSchema>;

export const ScriptViewEventCreateRequestSchema = z.object({
  viewerUserId: z.string().min(1).optional(),
  eventType: z.enum(["view", "download"]),
  occurredAt: z.string().datetime({ offset: true }).optional()
});

export type ScriptViewEventCreateRequest = z.infer<typeof ScriptViewEventCreateRequestSchema>;
