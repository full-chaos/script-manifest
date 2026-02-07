import { z } from "zod";

export const WriterProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().default(""),
  genres: z.array(z.string()).default([]),
  representationStatus: z.enum(["represented", "unrepresented", "seeking_rep"])
});

export type WriterProfile = z.infer<typeof WriterProfileSchema>;

export const WriterProfileUpdateRequestSchema = z.object({
  displayName: z.string().min(1).optional(),
  bio: z.string().max(5000).optional(),
  genres: z.array(z.string().min(1)).max(20).optional(),
  representationStatus: z
    .enum(["represented", "unrepresented", "seeking_rep"])
    .optional()
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
  ownerUserId: z.string().min(1),
  title: z.string().min(1),
  logline: z.string().default(""),
  synopsis: z.string().default(""),
  format: z.string().min(1),
  genre: z.string().min(1),
  pageCount: z.number().int().nonnegative().default(0),
  isDiscoverable: z.boolean().default(false)
});

export type ProjectCreateRequest = z.infer<typeof ProjectCreateRequestSchema>;

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
  format: z.string().trim().min(1).optional()
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
  ownerUserId: z.string().min(1),
  scriptId: z.string().min(1),
  versionLabel: z.string().min(1),
  changeSummary: z.string().max(4000).default(""),
  pageCount: z.number().int().nonnegative().default(0),
  setPrimary: z.boolean().default(true)
});

export type ProjectDraftCreateRequest = z.infer<typeof ProjectDraftCreateRequestSchema>;

export const ProjectDraftUpdateRequestSchema = z.object({
  versionLabel: z.string().min(1).optional(),
  changeSummary: z.string().max(4000).optional(),
  pageCount: z.number().int().nonnegative().optional(),
  lifecycleState: DraftLifecycleStateSchema.optional()
});

export type ProjectDraftUpdateRequest = z.infer<typeof ProjectDraftUpdateRequestSchema>;

export const ProjectDraftPrimaryRequestSchema = z.object({
  ownerUserId: z.string().min(1)
});

export type ProjectDraftPrimaryRequest = z.infer<typeof ProjectDraftPrimaryRequestSchema>;

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
  displayName: z.string().min(1)
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

export const NotificationEventTypeSchema = z.enum([
  "deadline_reminder",
  "script_access_requested",
  "script_access_approved",
  "script_downloaded"
]);

export type NotificationEventType = z.infer<typeof NotificationEventTypeSchema>;

export const NotificationResourceTypeSchema = z.enum([
  "competition",
  "profile",
  "project",
  "script",
  "system"
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
  writerId: z.string().min(1),
  projectId: z.string().min(1),
  competitionId: z.string().min(1),
  status: SubmissionStatusSchema.default("pending")
});

export type SubmissionCreateRequest = z.infer<typeof SubmissionCreateRequestSchema>;

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
