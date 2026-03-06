import { z } from "zod";

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
