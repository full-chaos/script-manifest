import Fastify from "fastify";
import { WriterProfileSchema } from "@script-manifest/contracts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { publishNotificationEvent } from "./notificationPublisher.js";

const server = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 4001);

const demoProfile = WriterProfileSchema.parse({
  id: "writer_01",
  displayName: "Demo Writer",
  bio: "Phase 1 seed profile",
  genres: ["Drama", "Thriller"],
  representationStatus: "unrepresented"
});

server.get("/health", async () => ({ service: "profile-project-service", ok: true }));

server.get("/internal/profiles/:writerId", async (req, reply) => {
  const { writerId } = req.params as { writerId: string };
  if (writerId !== demoProfile.id) {
    return reply.status(404).send({ error: "profile_not_found" });
  }

  return reply.send({ profile: demoProfile });
});

const ScriptAccessRequestSchema = z.object({
  requesterUserId: z.string().min(1),
  ownerUserId: z.string().min(1),
  reason: z.string().max(500).optional()
});

server.post("/internal/scripts/:scriptId/access-requests", async (req, reply) => {
  const { scriptId } = req.params as { scriptId: string };
  const parseResult = ScriptAccessRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return reply.status(400).send({
      error: "invalid_script_access_request",
      issues: parseResult.error.issues
    });
  }

  const eventId = randomUUID();
  try {
    await publishNotificationEvent({
      eventId,
      eventType: "script_access_requested",
      occurredAt: new Date().toISOString(),
      actorUserId: parseResult.data.requesterUserId,
      targetUserId: parseResult.data.ownerUserId,
      resourceType: "script",
      resourceId: scriptId,
      payload: {
        reason: parseResult.data.reason ?? null
      }
    });
  } catch (error) {
    server.log.error({ error }, "failed to publish script access request event");
    return reply.status(502).send({ error: "notification_publish_failed" });
  }

  return reply.status(202).send({ accepted: true, eventId });
});

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
