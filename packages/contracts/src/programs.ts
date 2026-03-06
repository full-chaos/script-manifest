import { z } from "zod";

export const ProgramStatusSchema = z.enum(["draft", "open", "closed", "archived"]);

export type ProgramStatus = z.infer<typeof ProgramStatusSchema>;

export const ProgramSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  status: ProgramStatusSchema,
  applicationOpensAt: z.string().datetime({ offset: true }),
  applicationClosesAt: z.string().datetime({ offset: true }),
  createdByUserId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type Program = z.infer<typeof ProgramSchema>;

export const ProgramApplicationStatusSchema = z.enum([
  "submitted",
  "under_review",
  "accepted",
  "waitlisted",
  "rejected"
]);

export type ProgramApplicationStatus = z.infer<typeof ProgramApplicationStatusSchema>;

export const ProgramApplicationSchema = z.object({
  id: z.string().min(1),
  programId: z.string().min(1),
  userId: z.string().min(1),
  statement: z.string().default(""),
  sampleProjectId: z.string().nullable(),
  status: ProgramApplicationStatusSchema,
  score: z.number().min(0).max(100).nullable(),
  decisionNotes: z.string().nullable(),
  reviewedByUserId: z.string().nullable(),
  reviewedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type ProgramApplication = z.infer<typeof ProgramApplicationSchema>;

export const ProgramApplicationCreateRequestSchema = z.object({
  statement: z.string().min(1).max(5000),
  sampleProjectId: z.string().min(1).optional()
});

export type ProgramApplicationCreateRequest = z.infer<
  typeof ProgramApplicationCreateRequestSchema
>;

export const ProgramApplicationReviewRequestSchema = z.object({
  status: z.enum(["under_review", "accepted", "waitlisted", "rejected"]),
  score: z.number().min(0).max(100).optional(),
  decisionNotes: z.string().max(5000).default("")
});

export type ProgramApplicationReviewRequest = z.infer<
  typeof ProgramApplicationReviewRequestSchema
>;

export const ProgramCohortSchema = z.object({
  id: z.string().min(1),
  programId: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().default(""),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().positive().nullable(),
  createdByUserId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type ProgramCohort = z.infer<typeof ProgramCohortSchema>;

export const ProgramCohortCreateRequestSchema = z.object({
  name: z.string().min(1).max(200),
  summary: z.string().max(5000).default(""),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().positive().optional(),
  memberApplicationIds: z.array(z.string().min(1)).max(500).default([])
});

export type ProgramCohortCreateRequest = z.infer<typeof ProgramCohortCreateRequestSchema>;

export const ProgramSessionTypeSchema = z.enum([
  "workshop",
  "mentorship",
  "lab",
  "event",
  "office_hours"
]);

export type ProgramSessionType = z.infer<typeof ProgramSessionTypeSchema>;

export const ProgramSessionSchema = z.object({
  id: z.string().min(1),
  programId: z.string().min(1),
  cohortId: z.string().nullable(),
  title: z.string().min(1),
  description: z.string().default(""),
  sessionType: ProgramSessionTypeSchema,
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  provider: z.string().default(""),
  meetingUrl: z.string().url().max(2048).nullable(),
  createdByUserId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type ProgramSession = z.infer<typeof ProgramSessionSchema>;

export const ProgramSessionCreateRequestSchema = z.object({
  cohortId: z.string().min(1).optional(),
  title: z.string().min(1).max(240),
  description: z.string().max(5000).default(""),
  sessionType: ProgramSessionTypeSchema.default("event"),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  provider: z.string().max(120).default(""),
  meetingUrl: z.string().url().max(2048).optional(),
  attendeeUserIds: z.array(z.string().min(1)).max(1000).default([])
});

export type ProgramSessionCreateRequest = z.infer<typeof ProgramSessionCreateRequestSchema>;

export const ProgramAttendanceStatusSchema = z.enum([
  "invited",
  "registered",
  "attended",
  "no_show",
  "excused"
]);

export type ProgramAttendanceStatus = z.infer<typeof ProgramAttendanceStatusSchema>;

export const ProgramSessionAttendanceSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  status: ProgramAttendanceStatusSchema,
  notes: z.string().default(""),
  markedByUserId: z.string().nullable(),
  markedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type ProgramSessionAttendance = z.infer<typeof ProgramSessionAttendanceSchema>;

export const ProgramSessionAttendanceUpsertRequestSchema = z.object({
  userId: z.string().min(1),
  status: ProgramAttendanceStatusSchema,
  notes: z.string().max(5000).default("")
});

export type ProgramSessionAttendanceUpsertRequest = z.infer<
  typeof ProgramSessionAttendanceUpsertRequestSchema
>;

export const ProgramMentorshipStatusSchema = z.enum(["active", "completed", "cancelled"]);

export type ProgramMentorshipStatus = z.infer<typeof ProgramMentorshipStatusSchema>;

export const ProgramMentorshipMatchSchema = z.object({
  id: z.string().min(1),
  programId: z.string().min(1),
  cohortId: z.string().nullable(),
  mentorUserId: z.string().min(1),
  menteeUserId: z.string().min(1),
  status: ProgramMentorshipStatusSchema,
  notes: z.string().default(""),
  createdByUserId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type ProgramMentorshipMatch = z.infer<typeof ProgramMentorshipMatchSchema>;

export const ProgramMentorshipPairInputSchema = z.object({
  mentorUserId: z.string().min(1),
  menteeUserId: z.string().min(1),
  notes: z.string().max(5000).default("")
});

export type ProgramMentorshipPairInput = z.infer<typeof ProgramMentorshipPairInputSchema>;

export const ProgramMentorshipMatchCreateRequestSchema = z.object({
  cohortId: z.string().min(1).optional(),
  matches: z.array(ProgramMentorshipPairInputSchema).min(1).max(200)
});

export type ProgramMentorshipMatchCreateRequest = z.infer<
  typeof ProgramMentorshipMatchCreateRequestSchema
>;

export const ProgramAnalyticsSummarySchema = z.object({
  applicationsSubmitted: z.number().int().nonnegative(),
  applicationsUnderReview: z.number().int().nonnegative(),
  applicationsAccepted: z.number().int().nonnegative(),
  applicationsWaitlisted: z.number().int().nonnegative(),
  applicationsRejected: z.number().int().nonnegative(),
  cohortsTotal: z.number().int().nonnegative(),
  cohortMembersActive: z.number().int().nonnegative(),
  sessionsScheduled: z.number().int().nonnegative(),
  sessionsCompleted: z.number().int().nonnegative(),
  attendanceInvited: z.number().int().nonnegative(),
  attendanceMarked: z.number().int().nonnegative(),
  attendanceAttended: z.number().int().nonnegative(),
  attendanceRate: z.number().min(0).max(1),
  mentorshipMatchesActive: z.number().int().nonnegative(),
  mentorshipMatchesCompleted: z.number().int().nonnegative()
});

export type ProgramAnalyticsSummary = z.infer<typeof ProgramAnalyticsSummarySchema>;

export const PartnerCompetitionStatusSchema = z.enum(["draft", "open", "closed", "published", "archived"]);

export type PartnerCompetitionStatus = z.infer<typeof PartnerCompetitionStatusSchema>;

export const PartnerCompetitionSchema = z.object({
  id: z.string().min(1),
  organizerAccountId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  format: z.string().min(1),
  genre: z.string().min(1),
  status: PartnerCompetitionStatusSchema,
  submissionOpensAt: z.string().datetime({ offset: true }),
  submissionClosesAt: z.string().datetime({ offset: true }),
  createdByUserId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type PartnerCompetition = z.infer<typeof PartnerCompetitionSchema>;

export const PartnerCompetitionCreateRequestSchema = z.object({
  organizerAccountId: z.string().min(1),
  slug: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  description: z.string().max(5000).default(""),
  format: z.string().min(1).max(120),
  genre: z.string().min(1).max(120),
  status: PartnerCompetitionStatusSchema.default("draft"),
  submissionOpensAt: z.string().datetime({ offset: true }),
  submissionClosesAt: z.string().datetime({ offset: true })
});

export type PartnerCompetitionCreateRequest = z.infer<typeof PartnerCompetitionCreateRequestSchema>;

export const PartnerSubmissionStatusSchema = z.enum([
  "received",
  "in_review",
  "shortlisted",
  "finalist",
  "winner",
  "published",
  "withdrawn"
]);

export type PartnerSubmissionStatus = z.infer<typeof PartnerSubmissionStatusSchema>;

export const PartnerSubmissionSchema = z.object({
  id: z.string().min(1),
  competitionId: z.string().min(1),
  writerUserId: z.string().min(1),
  projectId: z.string().min(1),
  scriptId: z.string().min(1),
  status: PartnerSubmissionStatusSchema,
  entryFeeCents: z.number().int().nonnegative(),
  notes: z.string().default(""),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type PartnerSubmission = z.infer<typeof PartnerSubmissionSchema>;

export const PartnerJudgeAssignmentRequestSchema = z.object({
  judgeUserId: z.string().min(1),
  submissionIds: z.array(z.string().min(1)).min(1).max(500)
});

export type PartnerJudgeAssignmentRequest = z.infer<typeof PartnerJudgeAssignmentRequestSchema>;

export const PartnerEvaluationRequestSchema = z.object({
  submissionId: z.string().min(1),
  judgeUserId: z.string().min(1),
  round: z.string().min(1).max(120).default("default"),
  score: z.number().min(0).max(100),
  notes: z.string().max(5000).default("")
});

export type PartnerEvaluationRequest = z.infer<typeof PartnerEvaluationRequestSchema>;

export const PartnerNormalizeRequestSchema = z.object({
  round: z.string().min(1).max(120).default("default")
});

export type PartnerNormalizeRequest = z.infer<typeof PartnerNormalizeRequestSchema>;

export const PartnerPublishedResultItemSchema = z.object({
  submissionId: z.string().min(1),
  placementStatus: z.enum(["quarterfinalist", "semifinalist", "finalist", "winner"])
});

export type PartnerPublishedResultItem = z.infer<typeof PartnerPublishedResultItemSchema>;

export const PartnerPublishResultsRequestSchema = z.object({
  results: z.array(PartnerPublishedResultItemSchema).min(1).max(2000),
  notes: z.string().max(5000).default("")
});

export type PartnerPublishResultsRequest = z.infer<typeof PartnerPublishResultsRequestSchema>;

export const PartnerDraftSwapRequestSchema = z.object({
  submissionId: z.string().min(1),
  replacementScriptId: z.string().min(1),
  feeCents: z.number().int().nonnegative().default(500),
  reason: z.string().max(2000).default("")
});

export type PartnerDraftSwapRequest = z.infer<typeof PartnerDraftSwapRequestSchema>;

export const PartnerFilmFreewaySyncRequestSchema = z.object({
  competitionId: z.string().min(1),
  direction: z.enum(["import", "export"]).default("import"),
  externalRunId: z.string().min(1).max(200).optional()
});

export type PartnerFilmFreewaySyncRequest = z.infer<typeof PartnerFilmFreewaySyncRequestSchema>;

export const PartnerAnalyticsSummarySchema = z.object({
  submissionsTotal: z.number().int().nonnegative(),
  submissionsPublished: z.number().int().nonnegative(),
  judgesAssigned: z.number().int().nonnegative(),
  evaluationsSubmitted: z.number().int().nonnegative(),
  normalizationRuns: z.number().int().nonnegative(),
  resultsPublished: z.number().int().nonnegative(),
  draftSwapsProcessed: z.number().int().nonnegative(),
  syncJobsTotal: z.number().int().nonnegative(),
  syncJobsFailed: z.number().int().nonnegative()
});

export type PartnerAnalyticsSummary = z.infer<typeof PartnerAnalyticsSummarySchema>;
