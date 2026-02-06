import Fastify, { type FastifyInstance } from "fastify";
import { pathToFileURL } from "node:url";
import { WriterProfileSchema } from "@script-manifest/contracts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { publishNotificationEvent } from "./notificationPublisher.js";

type PublishNotificationEvent = typeof publishNotificationEvent;

export type ProfileProjectServiceOptions = {
  logger?: boolean;
  publisher?: PublishNotificationEvent;
};

export function buildServer(options: ProfileProjectServiceOptions = {}): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? true });
  const publisher = options.publisher ?? publishNotificationEvent;

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
      await publisher({
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

  return server;
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4001);
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
