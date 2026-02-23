import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  ProgramApplicationCreateRequestSchema,
  ProgramApplicationReviewRequestSchema,
  ProgramCohortCreateRequestSchema,
  ProgramMentorshipMatchCreateRequestSchema,
  ProgramSessionAttendanceUpsertRequestSchema,
  ProgramSessionCreateRequestSchema,
  ProgramStatusSchema
} from "@script-manifest/contracts";
import { PgProgramsRepository, type ProgramsRepository } from "./repository.js";

export type ProgramsServiceOptions = {
  logger?: boolean;
  repository?: ProgramsRepository;
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
      return reply.send({ application });
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
