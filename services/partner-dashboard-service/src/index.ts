import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  PartnerCompetitionCreateRequestSchema,
  PartnerDraftSwapRequestSchema,
  PartnerEvaluationRequestSchema,
  PartnerFilmFreewaySyncRequestSchema,
  PartnerJudgeAssignmentRequestSchema,
  PartnerNormalizeRequestSchema,
  PartnerPublishResultsRequestSchema
} from "@script-manifest/contracts";
import {
  PgPartnerDashboardRepository,
  type PartnerDashboardRepository
} from "./repository.js";

export type PartnerDashboardServiceOptions = {
  logger?: boolean;
  repository?: PartnerDashboardRepository;
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

  server.get("/internal/partners/competitions/:competitionId/submissions", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      await repositoryReady;
      const adminUserId = readHeader(req.headers, "x-admin-user-id");
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const { competitionId } = req.params as { competitionId: string };
      const submissions = await repository.listCompetitionSubmissions(competitionId);
      if (!submissions) {
        return reply.status(404).send({ error: "competition_not_found" });
      }
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
      const result = await repository.assignJudges(competitionId, adminUserId, parsed.data);
      if (!result) {
        return reply.status(404).send({ error: "competition_or_users_or_submissions_not_found" });
      }
      return reply.send(result);
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
      const result = await repository.publishResults(competitionId, adminUserId, parsed.data);
      if (!result) {
        return reply.status(404).send({ error: "competition_or_admin_not_found" });
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
