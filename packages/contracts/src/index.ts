import { z } from "zod";

export const WriterProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().default(""),
  genres: z.array(z.string()).default([]),
  representationStatus: z.enum(["represented", "unrepresented", "seeking_rep"])
});

export type WriterProfile = z.infer<typeof WriterProfileSchema>;

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
