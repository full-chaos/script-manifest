import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { request } from "undici";
import { bootstrapService, registerMetrics, registerSentryErrorHandler, setupErrorReporting, validateRequiredEnv, isMainModule, readHeader } from "@script-manifest/service-utils";
import { closePool } from "@script-manifest/db";
import {
  CompetitionFiltersSchema,
  CompetitionUpsertRequestSchema,
  NotificationEventEnvelopeSchema,
  type Competition
} from "@script-manifest/contracts";
import { z } from "zod";
import type { CompetitionDirectoryRepository } from "./repository.js";
import { PgCompetitionDirectoryRepository } from "./pgRepository.js";

type RequestFn = typeof request;

export type CompetitionDirectoryOptions = {
  logger?: boolean;
  requestFn?: RequestFn;
  searchIndexerBase?: string;
  notificationServiceBase?: string;
  repository?: CompetitionDirectoryRepository;
};

export function buildServer(options: CompetitionDirectoryOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });
  const requestFn = options.requestFn ?? request;
  const repository = options.repository ?? new PgCompetitionDirectoryRepository();
  const searchIndexerBase = options.searchIndexerBase ?? "http://localhost:4003";
  const notificationServiceBase = options.notificationServiceBase ?? "http://localhost:4010";
  const adminAllowlist = parseAllowlist(
    process.env.COMPETITION_ADMIN_ALLOWLIST ?? ""
  );

  const startedAt = Date.now();

  server.addHook("onReady", async () => {
    await repository.init();
  });

  server.addHook("onClose", async () => {
    await closePool();
  });

  // Deep health check: verify connectivity to database and external dependencies
  server.get("/health", async () => {
    const checkUrl = async (url: string): Promise<boolean> => {
      try {
        const res = await requestFn(url);
        return res.statusCode >= 200 && res.statusCode < 300;
      } catch {
        return false;
      }
    };

    const database = (await repository.healthCheck()).database;
    const indexerHealthy = await checkUrl(`${searchIndexerBase}/health/ready`);
    const notifierHealthy = await checkUrl(`${notificationServiceBase}/health/ready`);
    const ok = database && indexerHealthy && notifierHealthy;
    return {
      service: "competition-directory-service",
      ok,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      database,
      indexer: indexerHealthy,
      notifier: notifierHealthy
    };
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", async () => {
    const checkUrl = async (url: string): Promise<boolean> => {
      try {
        const res = await requestFn(url);
        return res.statusCode >= 200 && res.statusCode < 300;
      } catch {
        return false;
      }
    };

    const database = (await repository.healthCheck()).database;
    const indexerHealthy = await checkUrl(`${searchIndexerBase}/health/ready`);
    const notifierHealthy = await checkUrl(`${notificationServiceBase}/health/ready`);
    const ok = database && indexerHealthy && notifierHealthy;
    return {
      service: "competition-directory-service",
      ok,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      database,
      indexer: indexerHealthy,
      notifier: notifierHealthy
    };
  });

  server.get("/internal/competitions", async (req, reply) => {
    const parsedFilters = CompetitionFiltersSchema.safeParse(req.query);
    if (!parsedFilters.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parsedFilters.error.flatten()
      });
    }

    const results = await repository.listCompetitions(parsedFilters.data);

    return reply.send({ competitions: results });
  });

  server.post("/internal/competitions", async (req, reply) => {
    const parsedBody = CompetitionUpsertRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    return upsertCompetition(parsedBody.data, repository, requestFn, searchIndexerBase, server, reply);
  });

  server.post("/internal/admin/competitions", async (req, reply) => {
    const adminUserId = readHeader(req, "x-admin-user-id");
    if (!adminUserId || !adminAllowlist.has(adminUserId)) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = CompetitionUpsertRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    return upsertCompetition(parsedBody.data, repository, requestFn, searchIndexerBase, server, reply);
  });

  server.put<{ Params: { competitionId: string } }>("/internal/admin/competitions/:competitionId", async (req, reply) => {
    const adminUserId = readHeader(req, "x-admin-user-id");
    if (!adminUserId || !adminAllowlist.has(adminUserId)) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const { competitionId } = req.params;
    const parsedBody = CompetitionUpsertRequestSchema.safeParse({
      ...(req.body as object),
      id: competitionId
    });
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    return upsertCompetition(parsedBody.data, repository, requestFn, searchIndexerBase, server, reply);
  });

  server.post("/internal/competitions/reindex", async (_req, reply) => {
    const allCompetitions = await repository.getAllCompetitions();

    try {
      const upstream = await requestFn(`${searchIndexerBase}/internal/index/competition/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(allCompetitions)
      });

      const upstreamBody = await readBody(upstream);
      return reply.status(upstream.statusCode).send({
        pushed: allCompetitions.length,
        indexer: upstreamBody
      });
    } catch (error) {
      server.log.error(error);
      return reply.status(502).send({ error: "reindex_failed" });
    }
  });

  const DeadlineReminderRequestSchema = z.object({
    targetUserId: z.string().min(1),
    actorUserId: z.string().min(1).optional(),
    deadlineAt: z.string().datetime({ offset: true }),
    message: z.string().max(500).optional()
  });

  server.post<{ Params: { competitionId: string } }>("/internal/competitions/:competitionId/deadline-reminders", async (req, reply) => {
    const { competitionId } = req.params;
    const parsedBody = DeadlineReminderRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const event = NotificationEventEnvelopeSchema.parse({
      eventId: randomUUID(),
      eventType: "deadline_reminder",
      occurredAt: new Date().toISOString(),
      actorUserId: parsedBody.data.actorUserId,
      targetUserId: parsedBody.data.targetUserId,
      resourceType: "competition",
      resourceId: competitionId,
      payload: {
        deadlineAt: parsedBody.data.deadlineAt,
        message: parsedBody.data.message ?? null
      }
    });

    try {
      const upstream = await requestFn(`${notificationServiceBase}/internal/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event)
      });

      if (upstream.statusCode >= 400) {
        const details = await readBody(upstream);
        return reply.status(502).send({ error: "notification_publish_failed", details });
      }

      return reply.status(202).send({ accepted: true, eventId: event.eventId });
    } catch {
      return reply.status(502).send({ error: "notification_publish_failed" });
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const boot = bootstrapService("competition-directory-service");
  setupErrorReporting("competition-directory-service");
  
  validateRequiredEnv(["PORT", "SEARCH_INDEXER_URL", "DATABASE_URL"]);
  boot.phase("env validated");
  const port = Number(process.env.PORT ?? 4002);
  const server = buildServer({
    searchIndexerBase: process.env.SEARCH_INDEXER_URL,
    notificationServiceBase: process.env.NOTIFICATION_SERVICE_URL
  });
  boot.phase("server built");
  // Register Prometheus metrics endpoint (only in production server startup, not tests).
  await registerMetrics(server);
  registerSentryErrorHandler(server);
  await server.listen({ port, host: "0.0.0.0" });
  boot.ready(port);
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => { process.stderr.write(String(error) + "\n"); process.exit(1); });
}

async function pushCompetitionToIndexer(
  requestFn: RequestFn,
  searchIndexerBase: string,
  competition: Competition
): Promise<{ ok: boolean; body?: unknown }> {
  try {
    const upstream = await requestFn(`${searchIndexerBase}/internal/index/competition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(competition)
    });
    const body = await readBody(upstream);
    return { ok: upstream.statusCode >= 200 && upstream.statusCode < 300, body };
  } catch {
    return { ok: false };
  }
}

async function readBody(upstream: Awaited<ReturnType<typeof request>>): Promise<unknown> {
  const raw = await upstream.body.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function upsertCompetition(
  competition: Competition,
  repository: CompetitionDirectoryRepository,
  requestFn: RequestFn,
  searchIndexerBase: string,
  server: FastifyInstance,
  reply: FastifyReply
) {
  const { existed } = await repository.upsertCompetition(competition);

  const indexing = await pushCompetitionToIndexer(requestFn, searchIndexerBase, competition);
  if (!indexing.ok) {
    server.log.warn({ competitionId: competition.id }, "competition saved but indexing failed");
  }

  return reply.status(existed ? 200 : 201).send({
    competition,
    upserted: true,
    created: !existed,
    indexed: indexing.ok
  });
}

function parseAllowlist(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}
