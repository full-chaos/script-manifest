import { z } from "zod";

// ── Coverage Marketplace ───────────────────────────────────────────

export const CoverageProviderStatusSchema = z.enum([
  "pending_verification", "active", "suspended", "deactivated"
]);
export type CoverageProviderStatus = z.infer<typeof CoverageProviderStatusSchema>;

export const CoverageTierSchema = z.enum([
  "concept_notes", "early_draft", "polish_proofread", "competition_ready"
]);
export type CoverageTier = z.infer<typeof CoverageTierSchema>;

export const CoverageOrderStatusSchema = z.enum([
  "placed", "payment_held", "claimed", "in_progress", "delivered",
  "completed", "disputed", "cancelled", "payment_failed", "refunded", "abandoned"
]);
export type CoverageOrderStatus = z.infer<typeof CoverageOrderStatusSchema>;

export const CoverageDisputeStatusSchema = z.enum([
  "open", "under_review", "resolved_refund", "resolved_no_refund", "resolved_partial"
]);
export type CoverageDisputeStatus = z.infer<typeof CoverageDisputeStatusSchema>;

export const CoverageDisputeReasonSchema = z.enum([
  "non_delivery", "quality", "other"
]);
export type CoverageDisputeReason = z.infer<typeof CoverageDisputeReasonSchema>;

export const CoverageProviderSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().default(""),
  specialties: z.array(z.string()).default([]),
  status: CoverageProviderStatusSchema,
  stripeAccountId: z.string().nullable(),
  stripeOnboardingComplete: z.boolean(),
  avgRating: z.number().nullable(),
  totalOrdersCompleted: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CoverageProvider = z.infer<typeof CoverageProviderSchema>;

export const CoverageProviderCreateRequestSchema = z.object({
  displayName: z.string().min(1).max(200),
  bio: z.string().max(5000).default(""),
  specialties: z.array(z.string().min(1)).max(20).default([])
});
export type CoverageProviderCreateRequest = z.infer<typeof CoverageProviderCreateRequestSchema>;

export const CoverageProviderUpdateRequestSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  bio: z.string().max(5000).optional(),
  specialties: z.array(z.string().min(1)).max(20).optional()
});
export type CoverageProviderUpdateRequest = z.infer<typeof CoverageProviderUpdateRequestSchema>;

export const CoverageProviderReviewDecisionSchema = z.enum([
  "approved",
  "rejected",
  "suspended"
]);
export type CoverageProviderReviewDecision = z.infer<typeof CoverageProviderReviewDecisionSchema>;

export const CoverageProviderReviewRequestSchema = z.object({
  decision: CoverageProviderReviewDecisionSchema,
  reason: z.string().max(5000).optional(),
  checklist: z.array(z.string().min(1).max(200)).max(30).default([])
});
export type CoverageProviderReviewRequest = z.infer<typeof CoverageProviderReviewRequestSchema>;

export const CoverageProviderReviewSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  reviewedByUserId: z.string().min(1),
  decision: CoverageProviderReviewDecisionSchema,
  reason: z.string().nullable(),
  checklist: z.array(z.string()).default([]),
  createdAt: z.string()
});
export type CoverageProviderReview = z.infer<typeof CoverageProviderReviewSchema>;

export const CoverageServiceSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  tier: CoverageTierSchema,
  priceCents: z.number().int().positive(),
  currency: z.string().default("usd"),
  turnaroundDays: z.number().int().positive(),
  maxPages: z.number().int().positive(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CoverageService = z.infer<typeof CoverageServiceSchema>;

export const CoverageServiceCreateRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(""),
  tier: CoverageTierSchema,
  priceCents: z.number().int().positive(),
  currency: z.string().default("usd"),
  turnaroundDays: z.number().int().min(1).max(90),
  maxPages: z.number().int().min(1).max(500)
});
export type CoverageServiceCreateRequest = z.infer<typeof CoverageServiceCreateRequestSchema>;

export const CoverageServiceUpdateRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  priceCents: z.number().int().positive().optional(),
  turnaroundDays: z.number().int().min(1).max(90).optional(),
  maxPages: z.number().int().min(1).max(500).optional(),
  active: z.boolean().optional()
});
export type CoverageServiceUpdateRequest = z.infer<typeof CoverageServiceUpdateRequestSchema>;

export const CoverageOrderSchema = z.object({
  id: z.string().min(1),
  writerUserId: z.string().min(1),
  providerId: z.string().min(1),
  serviceId: z.string().min(1),
  scriptId: z.string().default(""),
  projectId: z.string().default(""),
  status: CoverageOrderStatusSchema,
  priceCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  providerPayoutCents: z.number().int().nonnegative(),
  stripePaymentIntentId: z.string().nullable(),
  stripeTransferId: z.string().nullable(),
  slaDeadline: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  receiptUrl: z.string().nullable(),
  paymentFailureReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CoverageOrder = z.infer<typeof CoverageOrderSchema>;

export const CoverageOrderCreateRequestSchema = z.object({
  serviceId: z.string().min(1),
  scriptId: z.string().default(""),
  projectId: z.string().default("")
});
export type CoverageOrderCreateRequest = z.infer<typeof CoverageOrderCreateRequestSchema>;

export const CoverageOrderFiltersSchema = z.object({
  status: CoverageOrderStatusSchema.optional(),
  providerId: z.string().optional(),
  writerUserId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});
export type CoverageOrderFilters = z.infer<typeof CoverageOrderFiltersSchema>;

export const TransactionHistoryItemSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  status: CoverageOrderStatusSchema,
  priceCents: z.number().int().nonnegative(),
  serviceName: z.string(),
  receiptUrl: z.string().nullable()
});
export type TransactionHistoryItem = z.infer<typeof TransactionHistoryItemSchema>;

export const CoverageDeliverySchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  summary: z.string().default(""),
  strengths: z.string().default(""),
  weaknesses: z.string().default(""),
  recommendations: z.string().default(""),
  score: z.number().int().min(1).max(100).nullable(),
  fileKey: z.string().nullable(),
  fileName: z.string().nullable(),
  createdAt: z.string()
});
export type CoverageDelivery = z.infer<typeof CoverageDeliverySchema>;

export const CoverageDeliveryCreateRequestSchema = z.object({
  summary: z.string().min(1).max(10000),
  strengths: z.string().max(10000).default(""),
  weaknesses: z.string().max(10000).default(""),
  recommendations: z.string().max(10000).default(""),
  score: z.number().int().min(1).max(100).optional(),
  fileKey: z.string().optional(),
  fileName: z.string().optional()
});
export type CoverageDeliveryCreateRequest = z.infer<typeof CoverageDeliveryCreateRequestSchema>;

export const CoverageReviewSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  writerUserId: z.string().min(1),
  providerId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().default(""),
  createdAt: z.string()
});
export type CoverageReview = z.infer<typeof CoverageReviewSchema>;

export const CoverageReviewCreateRequestSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).default("")
});
export type CoverageReviewCreateRequest = z.infer<typeof CoverageReviewCreateRequestSchema>;

export const CoverageDisputeSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  openedByUserId: z.string().min(1),
  reason: CoverageDisputeReasonSchema,
  description: z.string().default(""),
  status: CoverageDisputeStatusSchema,
  adminNotes: z.string().nullable(),
  refundAmountCents: z.number().int().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CoverageDispute = z.infer<typeof CoverageDisputeSchema>;

export const CoverageDisputeCreateRequestSchema = z.object({
  reason: CoverageDisputeReasonSchema,
  description: z.string().min(1).max(5000)
});
export type CoverageDisputeCreateRequest = z.infer<typeof CoverageDisputeCreateRequestSchema>;

export const CoverageDisputeResolveRequestSchema = z.object({
  status: z.enum(["resolved_refund", "resolved_no_refund", "resolved_partial"]),
  adminNotes: z.string().min(1).max(5000),
  refundAmountCents: z.number().int().nonnegative().optional()
});
export type CoverageDisputeResolveRequest = z.infer<typeof CoverageDisputeResolveRequestSchema>;

export const CoverageDisputeEventSchema = z.object({
  id: z.string().min(1),
  disputeId: z.string().min(1),
  actorUserId: z.string().min(1),
  eventType: z.string().min(1),
  note: z.string().nullable(),
  fromStatus: CoverageDisputeStatusSchema.nullable(),
  toStatus: CoverageDisputeStatusSchema.nullable(),
  createdAt: z.string()
});
export type CoverageDisputeEvent = z.infer<typeof CoverageDisputeEventSchema>;

export const CoverageServiceFiltersSchema = z.object({
  tier: CoverageTierSchema.optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  maxTurnaround: z.coerce.number().int().positive().optional(),
  providerId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});
export type CoverageServiceFilters = z.infer<typeof CoverageServiceFiltersSchema>;

export const CoverageProviderFiltersSchema = z.object({
  status: CoverageProviderStatusSchema.optional(),
  specialty: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});
export type CoverageProviderFilters = z.infer<typeof CoverageProviderFiltersSchema>;

export const PaymentMethodSchema = z.object({
  id: z.string(),
  brand: z.string(),
  last4: z.string(),
  expMonth: z.number(),
  expYear: z.number()
});
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
