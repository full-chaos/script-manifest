import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { request as undiciRequest } from "undici";
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
  type PartnerDashboardRepository
} from "./repository.js";

export type PartnerDashboardServiceOptions = {
  logger?: boolean;
  repository?: PartnerDashboardRepository;
  requestFn?: typeof undiciRequest;
  rankingServiceBase?: string;
};

type CompetitionRole = "owner" | "admin" | "editor" | "judge" | "viewer";

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
  const competitionRoles = new Map<string, Map<string, CompetitionRole>>();
  const competitionIntake = new Map<string, { formFields: Array<Record<string, unknown>>; feeRules: { baseFeeCents: number; lateFeeCents: number } }>();
  const adHocSubmissions = new Map<string, Array<Record<string, unknown>>>();
  const autoAssignmentsByCompetition = new Map<string, Array<{ submissionId: string; judgeUserId: string; assignedAt: string }>>();

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

  const hasRole = (
    competitionId: string,
    userId: string,
    allowed: CompetitionRole[]
  ): boolean => {
    const roles = competitionRoles.get(competitionId);
    const role = roles?.get(userId) ?? (userId === "admin_01" ? "owner" : undefined);
    return !!role && allowed.includes(role);
  };

  const ensureCompetitionExists = async (competitionId: string): Promise<boolean> => {
    const submissions = await repository.listCompetitionSubmissions(competitionId);
    return submissions !== null;
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
      const roles = competitionRoles.get(competition.id) ?? new Map<string, CompetitionRole>();
      roles.set(adminUserId, "owner");
      competitionRoles.set(competition.id, roles);
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
      if (!hasRole(competitionId, actorUserId, ["owner", "admin"])) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = MembershipUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const roles = competitionRoles.get(competitionId) ?? new Map<string, CompetitionRole>();
      roles.set(userId, parsed.data.role);
      competitionRoles.set(competitionId, roles);
      return reply.send({ membership: { competitionId, userId, role: parsed.data.role } });
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
      if (!hasRole(competitionId, actorUserId, ["owner", "admin", "editor"])) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = IntakeConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      competitionIntake.set(competitionId, parsed.data);
      return reply.send({ intake: parsed.data });
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
      if (!hasRole(competitionId, actorUserId, ["owner", "admin", "editor"])) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = IntakeSubmissionCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const intake = competitionIntake.get(competitionId) ?? {
        formFields: [],
        feeRules: { baseFeeCents: 0, lateFeeCents: 0 }
      };
      const submission = {
        id: `partner_submission_${randomUUID()}`,
        competitionId,
        writerUserId: parsed.data.writerUserId,
        projectId: parsed.data.projectId,
        scriptId: parsed.data.scriptId,
        status: "received",
        entryFeeCents: parsed.data.requestedFeeCents ?? intake.feeRules.baseFeeCents,
        notes: "",
        formResponses: parsed.data.formResponses,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const existing = adHocSubmissions.get(competitionId) ?? [];
      existing.push(submission);
      adHocSubmissions.set(competitionId, existing);
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
      if (!hasRole(competitionId, adminUserId, ["owner", "admin", "editor", "judge", "viewer"])) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const persistedSubmissions = await repository.listCompetitionSubmissions(competitionId);
      if (!persistedSubmissions) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
      const inMemorySubmissions = adHocSubmissions.get(competitionId) ?? [];
      const submissions = [...inMemorySubmissions, ...persistedSubmissions];
      return reply.send({ submissions });
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
      if (!hasRole(competitionId, adminUserId, ["owner", "admin", "editor"])) {
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
      if (!hasRole(competitionId, actorUserId, ["owner", "admin", "editor"])) {
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
      const inMemorySubmissions = adHocSubmissions.get(competitionId) ?? [];
      const allSubmissions = [...inMemorySubmissions, ...persistedSubmissions];
      const submissionIds = parsed.data.submissionIds
        ? new Set(parsed.data.submissionIds)
        : null;
      const selected = allSubmissions
        .map((submission) => String(submission.id ?? ""))
        .filter((id) => id.length > 0 && (!submissionIds || submissionIds.has(id)));

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

      const assignmentRecords = assignments.map((assignment) => ({
        ...assignment,
        assignedAt: new Date().toISOString()
      }));
      const existing = autoAssignmentsByCompetition.get(competitionId) ?? [];
      autoAssignmentsByCompetition.set(competitionId, [...existing, ...assignmentRecords]);

      return reply.send({ assignedCount: assignments.length, assignments });
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
      if (!hasRole(competitionId, adminUserId, ["owner", "admin", "editor", "judge"])) {
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
      if (!hasRole(competitionId, adminUserId, ["owner", "admin"])) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const result = await repository.runNormalization(competitionId, adminUserId, parsed.data);
      if (!result) {
        return reply.status(404).send({ error: "competition_or_admin_not_found" });
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
      if (!hasRole(competitionId, adminUserId, ["owner", "admin"])) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const result = await repository.publishResults(competitionId, adminUserId, parsed.data);
      if (!result) {
        return reply.status(404).send({ error: "competition_or_admin_not_found" });
      }
      try {
        await requestFn(`${rankingServiceBase}/internal/recompute/incremental`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: "partner_publish_results",
            competitionId
          })
        });
      } catch {
        // non-blocking best-effort sync hook
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
      if (!hasRole(competitionId, adminUserId, ["owner", "admin", "editor"])) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const result = await repository.processDraftSwap(competitionId, adminUserId, parsed.data);
      if (!result) {
        return reply.status(404).send({ error: "competition_or_submission_or_admin_not_found" });
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
      if (!hasRole(competitionId, adminUserId, ["owner", "admin", "editor", "viewer"])) {
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
      if (!hasRole(parsed.data.competitionId, adminUserId, ["owner", "admin"])) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const job = await repository.queueFilmFreewaySync(adminUserId, parsed.data);
      if (!job) {
        return reply.status(404).send({ error: "competition_or_admin_not_found" });
      }
      return reply.status(202).send({ job });
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4013);
  const server = buildServer();
  await server.listen({ port, host: "0.0.0.0" });
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
