import Fastify, { type FastifyInstance } from "fastify";
import { pathToFileURL } from "node:url";
import {
  NotificationEventEnvelope,
  NotificationEventEnvelopeSchema
} from "@script-manifest/contracts";

export type NotificationServiceOptions = {
  logger?: boolean;
};

export function buildServer(options: NotificationServiceOptions = {}): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? true });
  const eventLog: NotificationEventEnvelope[] = [];

  server.get("/health", async () => ({ service: "notification-service", ok: true }));

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
  const port = Number(process.env.PORT ?? 4010);
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
