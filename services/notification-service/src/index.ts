import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { bootstrapService, registerMetrics, setupErrorReporting, validateRequiredEnv, isMainModule } from "@script-manifest/service-utils";
import { closePool } from "@script-manifest/db";
import {
  NotificationEventEnvelopeSchema
} from "@script-manifest/contracts";
import type { NotificationRepository } from "./repository.js";
import { startConsumer } from "./consumer.js";
import { PgNotificationRepository } from "./pgRepository.js";

export type NotificationServiceOptions = {
  logger?: boolean;
  repository?: NotificationRepository;
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
  let stopConsumer: () => Promise<void> = async () => {};

  const startedAt = Date.now();

  server.addHook("onReady", async () => {
    await repository.init();
    stopConsumer = await startConsumer(repository, server.log);
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

  server.post("/internal/events", async (req, reply) => {
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

  server.get<{ Params: { targetUserId: string } }>("/internal/events/:targetUserId", async (req, reply) => {
    const { targetUserId } = req.params;
    const events = await repository.getEventsByTargetUser(targetUserId);
    return reply.send({ events });
  });

  return server;
}

export async function startServer(): Promise<void> {
  const boot = bootstrapService("notification-service");
  setupErrorReporting("notification-service");
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const { setupTracing } = await import("@script-manifest/service-utils/tracing");
    const tracingSdk = setupTracing("notification-service");
    if (tracingSdk) {
      process.once("SIGTERM", () => {
        tracingSdk.shutdown().catch((err: unknown) => server.log.error(err, "OTel SDK shutdown error"));
      });
    }
    boot.phase("tracing initialized");
  }
  validateRequiredEnv(["PORT", "DATABASE_URL"]);
  boot.phase("env validated");
  const port = Number(process.env.PORT ?? 4010);
  const server = buildServer();
  boot.phase("server built");
  // Register Prometheus metrics endpoint (only in production server startup, not tests).
  await registerMetrics(server);
  await server.listen({ port, host: "0.0.0.0" });
  boot.ready(port);
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => { process.stderr.write(String(error) + "\n"); process.exit(1); });
}
