import Fastify from "fastify";
import {
  NotificationEventEnvelope,
  NotificationEventEnvelopeSchema
} from "@script-manifest/contracts";

const server = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 4010);
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

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
