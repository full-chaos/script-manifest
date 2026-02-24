import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { request as undiciRequest } from "undici";
import {
  ProgramApplicationCreateRequestSchema,
  ProgramApplicationReviewRequestSchema,
  ProgramCohortCreateRequestSchema,
  ProgramMentorshipMatchCreateRequestSchema,
  ProgramSessionAttendanceUpsertRequestSchema,
  ProgramSessionCreateRequestSchema,
  ProgramStatusSchema
} from "@script-manifest/contracts";
import { z } from "zod";
import { PgProgramsRepository, type ProgramsRepository } from "./repository.js";

export type ProgramsServiceOptions = {
  logger?: boolean;
  repository?: ProgramsRepository;
  requestFn?: typeof undiciRequest;
  notificationServiceBase?: string;
};

function readHeader(headers: Record<string, unknown>, name: string): string | null {
  const value = headers[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function buildServer(options: ProgramsServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info"
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id"
  });
  const repository = options.repository ?? new PgProgramsRepository();
  const repositoryReady = repository.init();
  const requestFn = options.requestFn ?? undiciRequest;
  const notificationServiceBase =
    options.notificationServiceBase ??
    process.env.NOTIFICATION_SERVICE_URL ??
    "http://localhost:4010";
  const formByProgram = new Map<string, { fields: Array<Record<string, unknown>>; updatedByUserId: string; updatedAt: string }>();
  const rubricByProgram = new Map<string, { criteria: Array<Record<string, unknown>>; updatedByUserId: string; updatedAt: string }>();
  const availabilityByProgram = new Map<string, Array<{ userId: string; startsAt: string; endsAt: string }>>();
  const sessionAttendees = new Map<string, string[]>();
  const sessionIntegration = new Map<string, { provider: string; meetingUrl: string | null; recordingUrl: string | null; reminderOffsetsMinutes: number[] }>();
  const outcomesByProgram = new Map<string, Array<Record<string, unknown>>>();
  const crmSyncJobsByProgram = new Map<string, Array<Record<string, unknown>>>();

  const ProgramApplicationFormSchema = z.object({
    fields: z.array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        type: z.enum(["text", "textarea", "url", "number", "select"]),
        required: z.boolean().default(false),
        options: z.array(z.string().min(1)).default([])
      })
    ).max(200)
  });

  const ProgramScoringRubricSchema = z.object({
    criteria: z.array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        weight: z.number().min(0).max(1),
        maxScore: z.number().positive()
      })
    ).min(1).max(100)
  });

  const ProgramAvailabilityWindowSchema = z.object({
    userId: z.string().min(1),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true })
  });

  const ProgramAvailabilityUpsertSchema = z.object({
    windows: z.array(ProgramAvailabilityWindowSchema).max(500)
  });

  const ProgramSchedulingMatchRequestSchema = z.object({
    attendeeUserIds: z.array(z.string().min(1)).min(1).max(100),
    durationMinutes: z.number().int().positive().max(480)
  });

  const ProgramSessionIntegrationUpdateSchema = z.object({
    provider: z.string().max(120).optional(),
    meetingUrl: z.string().url().max(2048).optional(),
    recordingUrl: z.string().url().max(2048).optional(),
    reminderOffsetsMinutes: z.array(z.number().int().positive().max(10080)).max(20).optional()
  });

  const ProgramOutcomeCreateSchema = z.object({
    userId: z.string().min(1),
    outcomeType: z.string().min(1).max(120),
    notes: z.string().max(5000).default("")
  });

  const ProgramCrmSyncCreateSchema = z.object({
    reason: z.string().min(1).max(500),
    payload: z.record(z.string(), z.unknown()).optional()
  });

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
      return reply.status(ok ? 200 : 503).send({ service: "programs-service", ok, checks });
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
      return reply.status(ok ? 200 : 503).send({ service: "programs-service", ok, checks });
    }
  });

  server.get("/internal/programs", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const query = req.query as { status?: string };
      const statusParsed = typeof query.status === "string"
        ? ProgramStatusSchema.safeParse(query.status)
        : null;
      if (typeof query.status === "string" && statusParsed && !statusParsed.success) {
        return reply.status(400).send({ error: "invalid_query", detail: "Invalid status value" });
      }
      const programs = await repository.listPrograms(statusParsed?.success ? statusParsed.data : undefined);
      return reply.send({ programs });
    }
  });

  server.get("/internal/programs/:programId/application-form", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const { programId } = req.params as { programId: string };
      const form = formByProgram.get(programId) ?? {
        fields: [],
        updatedByUserId: "",
        updatedAt: new Date(0).toISOString()
      };
      return reply.send({ form });
    }
  });

  server.post("/internal/programs/:programId/applications", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const userId = readHeader(req.headers, "x-auth-user-id");
      if (!userId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      const parsed = ProgramApplicationCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const application = await repository.createProgramApplication(programId, userId, parsed.data);
      if (!application) {
        return reply.status(404).send({ error: "program_or_user_not_found_or_closed" });
      }
      return reply.status(201).send({ application });
    }
  });

  server.get("/internal/programs/:programId/applications/me", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const userId = readHeader(req.headers, "x-auth-user-id");
      if (!userId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      const applications = await repository.listUserProgramApplications(programId, userId);
      return reply.send({ applications });
    }
  });

  server.get("/internal/admin/programs/:programId/applications", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      const applications = await repository.listProgramApplications(programId);
      return reply.send({ applications });
    }
  });

  server.post("/internal/admin/programs/:programId/applications/:applicationId/review", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const reviewerUserId = readHeader(req.headers, "x-admin-user-id");
      if (!reviewerUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId, applicationId } = req.params as { programId: string; applicationId: string };
      const parsed = ProgramApplicationReviewRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const application = await repository.reviewProgramApplication(
        programId,
        applicationId,
        reviewerUserId,
        parsed.data
      );
      if (!application) {
        return reply.status(404).send({ error: "application_not_found" });
      }
      try {
        await requestFn(`${notificationServiceBase}/internal/notifications/program-application-decision`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            programId,
            applicationId: application.id,
            userId: application.userId,
            status: application.status,
            score: application.score,
            decisionNotes: application.decisionNotes
          })
        });
      } catch {
        // decision writes should succeed even when notification fanout is degraded
      }
      return reply.send({ application });
    }
  });

  server.put("/internal/admin/programs/:programId/application-form", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = ProgramApplicationFormSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { programId } = req.params as { programId: string };
      const form = {
        fields: parsed.data.fields.map((field) => ({ ...field })),
        updatedByUserId: adminUserId,
        updatedAt: new Date().toISOString()
      };
      formByProgram.set(programId, form);
      return reply.send({ form });
    }
  });

  server.put("/internal/admin/programs/:programId/scoring-rubric", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = ProgramScoringRubricSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { programId } = req.params as { programId: string };
      const rubric = {
        criteria: parsed.data.criteria.map((criterion) => ({ ...criterion })),
        updatedByUserId: adminUserId,
        updatedAt: new Date().toISOString()
      };
      rubricByProgram.set(programId, rubric);
      return reply.send({ rubric });
    }
  });

  server.get("/internal/admin/programs/:programId/scoring-rubric", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      const rubric = rubricByProgram.get(programId) ?? {
        criteria: [],
        updatedByUserId: "",
        updatedAt: new Date(0).toISOString()
      };
      return reply.send({ rubric });
    }
  });

  server.get("/internal/admin/programs/:programId/cohorts", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      const cohorts = await repository.listProgramCohorts(programId);
      return reply.send({ cohorts });
    }
  });

  server.post("/internal/admin/programs/:programId/cohorts", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      const parsed = ProgramCohortCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const cohort = await repository.createProgramCohort(programId, adminUserId, parsed.data);
      if (!cohort) {
        return reply.status(404).send({ error: "program_or_admin_not_found" });
      }
      return reply.status(201).send({ cohort });
    }
  });

  server.post("/internal/admin/programs/:programId/availability", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = ProgramAvailabilityUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { programId } = req.params as { programId: string };
      availabilityByProgram.set(
        programId,
        parsed.data.windows.map((window) => ({ ...window }))
      );
      return reply.send({ windows: availabilityByProgram.get(programId) ?? [] });
    }
  });

  server.post("/internal/admin/programs/:programId/scheduling/match", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = ProgramSchedulingMatchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const { programId } = req.params as { programId: string };
      const windows = availabilityByProgram.get(programId) ?? [];
      const targetWindows = parsed.data.attendeeUserIds.map((userId) =>
        windows.filter((window) => window.userId === userId)
      );
      if (targetWindows.some((set) => set.length === 0)) {
        return reply.status(404).send({ error: "availability_not_found" });
      }

      let matchStart: Date | null = null;
      let matchEnd: Date | null = null;
      const durationMs = parsed.data.durationMinutes * 60 * 1000;
      for (const candidate of targetWindows[0] ?? []) {
        const start = new Date(candidate.startsAt).getTime();
        const end = new Date(candidate.endsAt).getTime();
        let overlapStart = start;
        let overlapEnd = end;
        for (const windowSet of targetWindows.slice(1)) {
          let localFound = false;
          for (const window of windowSet) {
            const s = new Date(window.startsAt).getTime();
            const e = new Date(window.endsAt).getTime();
            const mergedStart = Math.max(overlapStart, s);
            const mergedEnd = Math.min(overlapEnd, e);
            if (mergedEnd - mergedStart >= durationMs) {
              overlapStart = mergedStart;
              overlapEnd = mergedEnd;
              localFound = true;
              break;
            }
          }
          if (!localFound) {
            overlapStart = -1;
            break;
          }
        }
        if (overlapStart >= 0 && overlapEnd - overlapStart >= durationMs) {
          matchStart = new Date(overlapStart);
          matchEnd = new Date(overlapStart + durationMs);
          break;
        }
      }
      if (!matchStart || !matchEnd) {
        return reply.status(404).send({ error: "no_common_slot" });
      }
      return reply.send({
        match: {
          startsAt: matchStart.toISOString(),
          endsAt: matchEnd.toISOString(),
          attendeeUserIds: parsed.data.attendeeUserIds
        }
      });
    }
  });

  server.post("/internal/admin/programs/:programId/sessions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      const parsed = ProgramSessionCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const session = await repository.createProgramSession(programId, adminUserId, parsed.data);
      if (!session) {
        return reply.status(404).send({ error: "program_or_admin_or_cohort_not_found" });
      }
      sessionAttendees.set(session.id, [...parsed.data.attendeeUserIds]);
      sessionIntegration.set(session.id, {
        provider: parsed.data.provider,
        meetingUrl: parsed.data.meetingUrl ?? null,
        recordingUrl: null,
        reminderOffsetsMinutes: []
      });
      return reply.status(201).send({ session });
    }
  });

  server.post("/internal/admin/programs/:programId/sessions/:sessionId/attendance", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId, sessionId } = req.params as { programId: string; sessionId: string };
      const parsed = ProgramSessionAttendanceUpsertRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const attendance = await repository.upsertSessionAttendance(
        programId,
        sessionId,
        adminUserId,
        parsed.data
      );
      if (!attendance) {
        return reply.status(404).send({ error: "session_or_user_or_admin_not_found" });
      }
      return reply.send({ attendance });
    }
  });

  server.patch("/internal/admin/programs/:programId/sessions/:sessionId/integration", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { sessionId } = req.params as { programId: string; sessionId: string };
      if (!sessionAttendees.has(sessionId)) {
        return reply.status(404).send({ error: "session_not_found" });
      }
      const parsed = ProgramSessionIntegrationUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const current = sessionIntegration.get(sessionId) ?? {
        provider: "",
        meetingUrl: null,
        recordingUrl: null,
        reminderOffsetsMinutes: []
      };
      const updated = {
        provider: parsed.data.provider ?? current.provider,
        meetingUrl: parsed.data.meetingUrl ?? current.meetingUrl,
        recordingUrl: parsed.data.recordingUrl ?? current.recordingUrl,
        reminderOffsetsMinutes: parsed.data.reminderOffsetsMinutes ?? current.reminderOffsetsMinutes
      };
      sessionIntegration.set(sessionId, updated);
      return reply.send({ integration: updated });
    }
  });

  server.post("/internal/admin/programs/:programId/sessions/:sessionId/reminders/dispatch", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { sessionId } = req.params as { programId: string; sessionId: string };
      const attendees = sessionAttendees.get(sessionId);
      if (!attendees) {
        return reply.status(404).send({ error: "session_not_found" });
      }
      return reply.status(202).send({
        queued: attendees.length,
        reminderOffsetsMinutes: sessionIntegration.get(sessionId)?.reminderOffsetsMinutes ?? []
      });
    }
  });

  server.post("/internal/admin/programs/:programId/mentorship/matches", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      const parsed = ProgramMentorshipMatchCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const matches = await repository.createMentorshipMatches(programId, adminUserId, parsed.data);
      if (!matches) {
        return reply.status(404).send({ error: "program_or_admin_or_users_not_found" });
      }
      return reply.status(201).send({ matches });
    }
  });

  server.post("/internal/admin/programs/:programId/outcomes", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      const parsed = ProgramOutcomeCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const outcome = {
        id: `program_outcome_${randomUUID()}`,
        programId,
        userId: parsed.data.userId,
        outcomeType: parsed.data.outcomeType,
        notes: parsed.data.notes,
        recordedByUserId: adminUserId,
        createdAt: new Date().toISOString()
      };
      const existing = outcomesByProgram.get(programId) ?? [];
      existing.push(outcome);
      outcomesByProgram.set(programId, existing);
      return reply.status(201).send({ outcome });
    }
  });

  server.post("/internal/admin/programs/:programId/crm-sync", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      const parsed = ProgramCrmSyncCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      const job = {
        id: `program_crm_sync_${randomUUID()}`,
        programId,
        status: "queued",
        reason: parsed.data.reason,
        payload: parsed.data.payload ?? {},
        triggeredByUserId: adminUserId,
        createdAt: new Date().toISOString()
      };
      const jobs = crmSyncJobsByProgram.get(programId) ?? [];
      jobs.push(job);
      crmSyncJobsByProgram.set(programId, jobs);
      return reply.status(202).send({ job });
    }
  });

  server.get("/internal/admin/programs/:programId/crm-sync", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      return reply.send({ jobs: crmSyncJobsByProgram.get(programId) ?? [] });
    }
  });

  server.get("/internal/admin/programs/:programId/analytics", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { programId } = req.params as { programId: string };
      const summary = await repository.getProgramAnalytics(programId);
      if (!summary) {
        return reply.status(404).send({ error: "program_not_found" });
      }
      return reply.send({ summary });
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4012);
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
