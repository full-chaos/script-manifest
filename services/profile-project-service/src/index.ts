import Fastify, { type FastifyInstance } from "fastify";
import { pathToFileURL } from "node:url";
import {
  ProjectCoWriterCreateRequestSchema,
  ProjectCreateRequestSchema,
  ProjectDraftCreateRequestSchema,
  ProjectDraftPrimaryRequestSchema,
  ProjectDraftUpdateRequestSchema,
  ProjectFiltersSchema,
  ProjectUpdateRequestSchema,
  WriterProfileUpdateRequestSchema
} from "@script-manifest/contracts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { publishNotificationEvent } from "./notificationPublisher.js";
import {
  type ProfileProjectRepository,
  PgProfileProjectRepository
} from "./repository.js";

type PublishNotificationEvent = typeof publishNotificationEvent;

export type ProfileProjectServiceOptions = {
  logger?: boolean;
  publisher?: PublishNotificationEvent;
  repository?: ProfileProjectRepository;
};

export function buildServer(options: ProfileProjectServiceOptions = {}): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? true });
  const publisher = options.publisher ?? publishNotificationEvent;
  const repository = options.repository ?? new PgProfileProjectRepository();

  server.addHook("onReady", async () => {
    await repository.init();
  });

  server.get("/health", async () => ({ service: "profile-project-service", ok: true }));

  server.get("/internal/profiles/:writerId", async (req, reply) => {
    const { writerId } = req.params as { writerId: string };
    const profile = await repository.getProfile(writerId);
    if (!profile) {
      return reply.status(404).send({ error: "profile_not_found" });
    }

    return reply.send({ profile });
  });

  server.put("/internal/profiles/:writerId", async (req, reply) => {
    const { writerId } = req.params as { writerId: string };
    const parsed = WriterProfileUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const profile = await repository.upsertProfile(writerId, parsed.data);
    if (!profile) {
      return reply.status(404).send({ error: "profile_not_found" });
    }

    return reply.send({ profile });
  });

  server.post("/internal/projects", async (req, reply) => {
    const parsed = ProjectCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const project = await repository.createProject(parsed.data);
    if (!project) {
      return reply.status(404).send({ error: "owner_not_found" });
    }

    return reply.status(201).send({ project });
  });

  server.get("/internal/projects", async (req, reply) => {
    const parsed = ProjectFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", details: parsed.error.flatten() });
    }

    const projects = await repository.listProjects(parsed.data);
    return reply.send({ projects });
  });

  server.get("/internal/projects/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.send({ project });
  });

  server.put("/internal/projects/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const parsed = ProjectUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const project = await repository.updateProject(projectId, parsed.data);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.send({ project });
  });

  server.delete("/internal/projects/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const deleted = await repository.deleteProject(projectId);
    if (!deleted) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.send({ deleted: true });
  });

  server.get("/internal/projects/:projectId/co-writers", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const coWriters = await repository.listCoWriters(projectId);
    return reply.send({ coWriters });
  });

  server.post("/internal/projects/:projectId/co-writers", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const parsed = ProjectCoWriterCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    if (project.ownerUserId === parsed.data.coWriterUserId) {
      return reply.status(400).send({ error: "owner_cannot_be_co_writer" });
    }

    const coWriterExists = await repository.userExists(parsed.data.coWriterUserId);
    if (!coWriterExists) {
      return reply.status(404).send({ error: "co_writer_not_found" });
    }

    const coWriter = await repository.addCoWriter(projectId, parsed.data);
    if (!coWriter) {
      return reply.status(404).send({ error: "co_writer_not_found" });
    }

    return reply.status(201).send({ coWriter });
  });

  server.delete("/internal/projects/:projectId/co-writers/:coWriterUserId", async (req, reply) => {
    const { projectId, coWriterUserId } = req.params as {
      projectId: string;
      coWriterUserId: string;
    };
    const deleted = await repository.removeCoWriter(projectId, coWriterUserId);
    if (!deleted) {
      return reply.status(404).send({ error: "co_writer_not_found" });
    }

    return reply.send({ deleted: true });
  });

  server.get("/internal/projects/:projectId/drafts", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const drafts = await repository.listDrafts(projectId);
    return reply.send({ drafts });
  });

  server.post("/internal/projects/:projectId/drafts", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const parsed = ProjectDraftCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    if (project.ownerUserId !== parsed.data.ownerUserId) {
      return reply.status(403).send({ error: "owner_mismatch" });
    }

    const draft = await repository.createDraft(projectId, parsed.data);
    if (!draft) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(201).send({ draft });
  });

  server.patch("/internal/projects/:projectId/drafts/:draftId", async (req, reply) => {
    const { projectId, draftId } = req.params as { projectId: string; draftId: string };
    const parsed = ProjectDraftUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const draft = await repository.updateDraft(projectId, draftId, parsed.data);
    if (!draft) {
      return reply.status(404).send({ error: "draft_not_found" });
    }

    return reply.send({ draft });
  });

  server.post("/internal/projects/:projectId/drafts/:draftId/primary", async (req, reply) => {
    const { projectId, draftId } = req.params as { projectId: string; draftId: string };
    const parsed = ProjectDraftPrimaryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    if (project.ownerUserId !== parsed.data.ownerUserId) {
      return reply.status(403).send({ error: "owner_mismatch" });
    }

    const draft = await repository.setPrimaryDraft(projectId, draftId, parsed.data.ownerUserId);
    if (!draft) {
      return reply.status(404).send({ error: "draft_not_found" });
    }

    return reply.send({ draft });
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
