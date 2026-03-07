import { z } from "zod";

// ── Account Status ───────────────────────────────────────────────

export const AccountStatusSchema = z.enum(["active", "suspended", "banned", "deleted"]);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

// ── Admin User Management ────────────────────────────────────────

export const AdminUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string(),
  role: z.string(),
  accountStatus: AccountStatusSchema,
  emailVerified: z.boolean(),
  createdAt: z.string().datetime({ offset: true })
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminUserDetailSchema = AdminUserSchema.extend({
  sessionCount: z.number().int().nonnegative(),
  reportCount: z.number().int().nonnegative()
});
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>;

export const AdminUserListRequestSchema = z.object({
  search: z.string().trim().optional(),
  role: z.string().optional(),
  status: AccountStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});
export type AdminUserListRequest = z.infer<typeof AdminUserListRequestSchema>;

export const AdminUserUpdateRequestSchema = z.object({
  role: z.string().optional(),
  accountStatus: AccountStatusSchema.optional(),
  suspensionReason: z.string().max(1000).optional(),
  suspensionDurationDays: z.number().int().positive().max(365).optional()
});
export type AdminUserUpdateRequest = z.infer<typeof AdminUserUpdateRequestSchema>;

// ── Admin Audit Log ──────────────────────────────────────────────

export const AuditLogEntrySchema = z.object({
  id: z.string().min(1),
  adminUserId: z.string().min(1),
  action: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  details: z.record(z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true })
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const AuditLogListRequestSchema = z.object({
  adminUserId: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50)
});
export type AuditLogListRequest = z.infer<typeof AuditLogListRequestSchema>;

// ── Content Moderation ───────────────────────────────────────────

export const ContentReportReasonSchema = z.enum([
  "harassment",
  "hate_speech",
  "plagiarism",
  "spam",
  "inappropriate",
  "impersonation",
  "other"
]);
export type ContentReportReason = z.infer<typeof ContentReportReasonSchema>;

export const ContentReportStatusSchema = z.enum(["pending", "reviewed", "actioned", "dismissed"]);
export type ContentReportStatus = z.infer<typeof ContentReportStatusSchema>;

export const ContentTypeSchema = z.enum(["script", "profile", "review", "feedback"]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const ContentReportCreateRequestSchema = z.object({
  contentType: ContentTypeSchema,
  contentId: z.string().min(1),
  reason: ContentReportReasonSchema,
  description: z.string().max(2000).optional()
});
export type ContentReportCreateRequest = z.infer<typeof ContentReportCreateRequestSchema>;

export const ContentReportSchema = z.object({
  id: z.string().min(1),
  reporterId: z.string().min(1),
  contentType: ContentTypeSchema,
  contentId: z.string().min(1),
  reason: ContentReportReasonSchema,
  description: z.string().nullable(),
  status: ContentReportStatusSchema,
  resolvedByUserId: z.string().nullable(),
  resolution: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});
export type ContentReport = z.infer<typeof ContentReportSchema>;

export const ModerationActionTypeSchema = z.enum([
  "warning",
  "content_removal",
  "suspension",
  "ban",
  "reactivation"
]);
export type ModerationActionType = z.infer<typeof ModerationActionTypeSchema>;

export const ModerationActionRequestSchema = z.object({
  actionType: ModerationActionTypeSchema,
  reason: z.string().min(1).max(2000),
  suspensionDurationDays: z.number().int().positive().max(365).optional()
});
export type ModerationActionRequest = z.infer<typeof ModerationActionRequestSchema>;

export const ModerationQueueRequestSchema = z.object({
  status: ContentReportStatusSchema.optional(),
  contentType: ContentTypeSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});
export type ModerationQueueRequest = z.infer<typeof ModerationQueueRequestSchema>;

// ── Platform Metrics ─────────────────────────────────────────────

export const PlatformMetricsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  activeUsers30d: z.number().int().nonnegative(),
  totalProjects: z.number().int().nonnegative(),
  openDisputes: z.number().int().nonnegative(),
  pendingAppeals: z.number().int().nonnegative(),
  pendingFlags: z.number().int().nonnegative(),
  pendingReports: z.number().int().nonnegative()
});
export type PlatformMetrics = z.infer<typeof PlatformMetricsSchema>;
