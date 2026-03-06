import { z } from "zod";

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
