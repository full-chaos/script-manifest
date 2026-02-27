import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { pathToFileURL } from "node:url";
import { validateRequiredEnv } from "@script-manifest/service-utils";
import {
  ProjectCoWriterCreateRequestSchema,
  ProjectCreateInternalSchema,
  ProjectDraftCreateInternalSchema,
  ProjectDraftUpdateRequestSchema,
  ProjectFiltersSchema,
  ProjectUpdateRequestSchema,
  ScriptAccessRequestCreateRequestSchema,
  ScriptAccessRequestDecisionRequestSchema,
  ScriptAccessRequestFiltersSchema,
  WriterProfileUpdateRequestSchema
} from "@script-manifest/contracts";
import { randomUUID } from "node:crypto";
import { publishNotificationEvent } from "./notificationPublisher.js";
import {
  type ProfileProjectRepository,
  PgProfileProjectRepository
} from "./repository.js";
import { registerMetrics } from "@script-manifest/service-utils";

type PublishNotificationEvent = typeof publishNotificationEvent;

export type ProfileProjectServiceOptions = {
  logger?: boolean;
  publisher?: PublishNotificationEvent;
  repository?: ProfileProjectRepository;
};

// lgtm [js/missing-rate-limiting]
export function buildServer(options: ProfileProjectServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });
  const publisher = options.publisher ?? publishNotificationEvent;
  const repository = options.repository ?? new PgProfileProjectRepository();

  // Helper to extract authenticated user ID from headers
  const getAuthUserId = (headers: Record<string, unknown>): string | null => {
    const userId = headers["x-auth-user-id"];
    return typeof userId === "string" && userId.length > 0 ? userId : null;
  };

  server.addHook("onReady", async () => {
    await repository.init();
  });

  server.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    allowList: []
  });

  server.get("/health", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (_req, reply) => {
      const checks: Record<string, boolean> = {};
      try {
        const result = await repository.healthCheck();
        checks.database = result.database;
      } catch {
        checks.database = false;
      }
      const ok = Object.values(checks).every(Boolean);
      return reply.status(ok ? 200 : 503).send({ service: "profile-project-service", ok, checks });
    }
  });

  server.get("/health/live", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async () => ({ ok: true })
  });

  server.get("/health/ready", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (_req, reply) => {
      const checks: Record<string, boolean> = {};
      try {
        const result = await repository.healthCheck();
        checks.database = result.database;
      } catch {
        checks.database = false;
      }
      const ok = Object.values(checks).every(Boolean);
      return reply.status(ok ? 200 : 503).send({ service: "profile-project-service", ok, checks });
    }
  });

  server.get("/internal/profiles/:writerId", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { writerId } = req.params as { writerId: string };
    const authUserId = getAuthUserId(req.headers);
    const profile = await repository.getProfile(writerId);
    if (!profile) {
      return reply.status(404).send({ error: "profile_not_found" });
    }

    // Enforce searchability: non-searchable profiles are hidden from non-owners
    if (!profile.isSearchable && authUserId !== writerId) {
      return reply.status(404).send({ error: "profile_not_found" });
    }

      return reply.send({ profile });
    }
  });

  server.put("/internal/profiles/:writerId", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { writerId } = req.params as { writerId: string };
    const authUserId = getAuthUserId(req.headers);
    
    // Only the user themselves can update their profile
    if (authUserId !== writerId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = WriterProfileUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const profile = await repository.upsertProfile(writerId, parsed.data);
    if (!profile) {
      return reply.status(404).send({ error: "profile_not_found" });
    }

      return reply.send({ profile });
    }
  });

  server.post("/internal/projects", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = ProjectCreateInternalSchema.safeParse({
      ...(req.body as object),
      ownerUserId: authUserId
    });
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const project = await repository.createProject(parsed.data);
    if (!project) {
      return reply.status(404).send({ error: "owner_not_found" });
    }

      return reply.status(201).send({ project });
    }
  });

  server.get("/internal/projects", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const parsed = ProjectFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", details: parsed.error.flatten() });
    }

      const projects = await repository.listProjects(parsed.data);
      return reply.send({ projects });
    }
  });

  server.get("/internal/projects/:projectId", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

      return reply.send({ project });
    }
  });

  server.put("/internal/projects/:projectId", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const authUserId = getAuthUserId(req.headers);
    
    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    // Only the owner can update the project
    if (authUserId !== project.ownerUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = ProjectUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const updated = await repository.updateProject(projectId, parsed.data);
    if (!updated) {
      return reply.status(404).send({ error: "project_not_found" });
    }

      return reply.send({ project: updated });
    }
  });

  server.delete("/internal/projects/:projectId", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const authUserId = getAuthUserId(req.headers);
    
    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    // Only the owner can delete the project
    if (authUserId !== project.ownerUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const deleted = await repository.deleteProject(projectId);
    if (!deleted) {
      return reply.status(404).send({ error: "project_not_found" });
    }

      return reply.send({ deleted: true });
    }
  });

  server.get("/internal/projects/:projectId/co-writers", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

      const coWriters = await repository.listCoWriters(projectId);
      return reply.send({ coWriters });
    }
  });

  server.post("/internal/projects/:projectId/co-writers", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const authUserId = getAuthUserId(req.headers);
    
    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    // Only the owner can add co-writers
    if (authUserId !== project.ownerUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = ProjectCoWriterCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
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
    }
  });

  server.delete("/internal/projects/:projectId/co-writers/:coWriterUserId", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { projectId, coWriterUserId } = req.params as {
      projectId: string;
      coWriterUserId: string;
    };
    const authUserId = getAuthUserId(req.headers);
    
    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    // Only the owner can remove co-writers
    if (authUserId !== project.ownerUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const deleted = await repository.removeCoWriter(projectId, coWriterUserId);
    if (!deleted) {
      return reply.status(404).send({ error: "co_writer_not_found" });
    }

      return reply.send({ deleted: true });
    }
  });

  server.get("/internal/projects/:projectId/drafts", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

      const drafts = await repository.listDrafts(projectId);
      return reply.send({ drafts });
    }
  });

  server.post("/internal/projects/:projectId/drafts", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = ProjectDraftCreateInternalSchema.safeParse({
      ...(req.body as object),
      ownerUserId: authUserId
    });
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    if (project.ownerUserId !== authUserId) {
      return reply.status(403).send({ error: "owner_mismatch" });
    }

    const draft = await repository.createDraft(projectId, parsed.data);
    if (!draft) {
      return reply.status(404).send({ error: "project_not_found" });
    }

      return reply.status(201).send({ draft });
    }
  });

  server.patch("/internal/projects/:projectId/drafts/:draftId", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { projectId, draftId } = req.params as { projectId: string; draftId: string };
    const authUserId = getAuthUserId(req.headers);
    
    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    // Only the owner can update drafts
    if (authUserId !== project.ownerUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = ProjectDraftUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const draft = await repository.updateDraft(projectId, draftId, parsed.data);
    if (!draft) {
      return reply.status(404).send({ error: "draft_not_found" });
    }

      return reply.send({ draft });
    }
  });

  server.post("/internal/projects/:projectId/drafts/:draftId/primary", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { projectId, draftId } = req.params as { projectId: string; draftId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const project = await repository.getProject(projectId);
    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    if (project.ownerUserId !== authUserId) {
      return reply.status(403).send({ error: "owner_mismatch" });
    }

    const draft = await repository.setPrimaryDraft(projectId, draftId, authUserId);
    if (!draft) {
      return reply.status(404).send({ error: "draft_not_found" });
    }

      return reply.send({ draft });
    }
  });

  server.post("/internal/scripts/:scriptId/access-requests", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { scriptId } = req.params as { scriptId: string };
    const authUserId = getAuthUserId(req.headers);
    const parseResult = ScriptAccessRequestCreateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "invalid_script_access_request",
        details: parseResult.error.flatten()
      });
    }

    if (authUserId && authUserId !== parseResult.data.requesterUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    if (parseResult.data.requesterUserId === parseResult.data.ownerUserId) {
      return reply.status(400).send({ error: "requester_cannot_be_owner" });
    }

    const [requesterExists, ownerExists] = await Promise.all([
      repository.userExists(parseResult.data.requesterUserId),
      repository.userExists(parseResult.data.ownerUserId)
    ]);
    if (!requesterExists || !ownerExists) {
      return reply.status(404).send({ error: "user_not_found" });
    }

    const accessRequest = await repository.createScriptAccessRequest(scriptId, parseResult.data);
    if (!accessRequest) {
      return reply.status(404).send({ error: "access_request_create_failed" });
    }

    const eventId = randomUUID();
    try {
      await publisher({
        eventId,
        eventType: "script_access_requested",
        occurredAt: new Date().toISOString(),
        actorUserId: accessRequest.requesterUserId,
        targetUserId: accessRequest.ownerUserId,
        resourceType: "script",
        resourceId: scriptId,
        payload: {
          accessRequestId: accessRequest.id,
          reason: accessRequest.reason || null
        }
      });
    } catch (error) {
      server.log.error({ error }, "failed to publish script access request event");
      return reply.status(502).send({ error: "notification_publish_failed" });
    }

      return reply.status(202).send({ accepted: true, eventId, accessRequest });
    }
  });

  server.get("/internal/scripts/:scriptId/access-requests", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const { scriptId } = req.params as { scriptId: string };
    const parseResult = ScriptAccessRequestFiltersSchema.safeParse(req.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parseResult.error.flatten()
      });
    }

    const accessRequests = await repository.listScriptAccessRequests(scriptId, parseResult.data);
    const authUserId = getAuthUserId(req.headers);
    const visibleAccessRequests = authUserId
      ? accessRequests.filter(
          (entry) => entry.requesterUserId === authUserId || entry.ownerUserId === authUserId
        )
      : accessRequests;

      return reply.send({ accessRequests: visibleAccessRequests });
    }
  });

  server.post("/internal/scripts/:scriptId/access-requests/:requestId/approve", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { scriptId, requestId } = req.params as { scriptId: string; requestId: string };
      const authUserId = getAuthUserId(req.headers);
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const parsedBody = ScriptAccessRequestDecisionRequestSchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          error: "invalid_payload",
          details: parsedBody.error.flatten()
        });
      }

      const accessRequest = await repository.decideScriptAccessRequest(
        scriptId,
        requestId,
        authUserId,
        "approved",
        parsedBody.data.decisionReason
      );
      if (!accessRequest) {
        return reply.status(404).send({ error: "access_request_not_found" });
      }

      try {
        await publisher({
          eventId: randomUUID(),
          eventType: "script_access_approved",
          occurredAt: new Date().toISOString(),
          actorUserId: authUserId,
          targetUserId: accessRequest.requesterUserId,
          resourceType: "script",
          resourceId: scriptId,
          payload: {
            accessRequestId: accessRequest.id,
            decisionReason: accessRequest.decisionReason
          }
        });
      } catch (error) {
        server.log.warn({ error }, "failed to publish script access approval event");
      }

      return reply.send({ accessRequest });
    }
  });

  server.post("/internal/scripts/:scriptId/access-requests/:requestId/reject", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { scriptId, requestId } = req.params as { scriptId: string; requestId: string };
      const authUserId = getAuthUserId(req.headers);
      if (!authUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const parsedBody = ScriptAccessRequestDecisionRequestSchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return reply.status(400).send({
          error: "invalid_payload",
          details: parsedBody.error.flatten()
        });
      }

      const accessRequest = await repository.decideScriptAccessRequest(
        scriptId,
        requestId,
        authUserId,
        "rejected",
        parsedBody.data.decisionReason
      );
      if (!accessRequest) {
        return reply.status(404).send({ error: "access_request_not_found" });
      }

      return reply.send({ accessRequest });
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const { setupTracing } = await import("@script-manifest/service-utils/tracing");
  const tracingSdk = setupTracing("profile-project-service");
  if (tracingSdk) {
    process.once("SIGTERM", () => {
      tracingSdk.shutdown().catch((err) => console.error("OTel SDK shutdown error", err));
    });
  }

  validateRequiredEnv(["DATABASE_URL"]);
  const port = Number(process.env.PORT ?? 4001);
  const server = buildServer();
  // Register Prometheus metrics endpoint (only in production server startup, not tests).
  await registerMetrics(server);
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
