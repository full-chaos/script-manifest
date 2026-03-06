import { z } from "zod";

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
