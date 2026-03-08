import { z } from "zod";

// ── Notification Template ───────────────────────────────────────────

export const NotificationTemplateCategorySchema = z.enum([
  "system_maintenance",
  "new_feature",
  "policy_update",
  "general"
]);
export type NotificationTemplateCategory = z.infer<typeof NotificationTemplateCategorySchema>;

export const NotificationTemplateStatusSchema = z.enum(["draft", "active", "archived"]);
export type NotificationTemplateStatus = z.infer<typeof NotificationTemplateStatusSchema>;

export const NotificationTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  subject: z.string().min(1),
  bodyTemplate: z.string().min(1),
  category: NotificationTemplateCategorySchema,
  createdBy: z.string().min(1),
  status: NotificationTemplateStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});
export type NotificationTemplate = z.infer<typeof NotificationTemplateSchema>;

export const CreateNotificationTemplateRequestSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  bodyTemplate: z.string().min(1).max(10000),
  category: NotificationTemplateCategorySchema.default("general")
});
export type CreateNotificationTemplateRequest = z.infer<typeof CreateNotificationTemplateRequestSchema>;

// ── Broadcast ───────────────────────────────────────────────────────

export const BroadcastStatusSchema = z.enum(["pending", "sending", "sent", "failed"]);
export type BroadcastStatus = z.infer<typeof BroadcastStatusSchema>;

export const NotificationBroadcastSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().nullable(),
  subject: z.string().min(1),
  body: z.string().min(1),
  audience: z.string().min(1),
  sentBy: z.string().min(1),
  recipientCount: z.number().int().nonnegative(),
  status: BroadcastStatusSchema,
  sentAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true })
});
export type NotificationBroadcast = z.infer<typeof NotificationBroadcastSchema>;

export const SendBroadcastRequestSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10000),
  audience: z.string().min(1).max(200).default("all"), // all, role:admin, user:<id>
  templateId: z.string().optional()
});
export type SendBroadcastRequest = z.infer<typeof SendBroadcastRequestSchema>;

export const SendDirectNotificationRequestSchema = z.object({
  userId: z.string().min(1),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10000)
});
export type SendDirectNotificationRequest = z.infer<typeof SendDirectNotificationRequestSchema>;

export const NotificationHistoryRequestSchema = z.object({
  status: BroadcastStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});
export type NotificationHistoryRequest = z.infer<typeof NotificationHistoryRequestSchema>;
