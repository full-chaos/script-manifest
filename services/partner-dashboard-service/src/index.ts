import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { request as undiciRequest } from "undici";
import { bootstrapService } from "@script-manifest/service-utils";
import {
  PartnerCompetitionCreateRequestSchema,
  PartnerDraftSwapRequestSchema,
  PartnerEvaluationRequestSchema,
  PartnerFilmFreewaySyncRequestSchema,
  PartnerJudgeAssignmentRequestSchema,
  PartnerNormalizeRequestSchema,
  PartnerPublishResultsRequestSchema
} from "@script-manifest/contracts";
import { z } from "zod";
import {
  PgPartnerDashboardRepository,
  type CompetitionRole,
  type PartnerDashboardRepository,
  type PartnerSyncJob
} from "./repository.js";

export type PartnerDashboardServiceOptions = {
  logger?: boolean;
  repository?: PartnerDashboardRepository;
  requestFn?: typeof undiciRequest;
  rankingServiceBase?: string;
  notificationServiceBase?: string;
  filmFreewaySyncRunner?: (job: PartnerSyncJob) => Promise<{ status?: "succeeded" | "failed"; detail?: string } | void>;
  onFilmFreewaySyncQueued?: (job: PartnerSyncJob) => Promise<void> | void;
};

function readHeader(headers: Record<string, unknown>, name: string): string | null {
  const value = headers[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function buildServer(options: PartnerDashboardServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info"
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id"
  });
  const repository = options.repository ?? new PgPartnerDashboardRepository();
  const repositoryReady = repository.init();
  const requestFn = options.requestFn ?? undiciRequest;
  const rankingServiceBase = options.rankingServiceBase ?? process.env.RANKING_SERVICE_URL ?? "http://localhost:4007";
  const notificationServiceBase =
    options.notificationServiceBase ??
    process.env.NOTIFICATION_SERVICE_URL ??
    "http://localhost:4010";

  const MembershipUpsertSchema = z.object({
    role: z.enum(["owner", "admin", "editor", "judge", "viewer"])
  });

  const IntakeConfigSchema = z.object({
    formFields: z.array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        type: z.enum(["text", "textarea", "url", "number", "select"]),
        required: z.boolean().default(false),
        options: z.array(z.string().min(1)).default([])
      })
    ).max(200),
    feeRules: z.object({
      baseFeeCents: z.number().int().nonnegative().default(0),
      lateFeeCents: z.number().int().nonnegative().default(0)
    }).default({ baseFeeCents: 0, lateFeeCents: 0 })
  });

  const IntakeSubmissionCreateSchema = z.object({
    writerUserId: z.string().min(1),
    projectId: z.string().min(1),
    scriptId: z.string().min(1),
    formResponses: z.record(z.string(), z.unknown()).default({}),
    requestedFeeCents: z.number().int().nonnegative().optional()
  });

  const AutoAssignJudgesSchema = z.object({
    judgeUserIds: z.array(z.string().min(1)).min(1).max(200),
    maxAssignmentsPerJudge: z.number().int().positive().max(500),
    submissionIds: z.array(z.string().min(1)).max(2000).optional()
  });

  const EntrantMessageCreateSchema = z.object({
    targetUserId: z.string().min(1).optional(),
    messageKind: z.enum(["direct", "broadcast", "reminder"]).default("direct"),
    templateKey: z.string().max(200).default(""),
    subject: z.string().max(500).default(""),
    body: z.string().max(10000).default(""),
    metadata: z.record(z.string(), z.unknown()).default({})
  }).refine((value) => value.messageKind !== "direct" || !!value.targetUserId, {
    message: "targetUserId is required for direct messages",
    path: ["targetUserId"]
  });

  const EntrantMessageListQuerySchema = z.object({
    targetUserId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional()
  });

  const SyncJobCompleteSchema = z.object({
    detail: z.string().max(4000).default("")
  });

  const SyncJobFailSchema = z.object({
    detail: z.string().min(1).max(4000)
  });

  const CompetitionJobRunSchema = z.object({
    job: z.enum(["judge_assignment_balancing", "normalization_recompute", "entrant_reminders"]),
    judgeUserIds: z.array(z.string().min(1)).max(200).optional(),
    maxAssignmentsPerJudge: z.number().int().positive().max(500).default(5),
    round: z.string().min(1).max(120).default("default"),
    reminderTemplateKey: z.string().max(200).default("entrant_reminder"),
    reminderSubject: z.string().max(500).default("Competition status update"),
    reminderBody: z.string().max(5000).default("Please review your latest competition update.")
  });

  const publishNotification = async (input: {
    eventType: string;
    actorUserId?: string;
    targetUserId: string;
    resourceType: string;
    resourceId: string;
    payload: Record<string, unknown>;
  }): Promise<void> => {
    const response = await requestFn(`${notificationServiceBase}/internal/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: `event_${randomUUID()}`,
        eventType: input.eventType,
        occurredAt: new Date().toISOString(),
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        payload: input.payload
      })
    });
    if (response.statusCode >= 400) {
      const body = await response.body.text();
      throw new Error(`notification_failed:${response.statusCode}:${body}`);
    }
  };

  const hasRole = async (
    competitionId: string,
    userId: string,
    allowed: CompetitionRole[]
  ): Promise<boolean> => {
    const role = await repository.getCompetitionRole(competitionId, userId);
    return !!role && allowed.includes(role);
  };

  const ensureCompetitionExists = async (competitionId: string): Promise<boolean> => {
    return repository.competitionExists(competitionId);
  };

  server.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    allowList: []
  });

  server.get("/health", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (_req, reply) => {
      await repositoryReady;
      const checks: Record<string, boolean> = {};
      try {
        const result = await repository.healthCheck();
        checks.database = result.database;
      } catch {
        checks.database = false;
      }
      const ok = Object.values(checks).every(Boolean);
      return reply.status(ok ? 200 : 503).send({ service: "partner-dashboard-service", ok, checks });
    }
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (_req, reply) => {
      await repositoryReady;
      const checks: Record<string, boolean> = {};
      try {
        const result = await repository.healthCheck();
        checks.database = result.database;
      } catch {
        checks.database = false;
      }
      const ok = Object.values(checks).every(Boolean);
      return reply.status(ok ? 200 : 503).send({ service: "partner-dashboard-service", ok, checks });
    }
  });

  server.post("/internal/partners/competitions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = PartnerCompetitionCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const competition = await repository.createCompetition(adminUserId, parsed.data);
      if (!competition) {
        return reply.status(404).send({ error: "organizer_or_admin_not_found" });
      }
      return reply.status(201).send({ competition });
    }
  });

  server.put("/internal/partners/competitions/:competitionId/memberships/:userId", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const actorUserId = readHeader(req.headers, "x-admin-user-id");
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { competitionId, userId } = req.params as { competitionId: string; userId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, actorUserId, ["owner", "admin"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = MembershipUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const membership = await repository.upsertCompetitionMembership(competitionId, userId, parsed.data.role);
      if (!membership) {
        return reply.status(404).send({ error: "competition_or_user_not_found" });
      }
      return reply.send({ membership });
    }
  });

  server.put("/internal/partners/competitions/:competitionId/intake", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const actorUserId = readHeader(req.headers, "x-admin-user-id");
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, actorUserId, ["owner", "admin", "editor"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = IntakeConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const intake = await repository.upsertCompetitionIntakeConfig(competitionId, actorUserId, parsed.data);
      if (!intake) {
        return reply.status(404).send({ error: "competition_or_admin_not_found" });
      }
      return reply.send({
        intake: {
          formFields: intake.formFields,
          feeRules: intake.feeRules
        }
      });
    }
  });

  server.post("/internal/partners/competitions/:competitionId/submissions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const actorUserId = readHeader(req.headers, "x-admin-user-id");
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, actorUserId, ["owner", "admin", "editor"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = IntakeSubmissionCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      const intake = await repository.getCompetitionIntakeConfig(competitionId);
      const submission = await repository.createCompetitionSubmission(competitionId, {
        writerUserId: parsed.data.writerUserId,
        projectId: parsed.data.projectId,
        scriptId: parsed.data.scriptId,
        formResponses: parsed.data.formResponses,
        entryFeeCents: parsed.data.requestedFeeCents ?? intake?.feeRules.baseFeeCents ?? 0,
        notes: ""
      });
      if (!submission) {
        return reply.status(404).send({ error: "competition_or_writer_or_project_not_found" });
      }
      try {
        await publishNotification({
          eventType: "partner_submission_received",
          actorUserId,
          targetUserId: submission.writerUserId,
          resourceType: "partner_submission",
          resourceId: submission.id,
          payload: {
            competitionId,
            entryFeeCents: submission.entryFeeCents
          }
        });
      } catch (error) {
        req.log.warn({ error, competitionId, submissionId: submission.id }, "submission notification failed");
      }
      return reply.status(201).send({ submission });
    }
  });

  server.get("/internal/partners/competitions/:competitionId/submissions", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, adminUserId, ["owner", "admin", "editor", "judge", "viewer"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const submissions = await repository.listCompetitionSubmissions(competitionId);
      if (!submissions) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      return reply.send({ submissions });
    }
  });

  server.post("/internal/partners/competitions/:competitionId/messages", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const actorUserId = readHeader(req.headers, "x-admin-user-id");
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, actorUserId, ["owner", "admin", "editor"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const parsed = EntrantMessageCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      const message = await repository.createEntrantMessage(competitionId, actorUserId, parsed.data);
      if (!message) {
        return reply.status(404).send({ error: "competition_or_users_not_found" });
      }
      try {
        await publishNotification({
          eventType: "partner_entrant_message_sent",
          actorUserId,
          targetUserId: message.targetUserId ?? actorUserId,
          resourceType: "partner_message",
          resourceId: message.id,
          payload: {
            competitionId,
            messageKind: message.messageKind,
            templateKey: message.templateKey
          }
        });
      } catch (error) {
        req.log.warn({ error, competitionId, messageId: message.id }, "entrant message notification failed");
      }
      return reply.status(201).send({ message });
    }
  });

  server.get("/internal/partners/competitions/:competitionId/messages", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const actorUserId = readHeader(req.headers, "x-admin-user-id");
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, actorUserId, ["owner", "admin", "editor", "judge", "viewer"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const parsed = EntrantMessageListQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_query", details: parsed.error.flatten() });
      }

      const messages = await repository.listEntrantMessages(competitionId, parsed.data);
      if (!messages) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      return reply.send({ messages });
    }
  });

  server.post("/internal/partners/competitions/:competitionId/judges/assign", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = PartnerJudgeAssignmentRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, adminUserId, ["owner", "admin", "editor"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const result = await repository.assignJudges(competitionId, adminUserId, parsed.data);
      if (!result) {
        return reply.status(404).send({ error: "competition_or_users_or_submissions_not_found" });
      }
      return reply.send(result);
    }
  });

  server.post("/internal/partners/competitions/:competitionId/judges/auto-assign", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const actorUserId = readHeader(req.headers, "x-admin-user-id");
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, actorUserId, ["owner", "admin", "editor"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = AutoAssignJudgesSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      const persistedSubmissions = await repository.listCompetitionSubmissions(competitionId);
      if (!persistedSubmissions) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      const requestedSubmissionIds = parsed.data.submissionIds ? new Set(parsed.data.submissionIds) : null;
      const selected = persistedSubmissions
        .map((submission) => String(submission.id))
        .filter((id) => id.length > 0 && (!requestedSubmissionIds || requestedSubmissionIds.has(id)));

      if (selected.length === 0) {
        return reply.send({ assignedCount: 0, assignments: [] });
      }

      const judgeCounts = new Map<string, number>();
      for (const judgeUserId of parsed.data.judgeUserIds) {
        judgeCounts.set(judgeUserId, 0);
      }

      const assignments: Array<{ submissionId: string; judgeUserId: string }> = [];
      for (const submissionId of selected) {
        let chosenJudge: string | null = null;
        for (const judgeUserId of parsed.data.judgeUserIds) {
          const currentCount = judgeCounts.get(judgeUserId) ?? 0;
          if (currentCount < parsed.data.maxAssignmentsPerJudge) {
            chosenJudge = judgeUserId;
            judgeCounts.set(judgeUserId, currentCount + 1);
            break;
          }
        }
        if (chosenJudge) {
          assignments.push({ submissionId, judgeUserId: chosenJudge });
        }
      }

      const byJudge = new Map<string, string[]>();
      for (const assignment of assignments) {
        const current = byJudge.get(assignment.judgeUserId) ?? [];
        current.push(assignment.submissionId);
        byJudge.set(assignment.judgeUserId, current);
      }

      let assignedCount = 0;
      for (const [judgeUserId, submissionIds] of byJudge.entries()) {
        const result = await repository.assignJudges(competitionId, actorUserId, {
          judgeUserId,
          submissionIds
        });
        if (!result) {
          return reply.status(404).send({ error: "competition_or_users_or_submissions_not_found" });
        }
        assignedCount += result.assignedCount;
      }

      return reply.send({ assignedCount, assignments });
    }
  });

  server.post("/internal/partners/competitions/:competitionId/jobs/run", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const actorUserId = readHeader(req.headers, "x-admin-user-id");
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, actorUserId, ["owner", "admin", "editor"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const parsed = CompetitionJobRunSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      if (parsed.data.job === "judge_assignment_balancing") {
        const persistedSubmissions = await repository.listCompetitionSubmissions(competitionId);
        if (!persistedSubmissions) {
          return reply.status(404).send({ error: "competition_not_found" });
        }
        const judgeUserIds = parsed.data.judgeUserIds ?? [];
        if (judgeUserIds.length < 1) {
          return reply.status(400).send({ error: "invalid_payload", detail: "judgeUserIds is required" });
        }

        const selected = persistedSubmissions.map((submission) => String(submission.id));
        const judgeCounts = new Map<string, number>();
        for (const judgeUserId of judgeUserIds) {
          judgeCounts.set(judgeUserId, 0);
        }
        let assignedCount = 0;
        const assignments: Array<{ submissionId: string; judgeUserId: string }> = [];
        for (const submissionId of selected) {
          for (const judgeUserId of judgeUserIds) {
            const currentCount = judgeCounts.get(judgeUserId) ?? 0;
            if (currentCount < parsed.data.maxAssignmentsPerJudge) {
              judgeCounts.set(judgeUserId, currentCount + 1);
              assignments.push({ submissionId, judgeUserId });
              const result = await repository.assignJudges(competitionId, actorUserId, {
                judgeUserId,
                submissionIds: [submissionId]
              });
              assignedCount += result?.assignedCount ?? 0;
              break;
            }
          }
        }
        return reply.send({
          job: parsed.data.job,
          assignedCount,
          assignments
        });
      }

      if (parsed.data.job === "normalization_recompute") {
        const result = await repository.runNormalization(competitionId, actorUserId, {
          round: parsed.data.round
        });
        if (!result) {
          return reply.status(404).send({ error: "competition_or_admin_not_found" });
        }
        return reply.send({
          job: parsed.data.job,
          runId: result.runId,
          evaluatedCount: result.evaluatedCount
        });
      }

      const submissions = await repository.listCompetitionSubmissions(competitionId);
      if (!submissions) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      let sentCount = 0;
      for (const submission of submissions) {
        const message = await repository.createEntrantMessage(competitionId, actorUserId, {
          targetUserId: submission.writerUserId,
          messageKind: "reminder",
          templateKey: parsed.data.reminderTemplateKey,
          subject: parsed.data.reminderSubject,
          body: parsed.data.reminderBody,
          metadata: { submissionId: submission.id, job: "entrant_reminders" }
        });
        if (!message) {
          continue;
        }
        sentCount += 1;
      }
      return reply.send({
        job: parsed.data.job,
        sentCount
      });
    }
  });

  server.post("/internal/partners/competitions/:competitionId/evaluations", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = PartnerEvaluationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, adminUserId, ["owner", "admin", "editor", "judge"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const submission = await repository.recordEvaluation(competitionId, adminUserId, parsed.data);
      if (!submission) {
        return reply.status(404).send({ error: "competition_or_submission_or_users_not_found" });
      }
      return reply.send({ submission });
    }
  });

  server.post("/internal/partners/competitions/:competitionId/normalize", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = PartnerNormalizeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, adminUserId, ["owner", "admin"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const result = await repository.runNormalization(competitionId, adminUserId, parsed.data);
      if (!result) {
        return reply.status(404).send({ error: "competition_or_admin_not_found" });
      }
      try {
        await publishNotification({
          eventType: "partner_score_normalized",
          actorUserId: adminUserId,
          targetUserId: adminUserId,
          resourceType: "partner_competition",
          resourceId: competitionId,
          payload: {
            runId: result.runId,
            evaluatedCount: result.evaluatedCount,
            round: parsed.data.round
          }
        });
      } catch (error) {
        req.log.warn({ error, competitionId, runId: result.runId }, "normalization notification failed");
      }
      return reply.send(result);
    }
  });

  server.post("/internal/partners/competitions/:competitionId/publish-results", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = PartnerPublishResultsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, adminUserId, ["owner", "admin"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const result = await repository.publishResults(competitionId, adminUserId, parsed.data);
      if (!result) {
        return reply.status(404).send({ error: "competition_or_admin_not_found" });
      }

      const writerUserIds = new Set(
        Array.isArray(result.writerUserIds)
          ? result.writerUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
          : []
      );

      for (const writerId of writerUserIds) {
        try {
          await publishNotification({
            eventType: "partner_results_published",
            actorUserId: adminUserId,
            targetUserId: writerId,
            resourceType: "partner_competition",
            resourceId: competitionId,
            payload: {
              publishedCount: result.publishedCount
            }
          });
        } catch (error) {
          req.log.warn({ error, writerId, competitionId }, "results notification failed");
        }
        try {
          const rankingResponse = await requestFn(`${rankingServiceBase}/internal/recompute/incremental`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ writerId })
          });
          if (rankingResponse.statusCode >= 400) {
            let body = "";
            try {
              body = await rankingResponse.body.text();
            } catch {
              body = "";
            }
            req.log.warn(
              { writerId, statusCode: rankingResponse.statusCode, body },
              "ranking incremental recompute request failed"
            );
          }
        } catch (error) {
          req.log.warn({ writerId, error }, "ranking incremental recompute request errored");
        }
      }

      return reply.send(result);
    }
  });

  server.post("/internal/partners/competitions/:competitionId/draft-swaps", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = PartnerDraftSwapRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, adminUserId, ["owner", "admin", "editor"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const result = await repository.processDraftSwap(competitionId, adminUserId, parsed.data);
      if (!result) {
        return reply.status(404).send({ error: "competition_or_submission_or_admin_not_found" });
      }
      try {
        const submissions = await repository.listCompetitionSubmissions(competitionId);
        const submission = submissions?.find((item) => item.id === result.submissionId);
        await publishNotification({
          eventType: "partner_draft_swap_processed",
          actorUserId: adminUserId,
          targetUserId: submission?.writerUserId ?? adminUserId,
          resourceType: "partner_submission",
          resourceId: result.submissionId,
          payload: {
            competitionId,
            replacementScriptId: result.replacementScriptId,
            feeCents: result.feeCents
          }
        });
      } catch (error) {
        req.log.warn({ error, competitionId, submissionId: result.submissionId }, "draft swap notification failed");
      }
      return reply.send(result);
    }
  });

  server.get("/internal/partners/competitions/:competitionId/analytics", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { competitionId } = req.params as { competitionId: string };
      if (!(await ensureCompetitionExists(competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(competitionId, adminUserId, ["owner", "admin", "editor", "viewer"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const summary = await repository.getCompetitionAnalytics(competitionId);
      if (!summary) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      return reply.send({ summary });
    }
  });

  server.post("/internal/partners/integrations/filmfreeway/sync", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = PartnerFilmFreewaySyncRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      if (!(await ensureCompetitionExists(parsed.data.competitionId))) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      if (!(await hasRole(parsed.data.competitionId, adminUserId, ["owner", "admin"]))) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const job = await repository.queueFilmFreewaySync(adminUserId, parsed.data);
      if (!job) {
        return reply.status(404).send({ error: "competition_or_admin_not_found" });
      }

      if (options.onFilmFreewaySyncQueued) {
        Promise.resolve(options.onFilmFreewaySyncQueued(job)).catch((error) => {
          req.log.warn({ error, jobId: job.jobId }, "filmfreeway sync queue hook failed");
        });
      }

      return reply.status(202).send({ job });
    }
  });

  server.post("/internal/partners/integrations/filmfreeway/sync/jobs/claim", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const job = await repository.claimNextFilmFreewaySyncJob();
      if (!job) {
        return reply.status(404).send({ error: "job_not_found" });
      }
      return reply.send({ job });
    }
  });

  server.post("/internal/partners/integrations/filmfreeway/sync/jobs/:jobId/complete", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = SyncJobCompleteSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { jobId } = req.params as { jobId: string };
      const job = await repository.completeFilmFreewaySyncJob(jobId, parsed.data.detail);
      if (!job) {
        return reply.status(404).send({ error: "job_not_found_or_not_running" });
      }
      return reply.send({ job });
    }
  });

  server.post("/internal/partners/integrations/filmfreeway/sync/jobs/:jobId/fail", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = SyncJobFailSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { jobId } = req.params as { jobId: string };
      const job = await repository.failFilmFreewaySyncJob(jobId, parsed.data.detail);
      if (!job) {
        return reply.status(404).send({ error: "job_not_found_or_not_running" });
      }
      return reply.send({ job });
    }
  });

  server.post("/internal/partners/integrations/filmfreeway/sync/run-next", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const runner = options.filmFreewaySyncRunner;
      if (!runner) {
        return reply.status(501).send({ error: "sync_runner_not_configured" });
      }

      const claimed = await repository.claimNextFilmFreewaySyncJob();
      if (!claimed) {
        return reply.status(404).send({ error: "job_not_found" });
      }

      try {
        const result = await runner(claimed);
        if (result?.status === "failed") {
          const failed = await repository.failFilmFreewaySyncJob(claimed.jobId, result.detail ?? "runner_failed");
          if (!failed) {
            return reply.status(409).send({ error: "job_state_conflict" });
          }
          return reply.send({ job: failed });
        }

        const completed = await repository.completeFilmFreewaySyncJob(claimed.jobId, result?.detail ?? "");
        if (!completed) {
          return reply.status(409).send({ error: "job_state_conflict" });
        }
        return reply.send({ job: completed });
      } catch (error) {
        const failed = await repository.failFilmFreewaySyncJob(claimed.jobId, "runner_exception");
        req.log.warn({ error, jobId: claimed.jobId }, "filmfreeway sync runner failed");
        if (!failed) {
          return reply.status(409).send({ error: "job_state_conflict" });
        }
        return reply.send({ job: failed });
      }
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const boot = bootstrapService("partner-dashboard-service");
  const port = Number(process.env.PORT ?? 4013);
  const server = buildServer();
  boot.phase("server built");
  await server.listen({ port, host: "0.0.0.0" });
  boot.ready(port);
}

function isMainModule(metaUrl: string): boolean {
  if (!process.argv[1]) {
    return false;
  }
  return metaUrl === pathToFileURL(process.argv[1]).href;
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
