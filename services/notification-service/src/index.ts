import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { bootstrapService, registerMetrics, setupErrorReporting, validateRequiredEnv } from "@script-manifest/service-utils";
import {
  NotificationEventEnvelope,
  NotificationEventEnvelopeSchema
} from "@script-manifest/contracts";

export type NotificationServiceOptions = {
  logger?: boolean;
};

export function buildServer(options: NotificationServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });
  const eventLog: NotificationEventEnvelope[] = [];

  const startedAt = Date.now();

  server.get("/health", async () => ({
    service: "notification-service",
    ok: true,
    uptime: Math.floor((Date.now() - startedAt) / 1000)
  }));

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", async () => ({
    service: "notification-service",
    ok: true,
    uptime: Math.floor((Date.now() - startedAt) / 1000)
  }));

  server.post("/internal/events", async (req, reply) => {
    const parseResult = NotificationEventEnvelopeSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "invalid_notification_event",
        issues: parseResult.error.issues
      });
    }

    eventLog.push(parseResult.data);
    return reply.status(202).send({ accepted: true, eventId: parseResult.data.eventId });
  });

  server.get("/internal/events/:targetUserId", async (req, reply) => {
    const { targetUserId } = req.params as { targetUserId: string };
    const events = eventLog.filter((event) => event.targetUserId === targetUserId);
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
        tracingSdk.shutdown().catch((err) => server.log.error(err, "OTel SDK shutdown error"));
      });
    }
    boot.phase("tracing initialized");
  }
  validateRequiredEnv(["PORT"]);
  boot.phase("env validated");
  const port = Number(process.env.PORT ?? 4010);
  const server = buildServer();
  boot.phase("server built");
  // Register Prometheus metrics endpoint (only in production server startup, not tests).
  await registerMetrics(server);
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
  startServer().catch((error) => { process.stderr.write(String(error) + "\n"); process.exit(1); });
}
