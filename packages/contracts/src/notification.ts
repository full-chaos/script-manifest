import { z } from "zod";

export const NotificationEventTypeSchema = z.enum([
  "deadline_reminder",
  "script_access_requested",
  "script_access_approved",
  "script_downloaded",
  "program_application_decision",
  "program_application_sla_reminder",
  "program_session_reminder",
  "program_crm_sync_requested",
  "feedback_listing_claimed",
  "feedback_review_submitted",
  "feedback_dispute_opened",
  "feedback_dispute_resolved",
  "ranking_badge_awarded",
  "ranking_tier_changed",
  "ranking_appeal_resolved",
  "partner_submission_received",
  "partner_score_normalized",
  "partner_results_published",
  "partner_draft_swap_processed",
  "partner_entrant_message_sent"
]);

export type NotificationEventType = z.infer<typeof NotificationEventTypeSchema>;

export const NotificationResourceTypeSchema = z.enum([
  "competition",
  "profile",
  "project",
  "script",
  "program_application",
  "program_session",
  "program_crm_job",
  "partner_competition",
  "partner_submission",
  "partner_message",
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
  readAt: z.string().datetime({ offset: true }).nullable().optional(),
  actorUserId: z.string().min(1).optional(),
  targetUserId: z.string().min(1),
  resourceType: NotificationResourceTypeSchema,
  resourceId: z.string().min(1),
  payload: z.record(z.string(), z.unknown())
});

export type NotificationEventEnvelope = z.infer<typeof NotificationEventEnvelopeSchema>;
