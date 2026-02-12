import { z } from "zod";

const OptionalUrlStringSchema = z.union([z.literal(""), z.string().url().max(2048)]);

export const WriterProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().default(""),
  genres: z.array(z.string()).default([]),
  demographics: z.array(z.string()).default([]),
  representationStatus: z.enum(["represented", "unrepresented", "seeking_rep"]),
  headshotUrl: OptionalUrlStringSchema.default(""),
  customProfileUrl: OptionalUrlStringSchema.default(""),
  isSearchable: z.boolean().default(true)
});

export type WriterProfile = z.infer<typeof WriterProfileSchema>;

export const WriterProfileUpdateRequestSchema = z.object({
  displayName: z.string().min(1).optional(),
  bio: z.string().max(5000).optional(),
  genres: z.array(z.string().min(1)).max(20).optional(),
  demographics: z.array(z.string().min(1)).max(20).optional(),
  representationStatus: z
    .enum(["represented", "unrepresented", "seeking_rep"])
    .optional(),
  headshotUrl: OptionalUrlStringSchema.optional(),
  customProfileUrl: OptionalUrlStringSchema.optional(),
  isSearchable: z.boolean().optional()
});

export type WriterProfileUpdateRequest = z.infer<typeof WriterProfileUpdateRequestSchema>;

export const ProjectSchema = z.object({
  id: z.string().min(1),
  ownerUserId: z.string().min(1),
  title: z.string().min(1),
  logline: z.string().default(""),
  synopsis: z.string().default(""),
  format: z.string().min(1),
  genre: z.string().min(1),
  pageCount: z.number().int().nonnegative().default(0),
  isDiscoverable: z.boolean().default(false),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type Project = z.infer<typeof ProjectSchema>;

export const ProjectCreateRequestSchema = z.object({
  title: z.string().min(1),
  logline: z.string().default(""),
  synopsis: z.string().default(""),
  format: z.string().min(1),
  genre: z.string().min(1),
  pageCount: z.number().int().nonnegative().default(0),
  isDiscoverable: z.boolean().default(false)
});

export type ProjectCreateRequest = z.infer<typeof ProjectCreateRequestSchema>;

export const ProjectCreateInternalSchema = ProjectCreateRequestSchema.extend({
  ownerUserId: z.string().min(1)
});

export type ProjectCreateInternal = z.infer<typeof ProjectCreateInternalSchema>;

export const ProjectUpdateRequestSchema = z.object({
  title: z.string().min(1).optional(),
  logline: z.string().optional(),
  synopsis: z.string().optional(),
  format: z.string().min(1).optional(),
  genre: z.string().min(1).optional(),
  pageCount: z.number().int().nonnegative().optional(),
  isDiscoverable: z.boolean().optional()
});

export type ProjectUpdateRequest = z.infer<typeof ProjectUpdateRequestSchema>;

export const ProjectFiltersSchema = z.object({
  ownerUserId: z.string().trim().min(1).optional(),
  genre: z.string().trim().min(1).optional(),
  format: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(100).default(30).optional(),
  offset: z.number().int().nonnegative().default(0).optional()
});

export type ProjectFilters = z.infer<typeof ProjectFiltersSchema>;

export const ProjectCoWriterSchema = z.object({
  projectId: z.string().min(1),
  ownerUserId: z.string().min(1),
  coWriterUserId: z.string().min(1),
  creditOrder: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true })
});

export type ProjectCoWriter = z.infer<typeof ProjectCoWriterSchema>;

export const ProjectCoWriterCreateRequestSchema = z.object({
  coWriterUserId: z.string().min(1),
  creditOrder: z.number().int().positive().default(1)
});

export type ProjectCoWriterCreateRequest = z.infer<typeof ProjectCoWriterCreateRequestSchema>;

export const DraftLifecycleStateSchema = z.enum(["active", "archived"]);

export type DraftLifecycleState = z.infer<typeof DraftLifecycleStateSchema>;

export const ProjectDraftSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  ownerUserId: z.string().min(1),
  scriptId: z.string().min(1),
  versionLabel: z.string().min(1),
  changeSummary: z.string().default(""),
  pageCount: z.number().int().nonnegative().default(0),
  lifecycleState: DraftLifecycleStateSchema,
  isPrimary: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type ProjectDraft = z.infer<typeof ProjectDraftSchema>;

export const ProjectDraftCreateRequestSchema = z.object({
  scriptId: z.string().min(1),
  versionLabel: z.string().min(1),
  changeSummary: z.string().max(4000).default(""),
  pageCount: z.number().int().nonnegative().default(0),
  setPrimary: z.boolean().default(true)
});

export type ProjectDraftCreateRequest = z.infer<typeof ProjectDraftCreateRequestSchema>;

export const ProjectDraftCreateInternalSchema = ProjectDraftCreateRequestSchema.extend({
  ownerUserId: z.string().min(1)
});

export type ProjectDraftCreateInternal = z.infer<typeof ProjectDraftCreateInternalSchema>;

export const ProjectDraftUpdateRequestSchema = z.object({
  versionLabel: z.string().min(1).optional(),
  changeSummary: z.string().max(4000).optional(),
  pageCount: z.number().int().nonnegative().optional(),
  lifecycleState: DraftLifecycleStateSchema.optional()
});

export type ProjectDraftUpdateRequest = z.infer<typeof ProjectDraftUpdateRequestSchema>;

export const ProjectDraftPrimaryRequestSchema = z.object({});

export type ProjectDraftPrimaryRequest = z.infer<typeof ProjectDraftPrimaryRequestSchema>;

export const ProjectDraftPrimaryInternalSchema = ProjectDraftPrimaryRequestSchema.extend({
  ownerUserId: z.string().min(1)
});

export type ProjectDraftPrimaryInternal = z.infer<typeof ProjectDraftPrimaryInternalSchema>;

export const AuthRegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120)
});

export type AuthRegisterRequest = z.infer<typeof AuthRegisterRequestSchema>;

export const AuthLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200)
});

export type AuthLoginRequest = z.infer<typeof AuthLoginRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: z.string().default("writer").optional()
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthSessionResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  user: AuthUserSchema
});

export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const AuthMeResponseSchema = z.object({
  user: AuthUserSchema,
  expiresAt: z.string().datetime({ offset: true })
});

export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

export const OAuthProviderSchema = z.enum(["google"]);

export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;

export const OAuthStartRequestSchema = z.object({
  redirectUri: OptionalUrlStringSchema.default(""),
  loginHint: z.string().trim().min(1).max(120).optional()
});

export type OAuthStartRequest = z.infer<typeof OAuthStartRequestSchema>;

export const OAuthStartResponseSchema = z.object({
  provider: OAuthProviderSchema,
  state: z.string().min(16),
  callbackUrl: z.string().url(),
  authorizationUrl: z.string().url(),
  mockCode: z.string().min(16).optional(),
  codeChallenge: z.string().min(1).optional(),
  expiresAt: z.string().datetime({ offset: true })
});

export type OAuthStartResponse = z.infer<typeof OAuthStartResponseSchema>;

export const OAuthCompleteRequestSchema = z.object({
  state: z.string().min(16),
  code: z.string().min(16)
});

export type OAuthCompleteRequest = z.infer<typeof OAuthCompleteRequestSchema>;

export const NotificationEventTypeSchema = z.enum([
  "deadline_reminder",
  "script_access_requested",
  "script_access_approved",
  "script_downloaded",
  "feedback_listing_claimed",
  "feedback_review_submitted",
  "feedback_dispute_opened",
  "feedback_dispute_resolved",
  "ranking_badge_awarded",
  "ranking_tier_changed",
  "ranking_appeal_resolved"
]);

export type NotificationEventType = z.infer<typeof NotificationEventTypeSchema>;

export const NotificationResourceTypeSchema = z.enum([
  "competition",
  "profile",
  "project",
  "script",
  "system",
  "feedback_listing",
  "feedback_review",
  "feedback_dispute",
  "ranking_badge",
  "ranking_appeal"
]);

export type NotificationResourceType = z.infer<typeof NotificationResourceTypeSchema>;

export const NotificationEventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  eventType: NotificationEventTypeSchema,
  occurredAt: z.string().datetime({ offset: true }),
  actorUserId: z.string().min(1).optional(),
  targetUserId: z.string().min(1),
  resourceType: NotificationResourceTypeSchema,
  resourceId: z.string().min(1),
  payload: z.record(z.string(), z.unknown())
});

export type NotificationEventEnvelope = z.infer<typeof NotificationEventEnvelopeSchema>;

export const CompetitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  format: z.string().min(1),
  genre: z.string().min(1),
  feeUsd: z.number().nonnegative().default(0),
  deadline: z.string().datetime({ offset: true })
});

export type Competition = z.infer<typeof CompetitionSchema>;

export const CompetitionUpsertRequestSchema = CompetitionSchema;

export const CompetitionFiltersSchema = z.object({
  query: z.string().trim().min(1).optional(),
  format: z.string().trim().min(1).optional(),
  genre: z.string().trim().min(1).optional(),
  maxFeeUsd: z.coerce.number().nonnegative().optional(),
  deadlineBefore: z.coerce.date().optional()
});

export type CompetitionFilters = z.infer<typeof CompetitionFiltersSchema>;

export const CompetitionIndexDocumentSchema = CompetitionSchema;
export const CompetitionIndexBulkRequestSchema = z.array(CompetitionIndexDocumentSchema);

export const ScriptVisibilitySchema = z.enum(["private", "approved_only", "public"]);

export type ScriptVisibility = z.infer<typeof ScriptVisibilitySchema>;

export const ScriptUploadSessionRequestSchema = z.object({
  scriptId: z.string().min(1),
  ownerUserId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.coerce.number().int().nonnegative()
});

export type ScriptUploadSessionRequest = z.infer<typeof ScriptUploadSessionRequestSchema>;

export const ScriptUploadSessionResponseSchema = z.object({
  uploadUrl: z.string().url(),
  uploadFields: z.record(z.string(), z.string()),
  bucket: z.string().min(1),
  objectKey: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true })
});

export type ScriptUploadSessionResponse = z.infer<typeof ScriptUploadSessionResponseSchema>;

export const ScriptFileRegistrationSchema = z.object({
  scriptId: z.string().min(1),
  ownerUserId: z.string().min(1),
  objectKey: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.coerce.number().int().nonnegative(),
  registeredAt: z.string().datetime({ offset: true })
});

export type ScriptFileRegistration = z.infer<typeof ScriptFileRegistrationSchema>;

export const ScriptRegisterRequestSchema = ScriptFileRegistrationSchema.omit({
  registeredAt: true
});

export type ScriptRegisterRequest = z.infer<typeof ScriptRegisterRequestSchema>;

export const ScriptRegisterResponseSchema = z.object({
  registered: z.literal(true),
  script: ScriptFileRegistrationSchema
});

export type ScriptRegisterResponse = z.infer<typeof ScriptRegisterResponseSchema>;

export const ScriptViewRequestSchema = z.object({
  scriptId: z.string().min(1),
  viewerUserId: z.string().min(1).optional()
});

export type ScriptViewRequest = z.infer<typeof ScriptViewRequestSchema>;

export const ScriptViewAccessSchema = z.object({
  canView: z.boolean(),
  isOwner: z.boolean(),
  requiresRequest: z.boolean()
});

export type ScriptViewAccess = z.infer<typeof ScriptViewAccessSchema>;

export const ScriptViewResponseSchema = z.object({
  scriptId: z.string().min(1),
  bucket: z.string().min(1),
  objectKey: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  viewerUrl: z.string().url(),
  viewerPath: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  access: ScriptViewAccessSchema
});

export type ScriptViewResponse = z.infer<typeof ScriptViewResponseSchema>;

export const ScriptAccessRequestStatusSchema = z.enum(["pending", "approved", "rejected"]);

export type ScriptAccessRequestStatus = z.infer<typeof ScriptAccessRequestStatusSchema>;

export const ScriptAccessRequestSchema = z.object({
  id: z.string().min(1),
  scriptId: z.string().min(1),
  requesterUserId: z.string().min(1),
  ownerUserId: z.string().min(1),
  status: ScriptAccessRequestStatusSchema,
  reason: z.string().default(""),
  decisionReason: z.string().nullable(),
  decidedByUserId: z.string().nullable(),
  requestedAt: z.string().datetime({ offset: true }),
  decidedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type ScriptAccessRequest = z.infer<typeof ScriptAccessRequestSchema>;

export const ScriptAccessRequestCreateRequestSchema = z.object({
  requesterUserId: z.string().min(1),
  ownerUserId: z.string().min(1),
  reason: z.string().max(500).optional()
});

export type ScriptAccessRequestCreateRequest = z.infer<
  typeof ScriptAccessRequestCreateRequestSchema
>;

export const ScriptAccessRequestFiltersSchema = z.object({
  requesterUserId: z.string().trim().min(1).optional(),
  ownerUserId: z.string().trim().min(1).optional(),
  status: ScriptAccessRequestStatusSchema.optional()
});

export type ScriptAccessRequestFilters = z.infer<typeof ScriptAccessRequestFiltersSchema>;

export const ScriptAccessRequestDecisionRequestSchema = z.object({
  decisionReason: z.string().max(500).optional()
});

export type ScriptAccessRequestDecisionRequest = z.infer<
  typeof ScriptAccessRequestDecisionRequestSchema
>;

export const SubmissionStatusSchema = z.enum([
  "pending",
  "quarterfinalist",
  "semifinalist",
  "finalist",
  "winner"
]);

export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

export const SubmissionSchema = z.object({
  id: z.string().min(1),
  writerId: z.string().min(1),
  projectId: z.string().min(1),
  competitionId: z.string().min(1),
  status: SubmissionStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type Submission = z.infer<typeof SubmissionSchema>;

export const SubmissionCreateRequestSchema = z.object({
  projectId: z.string().min(1),
  competitionId: z.string().min(1),
  status: SubmissionStatusSchema.default("pending")
});

export type SubmissionCreateRequest = z.infer<typeof SubmissionCreateRequestSchema>;

export const SubmissionCreateInternalSchema = SubmissionCreateRequestSchema.extend({
  writerId: z.string().min(1)
});

export type SubmissionCreateInternal = z.infer<typeof SubmissionCreateInternalSchema>;

export const SubmissionFiltersSchema = z.object({
  writerId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  competitionId: z.string().trim().min(1).optional(),
  status: SubmissionStatusSchema.optional()
});

export type SubmissionFilters = z.infer<typeof SubmissionFiltersSchema>;

export const SubmissionProjectReassignmentRequestSchema = z.object({
  projectId: z.string().min(1)
});

export type SubmissionProjectReassignmentRequest = z.infer<
  typeof SubmissionProjectReassignmentRequestSchema
>;

export const PlacementVerificationStateSchema = z.enum(["pending", "verified", "rejected"]);

export type PlacementVerificationState = z.infer<typeof PlacementVerificationStateSchema>;

export const PlacementSchema = z.object({
  id: z.string().min(1),
  submissionId: z.string().min(1),
  status: SubmissionStatusSchema,
  verificationState: PlacementVerificationStateSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  verifiedAt: z.string().datetime({ offset: true }).nullable()
});

export type Placement = z.infer<typeof PlacementSchema>;

export const PlacementCreateRequestSchema = z.object({
  status: SubmissionStatusSchema
});

export type PlacementCreateRequest = z.infer<typeof PlacementCreateRequestSchema>;

export const PlacementVerificationUpdateRequestSchema = z.object({
  verificationState: PlacementVerificationStateSchema
});

export type PlacementVerificationUpdateRequest = z.infer<
  typeof PlacementVerificationUpdateRequestSchema
>;

export const PlacementListItemSchema = PlacementSchema.extend({
  writerId: z.string().min(1),
  projectId: z.string().min(1),
  competitionId: z.string().min(1)
});

export type PlacementListItem = z.infer<typeof PlacementListItemSchema>;

export const PlacementFiltersSchema = z.object({
  submissionId: z.string().trim().min(1).optional(),
  writerId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  competitionId: z.string().trim().min(1).optional(),
  status: SubmissionStatusSchema.optional(),
  verificationState: PlacementVerificationStateSchema.optional()
});

export type PlacementFilters = z.infer<typeof PlacementFiltersSchema>;

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

// ── Feedback Exchange ──────────────────────────────────────────────────

export const TokenTransactionReasonSchema = z.enum([
  "signup_grant",
  "listing_fee",
  "review_reward",
  "dispute_refund",
  "strike_penalty",
  "manual_adjustment"
]);

export type TokenTransactionReason = z.infer<typeof TokenTransactionReasonSchema>;

export const TokenTransactionSchema = z.object({
  id: z.string().min(1),
  idempotencyKey: z.string().min(1),
  debitUserId: z.string().min(1),
  creditUserId: z.string().min(1),
  amount: z.number().int().positive(),
  reason: TokenTransactionReasonSchema,
  referenceType: z.string().default(""),
  referenceId: z.string().default(""),
  createdAt: z.string().datetime({ offset: true })
});

export type TokenTransaction = z.infer<typeof TokenTransactionSchema>;

export const TokenBalanceResponseSchema = z.object({
  userId: z.string().min(1),
  balance: z.number().int()
});

export type TokenBalanceResponse = z.infer<typeof TokenBalanceResponseSchema>;

export const FeedbackListingStatusSchema = z.enum([
  "open",
  "claimed",
  "completed",
  "expired",
  "cancelled"
]);

export type FeedbackListingStatus = z.infer<typeof FeedbackListingStatusSchema>;

export const FeedbackListingSchema = z.object({
  id: z.string().min(1),
  ownerUserId: z.string().min(1),
  projectId: z.string().min(1),
  scriptId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  genre: z.string().min(1),
  format: z.string().min(1),
  pageCount: z.number().int().nonnegative().default(0),
  status: FeedbackListingStatusSchema,
  claimedByUserId: z.string().nullable().default(null),
  reviewDeadline: z.string().datetime({ offset: true }).nullable().default(null),
  expiresAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type FeedbackListing = z.infer<typeof FeedbackListingSchema>;

export const FeedbackListingCreateRequestSchema = z.object({
  projectId: z.string().min(1),
  scriptId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  genre: z.string().min(1),
  format: z.string().min(1),
  pageCount: z.number().int().nonnegative().default(0)
});

export type FeedbackListingCreateRequest = z.infer<typeof FeedbackListingCreateRequestSchema>;

export const FeedbackListingFiltersSchema = z.object({
  status: FeedbackListingStatusSchema.optional(),
  genre: z.string().trim().min(1).optional(),
  format: z.string().trim().min(1).optional(),
  ownerUserId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(30).optional(),
  offset: z.coerce.number().int().nonnegative().default(0).optional()
});

export type FeedbackListingFilters = z.infer<typeof FeedbackListingFiltersSchema>;

export const RubricCategorySchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().min(1).max(2000)
});

export type RubricCategory = z.infer<typeof RubricCategorySchema>;

export const FeedbackRubricSchema = z.object({
  storyStructure: RubricCategorySchema,
  characters: RubricCategorySchema,
  dialogue: RubricCategorySchema,
  craftVoice: RubricCategorySchema
});

export type FeedbackRubric = z.infer<typeof FeedbackRubricSchema>;

export const FeedbackReviewStatusSchema = z.enum([
  "in_progress",
  "submitted",
  "accepted"
]);

export type FeedbackReviewStatus = z.infer<typeof FeedbackReviewStatusSchema>;

export const FeedbackReviewSchema = z.object({
  id: z.string().min(1),
  listingId: z.string().min(1),
  reviewerUserId: z.string().min(1),
  scoreStoryStructure: z.number().int().min(1).max(5).nullable().default(null),
  commentStoryStructure: z.string().nullable().default(null),
  scoreCharacters: z.number().int().min(1).max(5).nullable().default(null),
  commentCharacters: z.string().nullable().default(null),
  scoreDialogue: z.number().int().min(1).max(5).nullable().default(null),
  commentDialogue: z.string().nullable().default(null),
  scoreCraftVoice: z.number().int().min(1).max(5).nullable().default(null),
  commentCraftVoice: z.string().nullable().default(null),
  overallComment: z.string().nullable().default(null),
  status: FeedbackReviewStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type FeedbackReview = z.infer<typeof FeedbackReviewSchema>;

export const FeedbackReviewSubmitRequestSchema = z.object({
  rubric: FeedbackRubricSchema,
  overallComment: z.string().max(5000).default("")
});

export type FeedbackReviewSubmitRequest = z.infer<typeof FeedbackReviewSubmitRequestSchema>;

export const ReviewerRatingSchema = z.object({
  id: z.string().min(1),
  reviewId: z.string().min(1),
  raterUserId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  comment: z.string().default(""),
  createdAt: z.string().datetime({ offset: true })
});

export type ReviewerRating = z.infer<typeof ReviewerRatingSchema>;

export const ReviewerRatingCreateRequestSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).default("")
});

export type ReviewerRatingCreateRequest = z.infer<typeof ReviewerRatingCreateRequestSchema>;

export const ReviewerReputationSchema = z.object({
  userId: z.string().min(1),
  averageRating: z.number().nullable(),
  totalReviews: z.number().int().nonnegative(),
  activeStrikes: z.number().int().nonnegative(),
  isSuspended: z.boolean()
});

export type ReviewerReputation = z.infer<typeof ReviewerReputationSchema>;

export const FeedbackDisputeStatusSchema = z.enum([
  "open",
  "under_review",
  "resolved_for_filer",
  "resolved_for_reviewer",
  "dismissed"
]);

export type FeedbackDisputeStatus = z.infer<typeof FeedbackDisputeStatusSchema>;

export const FeedbackDisputeSchema = z.object({
  id: z.string().min(1),
  reviewId: z.string().min(1),
  filedByUserId: z.string().min(1),
  reason: z.string().min(1),
  status: FeedbackDisputeStatusSchema,
  resolutionNote: z.string().nullable().default(null),
  resolvedByUserId: z.string().nullable().default(null),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type FeedbackDispute = z.infer<typeof FeedbackDisputeSchema>;

export const FeedbackDisputeCreateRequestSchema = z.object({
  reason: z.string().min(1).max(2000)
});

export type FeedbackDisputeCreateRequest = z.infer<typeof FeedbackDisputeCreateRequestSchema>;

export const FeedbackDisputeResolveRequestSchema = z.object({
  status: z.enum(["resolved_for_filer", "resolved_for_reviewer", "dismissed"]),
  resolutionNote: z.string().max(2000).default("")
});

export type FeedbackDisputeResolveRequest = z.infer<typeof FeedbackDisputeResolveRequestSchema>;
