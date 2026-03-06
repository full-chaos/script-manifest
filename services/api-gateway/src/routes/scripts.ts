import type { FastifyInstance } from "fastify";
import {
  ScriptAccessRequestCreateRequestSchema,
  ScriptAccessRequestDecisionRequestSchema,
  ScriptRegisterRequestSchema,
  ScriptUploadSessionRequestSchema
} from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest
} from "../helpers.js";

export function registerScriptRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.post("/api/v1/scripts/upload-session", async (req, reply) => {
    const parsed = ScriptUploadSessionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.scriptStorageBase}/internal/scripts/upload-session`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data)
      }
    );
  });

  server.post("/api/v1/scripts/register", async (req, reply) => {
    const parsed = ScriptRegisterRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.scriptStorageBase}/internal/scripts/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data)
    });
  });

  server.post<{ Params: { scriptId: string } }>("/api/v1/scripts/:scriptId/access-requests", async (req, reply) => {
    const { scriptId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    const parsed = ScriptAccessRequestCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/scripts/${encodeURIComponent(scriptId)}/access-requests`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(parsed.data)
      }
    );
  });

  server.get<{ Params: { scriptId: string } }>("/api/v1/scripts/:scriptId/access-requests", async (req, reply) => {
    const { scriptId } = req.params;
    const querySuffix = buildQuerySuffix(req.query);
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/scripts/${encodeURIComponent(scriptId)}/access-requests${querySuffix}`,
      {
        method: "GET",
        headers: addAuthUserIdHeader({}, userId)
      }
    );
  });

  server.post<{ Params: { scriptId: string; requestId: string } }>("/api/v1/scripts/:scriptId/access-requests/:requestId/approve", async (req, reply) => {
    const { scriptId, requestId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    const parsed = ScriptAccessRequestDecisionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/scripts/${encodeURIComponent(scriptId)}/access-requests/${encodeURIComponent(requestId)}/approve`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(parsed.data)
      }
    );
  });

  server.post<{ Params: { scriptId: string; requestId: string } }>("/api/v1/scripts/:scriptId/access-requests/:requestId/reject", async (req, reply) => {
    const { scriptId, requestId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    const parsed = ScriptAccessRequestDecisionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/scripts/${encodeURIComponent(scriptId)}/access-requests/${encodeURIComponent(requestId)}/reject`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(parsed.data)
      }
    );
  });

  server.get<{ Params: { scriptId: string } }>("/api/v1/scripts/:scriptId/view", async (req, reply) => {
    const { scriptId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.scriptStorageBase}/internal/scripts/${encodeURIComponent(scriptId)}/view?viewerUserId=${encodeURIComponent(userId)}`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  server.post<{ Params: { scriptId: string } }>("/api/v1/scripts/:scriptId/approve-viewer", async (req, reply) => {
    const { scriptId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    // TODO: add validation schema
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.scriptStorageBase}/internal/scripts/${encodeURIComponent(scriptId)}/approve-viewer`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.patch<{ Params: { scriptId: string } }>("/api/v1/scripts/:scriptId/visibility", async (req, reply) => {
    const { scriptId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    // TODO: add validation schema
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.scriptStorageBase}/internal/scripts/${encodeURIComponent(scriptId)}/visibility`,
      {
        method: "PATCH",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });
}
