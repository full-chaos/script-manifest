import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { bootstrapService, registerMetrics, registerSentryErrorHandler, setupErrorReporting, validateRequiredEnv, isMainModule, verifyServiceToken } from "@script-manifest/service-utils";
import { closePool } from "@script-manifest/db";
import {
  NotificationEventEnvelopeSchema
} from "@script-manifest/contracts";
import type { NotificationRepository } from "./repository.js";
import { startConsumer } from "./consumer.js";
import { PgNotificationRepository } from "./pgRepository.js";
import type { NotificationAdminRepository } from "./admin-repository.js";
import { PgNotificationAdminRepository } from "./admin-repository.js";
import { registerNotificationAdminRoutes } from "./admin-routes.js";

export type NotificationServiceOptions = {
  logger?: boolean;
  repository?: NotificationRepository;
  adminRepository?: NotificationAdminRepository;
};

export function buildServer(options: NotificationServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });
  const repository = options.repository ?? new PgNotificationRepository();
  const adminRepository = options.adminRepository ?? new PgNotificationAdminRepository();
  let stopConsumer: () => Promise<void> = async () => {};

  const startedAt = Date.now();

  server.addHook("onReady", async () => {
    await repository.init();
    await adminRepository.init();
    // Start Kafka consumer in the background so it doesn't block the
    // onReady hook (and health checks) while KafkaJS retries connection.
    startConsumer(repository, server.log)
      .then((stop) => { stopConsumer = stop; })
      .catch((err) => { server.log.error({ err }, "kafka consumer failed to start"); });
  });

  server.addHook("onClose", async () => {
    await stopConsumer();
    await closePool();
  });

  server.get("/health", async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      const result = await repository.healthCheck();
      checks.database = result.database;
    } catch {
      checks.database = false;
    }

    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({
      service: "notification-service",
      ok,
      checks,
      uptime: Math.floor((Date.now() - startedAt) / 1000)
    });
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      const result = await repository.healthCheck();
      checks.database = result.database;
    } catch {
      checks.database = false;
    }

    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({
      service: "notification-service",
      ok,
      checks,
      uptime: Math.floor((Date.now() - startedAt) / 1000)
    });
  });

  function verifyInternalServiceToken(headers: Record<string, unknown>): boolean {
    const token = headers["x-service-token"];
    if (typeof token !== "string") return false;
    const secret = process.env.SERVICE_TOKEN_SECRET;
    if (!secret) return false;
    const payload = verifyServiceToken(token, secret);
    return payload !== null;
  }

  server.post("/internal/events", async (req, reply) => {
    if (!verifyInternalServiceToken(req.headers as Record<string, unknown>)) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parseResult = NotificationEventEnvelopeSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "invalid_notification_event",
        issues: parseResult.error.issues
      });
    }

    await repository.pushEvent(parseResult.data);
    return reply.status(202).send({ accepted: true, eventId: parseResult.data.eventId });
  });

  server.get<{ Params: { targetUserId: string }; Querystring: { limit?: string; offset?: string } }>("/internal/events/:targetUserId", async (req, reply) => {
    if (!verifyInternalServiceToken(req.headers as Record<string, unknown>)) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const { targetUserId } = req.params;
    const limit = req.query.limit !== undefined ? Math.max(1, Math.min(1000, Number(req.query.limit))) : 100;
    const offset = req.query.offset !== undefined ? Math.max(0, Number(req.query.offset)) : 0;
    const events = await repository.getEventsByTargetUser(targetUserId, limit, offset);
    return reply.send({ events });
  });

  server.get<{ Params: { targetUserId: string } }>("/internal/events/:targetUserId/unread-count", async (req, reply) => {
    if (!verifyInternalServiceToken(req.headers as Record<string, unknown>)) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const count = await repository.getUnreadCount(req.params.targetUserId);
    return reply.send({ count });
  });

  server.patch<{ Params: { eventId: string }; Body: { targetUserId: string } }>("/internal/events/:eventId/read", async (req, reply) => {
    if (!verifyInternalServiceToken(req.headers as Record<string, unknown>)) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const body = req.body as { targetUserId?: string };
    if (!body.targetUserId) {
      return reply.status(400).send({ error: "missing_target_user_id" });
    }
    const updated = await repository.markEventRead(req.params.eventId, body.targetUserId);
    return reply.send({ updated });
  });

  // Register admin routes for notification management
  registerNotificationAdminRoutes(server, adminRepository);

  return server;
}

export async function startServer(): Promise<void> {
  const boot = bootstrapService("notification-service");
  setupErrorReporting("notification-service");
  
  validateRequiredEnv(["PORT", "DATABASE_URL"]);
  boot.phase("env validated");
  const port = Number(process.env.PORT ?? 4010);
  const server = buildServer();
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
