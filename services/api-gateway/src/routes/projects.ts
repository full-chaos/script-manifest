import type { FastifyInstance } from "fastify";
import {
  ProjectCoWriterCreateRequestSchema,
  ProjectCreateRequestSchema,
  ProjectDraftCreateRequestSchema,
  ProjectDraftPrimaryRequestSchema,
  ProjectDraftUpdateRequestSchema,
  ProjectUpdateRequestSchema
} from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest
} from "../helpers.js";

export function registerProjectRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/projects", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/projects${querySuffix}`,
      {
        method: "GET"
      }
    );
  });

  server.post("/api/v1/projects", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
    }
    const parsed = ProjectCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.profileServiceBase}/internal/projects`, {
      method: "POST",
      headers: addAuthUserIdHeader(
        { "content-type": "application/json" },
        userId
      ),
      body: JSON.stringify(parsed.data)
    });
  });

  server.get("/api/v1/projects/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}`,
      {
        method: "GET"
      }
    );
  });

  server.put("/api/v1/projects/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
    }
    const parsed = ProjectUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}`,
      {
        method: "PUT",
        headers: addAuthUserIdHeader(
          { "content-type": "application/json" },
          userId
        ),
        body: JSON.stringify(parsed.data)
      }
    );
  });

  server.delete("/api/v1/projects/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}`,
      {
        method: "DELETE",
        headers: addAuthUserIdHeader({}, userId)
      }
    );
  });

  server.get("/api/v1/projects/:projectId/co-writers", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}/co-writers`,
      {
        method: "GET"
      }
    );
  });

  server.post("/api/v1/projects/:projectId/co-writers", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
    }
    const parsed = ProjectCoWriterCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}/co-writers`,
      {
        method: "POST",
        headers: addAuthUserIdHeader(
          { "content-type": "application/json" },
          userId
        ),
        body: JSON.stringify(parsed.data)
      }
    );
  });

  server.delete("/api/v1/projects/:projectId/co-writers/:coWriterUserId", async (req, reply) => {
    const { projectId, coWriterUserId } = req.params as {
      projectId: string;
      coWriterUserId: string;
    };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}/co-writers/${encodeURIComponent(coWriterUserId)}`,
      {
        method: "DELETE",
        headers: addAuthUserIdHeader({}, userId)
      }
    );
  });

  server.get("/api/v1/projects/:projectId/drafts", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}/drafts`,
      {
        method: "GET"
      }
    );
  });

  server.post("/api/v1/projects/:projectId/drafts", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
    }
    const parsed = ProjectDraftCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}/drafts`,
      {
        method: "POST",
        headers: addAuthUserIdHeader(
          { "content-type": "application/json" },
          userId
        ),
        body: JSON.stringify(parsed.data)
      }
    );
  });

  server.patch("/api/v1/projects/:projectId/drafts/:draftId", async (req, reply) => {
    const { projectId, draftId } = req.params as { projectId: string; draftId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
    }
    const parsed = ProjectDraftUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}/drafts/${encodeURIComponent(draftId)}`,
      {
        method: "PATCH",
        headers: addAuthUserIdHeader(
          { "content-type": "application/json" },
          userId
        ),
        body: JSON.stringify(parsed.data)
      }
    );
  });

  server.post("/api/v1/projects/:projectId/drafts/:draftId/primary", async (req, reply) => {
    const { projectId, draftId } = req.params as { projectId: string; draftId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
    }
    const parsed = ProjectDraftPrimaryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}/drafts/${encodeURIComponent(draftId)}/primary`,
      {
        method: "POST",
        headers: addAuthUserIdHeader(
          { "content-type": "application/json" },
          userId
        ),
        body: JSON.stringify(parsed.data)
      }
    );
  });
}
