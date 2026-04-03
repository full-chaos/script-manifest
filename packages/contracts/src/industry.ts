import { z } from "zod";
import { OptionalUrlStringSchema } from "./common.js";

export const IndustryAccountVerificationStatusSchema = z.enum([
  "pending_review",
  "verified",
  "rejected",
  "suspended"
]);

export type IndustryAccountVerificationStatus = z.infer<
  typeof IndustryAccountVerificationStatusSchema
>;

export const IndustryAccountSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  companyName: z.string().min(1),
  roleTitle: z.string().min(1),
  professionalEmail: z.string().email(),
  websiteUrl: OptionalUrlStringSchema.default(""),
  linkedinUrl: OptionalUrlStringSchema.default(""),
  imdbUrl: OptionalUrlStringSchema.default(""),
  verificationStatus: IndustryAccountVerificationStatusSchema,
  verificationNotes: z.string().nullable(),
  verifiedByUserId: z.string().nullable(),
  verifiedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type IndustryAccount = z.infer<typeof IndustryAccountSchema>;

export const IndustryAccountCreateRequestSchema = z.object({
  companyName: z.string().min(1).max(240),
  roleTitle: z.string().min(1).max(240),
  professionalEmail: z.string().email(),
  websiteUrl: OptionalUrlStringSchema.default(""),
  linkedinUrl: OptionalUrlStringSchema.default(""),
  imdbUrl: OptionalUrlStringSchema.default("")
});

export type IndustryAccountCreateRequest = z.infer<typeof IndustryAccountCreateRequestSchema>;

export const IndustryAccountCreateInternalSchema = IndustryAccountCreateRequestSchema.extend({
  userId: z.string().min(1)
});

export type IndustryAccountCreateInternal = z.infer<typeof IndustryAccountCreateInternalSchema>;

export const IndustryAccountVerificationRequestSchema = z.object({
  status: z.enum(["verified", "rejected", "suspended"]),
  verificationNotes: z.string().max(2000).default("")
});

export type IndustryAccountVerificationRequest = z.infer<
  typeof IndustryAccountVerificationRequestSchema
>;

export const IndustryEntitlementAccessLevelSchema = z.enum(["none", "view", "download"]);

export type IndustryEntitlementAccessLevel = z.infer<typeof IndustryEntitlementAccessLevelSchema>;

export const IndustryEntitlementSchema = z.object({
  writerUserId: z.string().min(1),
  industryAccountId: z.string().min(1),
  accessLevel: IndustryEntitlementAccessLevelSchema,
  grantedByUserId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type IndustryEntitlement = z.infer<typeof IndustryEntitlementSchema>;

export const IndustryEntitlementUpsertRequestSchema = z.object({
  industryAccountId: z.string().min(1),
  accessLevel: IndustryEntitlementAccessLevelSchema
});

export type IndustryEntitlementUpsertRequest = z.infer<
  typeof IndustryEntitlementUpsertRequestSchema
>;

export const IndustryEntitlementCheckResponseSchema = z.object({
  writerUserId: z.string().min(1),
  industryAccountId: z.string().min(1),
  accessLevel: IndustryEntitlementAccessLevelSchema,
  canView: z.boolean(),
  canDownload: z.boolean()
});

export type IndustryEntitlementCheckResponse = z.infer<
  typeof IndustryEntitlementCheckResponseSchema
>;

export const IndustryTalentSearchFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  genre: z.string().trim().min(1).max(120).optional(),
  format: z.string().trim().min(1).max(120).optional(),
  demographics: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
  genres: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
  representationStatus: z
    .enum(["represented", "unrepresented", "seeking_rep"])
    .optional(),
  sort: z.enum(["recent", "relevance"]).default("recent").optional(),
  limit: z.number().int().positive().max(100).default(20).optional(),
  offset: z.number().int().nonnegative().default(0).optional()
});

export type IndustryTalentSearchFilters = z.infer<typeof IndustryTalentSearchFiltersSchema>;

export const IndustryTalentSearchResultSchema = z.object({
  writerId: z.string().min(1),
  displayName: z.string().min(1),
  representationStatus: z.enum(["represented", "unrepresented", "seeking_rep"]),
  genres: z.array(z.string()).default([]),
  demographics: z.array(z.string()).default([]),
  projectId: z.string().min(1),
  projectTitle: z.string().min(1),
  projectFormat: z.string().min(1),
  projectGenre: z.string().min(1),
  logline: z.string().default(""),
  synopsis: z.string().default("")
});

export type IndustryTalentSearchResult = z.infer<typeof IndustryTalentSearchResultSchema>;

export const IndustryTalentSearchResponseSchema = z.object({
  results: z.array(IndustryTalentSearchResultSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative()
});

export type IndustryTalentSearchResponse = z.infer<typeof IndustryTalentSearchResponseSchema>;

export const IndustryListSchema = z.object({
  id: z.string().min(1),
  industryAccountId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  createdByUserId: z.string().min(1),
  isShared: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type IndustryList = z.infer<typeof IndustryListSchema>;

export const IndustryListCreateRequestSchema = z.object({
  name: z.string().min(1).max(180),
  description: z.string().max(2000).default(""),
  isShared: z.boolean().default(false)
});

export type IndustryListCreateRequest = z.infer<typeof IndustryListCreateRequestSchema>;

export const IndustryListItemSchema = z.object({
  id: z.string().min(1),
  listId: z.string().min(1),
  writerUserId: z.string().min(1),
  projectId: z.string().nullable(),
  addedByUserId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true })
});

export type IndustryListItem = z.infer<typeof IndustryListItemSchema>;

export const IndustryListItemCreateRequestSchema = z.object({
  writerUserId: z.string().min(1),
  projectId: z.string().min(1).optional()
});

export type IndustryListItemCreateRequest = z.infer<typeof IndustryListItemCreateRequestSchema>;

export const IndustryNoteSchema = z.object({
  id: z.string().min(1),
  listId: z.string().min(1),
  writerUserId: z.string().nullable(),
  projectId: z.string().nullable(),
  body: z.string().min(1),
  createdByUserId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type IndustryNote = z.infer<typeof IndustryNoteSchema>;

export const IndustryNoteCreateRequestSchema = z.object({
  writerUserId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  body: z.string().min(1).max(5000)
});

export type IndustryNoteCreateRequest = z.infer<typeof IndustryNoteCreateRequestSchema>;

export const IndustryMandateStatusSchema = z.enum(["open", "closed", "expired"]);

export type IndustryMandateStatus = z.infer<typeof IndustryMandateStatusSchema>;

export const IndustryMandateTypeSchema = z.enum(["mandate", "owa"]);

export type IndustryMandateType = z.infer<typeof IndustryMandateTypeSchema>;

export const IndustryMandateSchema = z.object({
  id: z.string().min(1),
  type: IndustryMandateTypeSchema,
  title: z.string().min(1),
  description: z.string().default(""),
  format: z.string().min(1),
  genre: z.string().min(1),
  status: IndustryMandateStatusSchema,
  opensAt: z.string().datetime({ offset: true }),
  closesAt: z.string().datetime({ offset: true }),
  createdByUserId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type IndustryMandate = z.infer<typeof IndustryMandateSchema>;

export const IndustryMandateCreateRequestSchema = z.object({
  type: IndustryMandateTypeSchema.default("mandate"),
  title: z.string().min(1).max(240),
  description: z.string().max(5000).default(""),
  format: z.string().min(1).max(120),
  genre: z.string().min(1).max(120),
  opensAt: z.string().datetime({ offset: true }),
  closesAt: z.string().datetime({ offset: true })
});

export type IndustryMandateCreateRequest = z.infer<typeof IndustryMandateCreateRequestSchema>;

export const IndustryMandateFiltersSchema = z.object({
  type: IndustryMandateTypeSchema.optional(),
  status: IndustryMandateStatusSchema.optional(),
  format: z.string().trim().min(1).optional(),
  genre: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(100).default(20).optional(),
  offset: z.number().int().nonnegative().default(0).optional()
});

export type IndustryMandateFilters = z.infer<typeof IndustryMandateFiltersSchema>;

export const IndustryMandateSubmissionStatusSchema = z.enum([
  "submitted",
  "under_review",
  "forwarded",
  "rejected"
]);

export type IndustryMandateSubmissionStatus = z.infer<typeof IndustryMandateSubmissionStatusSchema>;

export const IndustryMandateSubmissionSchema = z.object({
  id: z.string().min(1),
  mandateId: z.string().min(1),
  writerUserId: z.string().min(1),
  projectId: z.string().min(1),
  fitExplanation: z.string().default(""),
  status: IndustryMandateSubmissionStatusSchema,
  editorialNotes: z.string().default(""),
  reviewedByUserId: z.string().nullable(),
  reviewedAt: z.string().datetime({ offset: true }).nullable(),
  forwardedTo: z.string().default(""),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type IndustryMandateSubmission = z.infer<typeof IndustryMandateSubmissionSchema>;

export const IndustryMandateSubmissionCreateRequestSchema = z.object({
  projectId: z.string().min(1),
  fitExplanation: z.string().max(3000).default("")
});

export type IndustryMandateSubmissionCreateRequest = z.infer<
  typeof IndustryMandateSubmissionCreateRequestSchema
>;

export const IndustryMandateSubmissionReviewRequestSchema = z.object({
  status: z.enum(["under_review", "forwarded", "rejected"]),
  editorialNotes: z.string().max(5000).default(""),
  forwardedTo: z.string().max(240).default("")
});

export type IndustryMandateSubmissionReviewRequest = z.infer<
  typeof IndustryMandateSubmissionReviewRequestSchema
>;

export const IndustryTeamRoleSchema = z.enum(["owner", "editor", "viewer"]);

export type IndustryTeamRole = z.infer<typeof IndustryTeamRoleSchema>;

export const IndustryTeamSchema = z.object({
  id: z.string().min(1),
  industryAccountId: z.string().min(1),
  name: z.string().min(1),
  createdByUserId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type IndustryTeam = z.infer<typeof IndustryTeamSchema>;

export const IndustryTeamMemberSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
  role: IndustryTeamRoleSchema,
  createdAt: z.string().datetime({ offset: true })
});

export type IndustryTeamMember = z.infer<typeof IndustryTeamMemberSchema>;

export const IndustryTeamCreateRequestSchema = z.object({
  name: z.string().min(1).max(180)
});

export type IndustryTeamCreateRequest = z.infer<typeof IndustryTeamCreateRequestSchema>;

export const IndustryTeamMemberUpsertRequestSchema = z.object({
  userId: z.string().min(1),
  role: IndustryTeamRoleSchema
});

export type IndustryTeamMemberUpsertRequest = z.infer<
  typeof IndustryTeamMemberUpsertRequestSchema
>;

export const IndustryListShareTeamRequestSchema = z.object({
  teamId: z.string().min(1),
  permission: z.enum(["view", "edit"]).default("view")
});

export type IndustryListShareTeamRequest = z.infer<typeof IndustryListShareTeamRequestSchema>;

export const IndustryActivitySchema = z.object({
  id: z.string().min(1),
  industryAccountId: z.string().min(1),
  actorUserId: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  action: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime({ offset: true })
});

export type IndustryActivity = z.infer<typeof IndustryActivitySchema>;

export const IndustryDigestRecommendationSchema = z.object({
  writerId: z.string().min(1),
  projectId: z.string().min(1),
  reason: z.string().max(1000).default(""),
  source: z.enum(["algorithm", "override"]).default("algorithm")
});

export type IndustryDigestRecommendation = z.infer<typeof IndustryDigestRecommendationSchema>;

export const IndustryWeeklyDigestRunRequestSchema = z.object({
  limit: z.number().int().positive().max(100).default(10),
  overrideWriterIds: z.array(z.string().min(1)).max(50).default([]),
  notes: z.string().max(5000).default("")
});

export type IndustryWeeklyDigestRunRequest = z.infer<typeof IndustryWeeklyDigestRunRequestSchema>;

export const IndustryDigestRunSchema = z.object({
  id: z.string().min(1),
  industryAccountId: z.string().min(1),
  generatedByUserId: z.string().min(1),
  windowStart: z.string().datetime({ offset: true }),
  windowEnd: z.string().datetime({ offset: true }),
  candidateCount: z.number().int().nonnegative(),
  recommendations: z.array(IndustryDigestRecommendationSchema),
  overrideWriterIds: z.array(z.string()),
  notes: z.string().default(""),
  createdAt: z.string().datetime({ offset: true })
});

export type IndustryDigestRun = z.infer<typeof IndustryDigestRunSchema>;

export const IndustryAnalyticsSummarySchema = z.object({
  downloadsTotal: z.number().int().nonnegative(),
  uniqueWritersDownloaded: z.number().int().nonnegative(),
  listsTotal: z.number().int().nonnegative(),
  notesTotal: z.number().int().nonnegative(),
  mandatesOpen: z.number().int().nonnegative(),
  submissionsForwarded: z.number().int().nonnegative(),
  digestsGenerated: z.number().int().nonnegative()
});

export type IndustryAnalyticsSummary = z.infer<typeof IndustryAnalyticsSummarySchema>;
